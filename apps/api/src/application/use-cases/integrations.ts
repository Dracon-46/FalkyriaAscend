import { timingSafeEqual } from 'node:crypto';
import { addDays } from '@rpg/engine';
import type { Env } from '../../config/env';
import {
  hevyListWorkouts,
  lyftaListWorkouts,
  stravaAuthorizeUrl,
  stravaExchange,
  stravaGetActivity,
  stravaListActivities,
  stravaRevoke,
} from '../../integrations/clients';
import { normalizeHevy, normalizeLyfta, normalizeStrava, type ExternalActivity } from '../../integrations/normalize';
import { findActivityType, listActivitiesFromSource } from '../../persistence/repositories/activities';
import {
  findConnection,
  findStravaConnectionByAthlete,
  insertEventIfNew,
  listConnections,
  markEvent,
  recentEvents,
  updateConnection,
  updateConnectionOf,
  upsertConnection,
  type Provider,
} from '../../persistence/repositories/integrations';
import { inTransaction, type Db, type DbOrTx } from '../../persistence/unit-of-work';
import { sha256 } from '../../shared/crypto';
import { AppError, badRequest, notFound } from '../../shared/errors';
import { audit } from '../audit';
import { afterAction } from '../hooks';
import { getTimezone, todayFor } from '../time';
import {
  ingestBatch,
  ingestExternalActivity,
  removeExternalActivity,
  seal,
  stravaAccessToken,
  stravaConfigured,
  unseal,
  type ImportItem,
  type IntegrationSettings,
  type StravaEvent,
} from '../integrations';

// ------------------------------------------------------------------ Casos de uso

export async function integrationsOverview(db: DbOrTx, userId: string, env: Env) {
  const rows = await listConnections(db, userId);
  const safe = (p: Provider) => {
    const c = rows.find((r) => r.provider === p);
    return c
      ? {
          provider: p,
          status: c.status,
          externalAccountId: c.externalAccountId,
          scopes: c.scopes,
          lastSyncAt: c.lastSyncAt,
          lastError: c.lastError,
          settings: c.settings,
        }
      : { provider: p, status: 'disconnected' as const };
  };
  return {
    encryptionConfigured: Boolean(env.INTEGRATION_ENCRYPTION_KEY),
    strava: { ...safe('strava'), serverConfigured: stravaConfigured(env) },
    lyfta: safe('lyfta'),
    hevy: safe('hevy'),
    events: await recentEvents(db, userId),
  };
}

/** Preferências (unidade de peso, mapeamento de tipos); os tipos precisam ser do usuário. */
export async function updateIntegrationSettings(db: Db, userId: string, provider: Provider, settings: IntegrationSettings) {
  const c = await findConnection(db, userId, provider);
  if (!c) throw notFound('Conexão');
  for (const typeId of [settings.defaultTypeId, ...Object.values(settings.typeMap ?? {})].filter(Boolean) as string[]) {
    if (!(await findActivityType(db, userId, typeId))) throw badRequest('Tipo de atividade inválido');
  }
  return { settings: (await updateConnection(db, c.id, { settings })).settings };
}

/** Conecta Lyfta ou Hevy por chave de API (guardada cifrada). */
export async function connectWithApiKey(db: Db, userId: string, provider: 'lyfta' | 'hevy', apiKey: string, env: Env) {
  const enc = seal(apiKey, env.INTEGRATION_ENCRYPTION_KEY);
  await upsertConnection(
    db,
    userId,
    provider,
    { status: 'connected', accessTokenEnc: enc, settings: provider === 'lyfta' ? { weightUnit: 'kg' } : {} },
    { status: 'connected', accessTokenEnc: enc, lastError: null },
  );
  await audit(db, { actorId: userId, userId, action: 'integration.connect', entityType: 'integration_connections', entityId: provider });
  return { provider, status: 'connected' };
}

/** Sincroniza uma janela recente e reconcilia por id externo (sem duplicar). */
export async function syncProvider(db: Db, userId: string, provider: Provider, days: number, env: Env, now: Date) {
  const c = await findConnection(db, userId, provider);
  if (!c || c.status !== 'connected') throw badRequest('Integração não conectada.');
  const tz = await getTimezone(db, userId);
  const today = await todayFor(db, userId, now);
  const from = addDays(today, -(days - 1));
  let external: ExternalActivity[] = [];
  try {
    if (provider === 'lyfta') {
      const key = unseal(c.accessTokenEnc!, env.INTEGRATION_ENCRYPTION_KEY);
      for (let page = 1; page <= 10; page++) {
        const res = await lyftaListWorkouts(env.LYFTA_API_BASE, key, from, today, page);
        external.push(...(res.workouts ?? []).map((w) => normalizeLyfta(w, tz, c.settings.weightUnit ?? 'kg')));
        if (!res.total_pages || page >= res.total_pages) break;
      }
    } else if (provider === 'hevy') {
      const key = unseal(c.accessTokenEnc!, env.INTEGRATION_ENCRYPTION_KEY);
      for (let page = 1; page <= 10; page++) {
        const res = await hevyListWorkouts(key, page);
        const batch = (res.workouts ?? []).map((w) => normalizeHevy(w, tz));
        external.push(...batch.filter((b) => b.date >= from));
        if (!res.page_count || page >= res.page_count || batch.some((b) => b.date < from)) break;
      }
    } else {
      const token = await stravaAccessToken(db, env, userId);
      const after = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000);
      for (let page = 1; page <= 5; page++) {
        const list = await stravaListActivities(env.STRAVA_API_BASE, token, after, page);
        external.push(...list.map((a) => normalizeStrava(a, tz)));
        if (list.length < 50) break;
      }
    }
  } catch (err) {
    await updateConnection(db, c.id, { lastError: (err as Error).message });
    throw err;
  }
  external = external.filter((e) => e.date <= today);
  const r = await ingestBatch(db, userId, external, today, c.settings);
  await updateConnection(db, c.id, { lastSyncAt: new Date(), lastError: r.errors[0] ?? null });
  return { fetched: external.length, ...r };
}

/** Desconecta: revoga no Strava quando possível e apaga as credenciais locais. */
export async function disconnectProvider(db: Db, userId: string, provider: Provider, env: Env): Promise<void> {
  const c = await findConnection(db, userId, provider);
  if (!c) return;
  if (provider === 'strava' && c.accessTokenEnc && stravaConfigured(env)) {
    await stravaRevoke(env.STRAVA_CLIENT_ID!, env.STRAVA_CLIENT_SECRET!, unseal(c.accessTokenEnc, env.INTEGRATION_ENCRYPTION_KEY)).catch(() => undefined);
  }
  await updateConnection(db, c.id, { status: 'revoked', accessTokenEnc: null, refreshTokenEnc: null });
  await audit(db, { actorId: userId, userId, action: 'integration.disconnect', entityType: 'integration_connections', entityId: provider });
}

/** Importação manual de atividades exportadas (ex.: export oficial convertido). */
export async function importActivities(db: Db, userId: string, items: ImportItem[], now: Date) {
  const today = await todayFor(db, userId, now);
  const list: ExternalActivity[] = items.map((it) => ({
    provider: 'import',
    externalId: it.externalId,
    category: it.category,
    title: it.title ?? null,
    date: it.date,
    startedAt: null,
    durationMin: it.durationMin,
    distanceKm: it.distanceKm ?? null,
    elevationM: it.elevationM ?? null,
    avgHeartRate: it.avgHeartRate ?? null,
    sets: it.sets.map((s) => ({ exerciseName: s.exerciseName, reps: s.reps, weightKg: s.weightKg ?? null, rir: s.rir ?? null })),
    notes: ['Importado manualmente'],
  }));
  return { received: items.length, ...(await ingestBatch(db, userId, list, today, {})) };
}

// ------------------------------------------------------------------ Strava OAuth e webhook

export function stravaAuthorization(env: Env, state: string) {
  if (!stravaConfigured(env)) throw new AppError(503, 'integration_unconfigured', 'STRAVA_CLIENT_ID/SECRET não configurados no servidor.');
  return { url: stravaAuthorizeUrl(env.STRAVA_CLIENT_ID!, `${env.APP_ORIGIN}/api/integrations/strava/callback`, state) };
}

/** Compara o `state` recebido com o do cookie em tempo constante. */
export function stateMatches(received: string | undefined, expected: string | undefined): boolean {
  return !!received && !!expected && received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

/** Troca o código OAuth por tokens e grava a conexão (tokens cifrados). */
export async function completeStravaAuthorization(db: Db, userId: string, code: string, grantedScope: string | undefined, env: Env): Promise<void> {
  const t = await stravaExchange(env.STRAVA_CLIENT_ID!, env.STRAVA_CLIENT_SECRET!, code);
  const scopes = t.scope ?? grantedScope ?? '';
  const values = {
    status: 'connected' as const,
    externalAccountId: t.athlete ? String(t.athlete.id) : null,
    scopes,
    accessTokenEnc: seal(t.access_token, env.INTEGRATION_ENCRYPTION_KEY),
    refreshTokenEnc: seal(t.refresh_token, env.INTEGRATION_ENCRYPTION_KEY),
    expiresAt: new Date(t.expires_at * 1000),
    lastError: scopes.includes('activity:read') ? null : 'Permissão de leitura de atividades não concedida.',
  };
  await upsertConnection(db, userId, 'strava', values, values);
  await audit(db, { actorId: userId, userId, action: 'integration.connect', entityType: 'integration_connections', entityId: 'strava', meta: { scopes } });
}

/** O segredo do caminho do webhook é comparado por hash em tempo constante. */
export function webhookSecretOk(env: Env, secret: string): boolean {
  if (!env.STRAVA_WEBHOOK_VERIFY_TOKEN) return false;
  return timingSafeEqual(Buffer.from(sha256(secret)), Buffer.from(sha256(env.STRAVA_WEBHOOK_VERIFY_TOKEN)));
}

export function assertWebhookSecret(env: Env, secret: string): void {
  if (!webhookSecretOk(env, secret)) throw new AppError(403, 'forbidden', 'Webhook inválido');
}

/** Handshake de assinatura do webhook: devolve o desafio quando o token confere. */
export function verifyStravaSubscription(env: Env, secret: string, q: Record<string, string>) {
  if (!webhookSecretOk(env, secret) || q['hub.mode'] !== 'subscribe' || q['hub.verify_token'] !== env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    throw new AppError(403, 'forbidden', 'Verificação de webhook inválida');
  }
  return { 'hub.challenge': q['hub.challenge'] };
}

/**
 * Registra o evento (deduplicado) e devolve o trabalho a executar depois da resposta 200.
 * Eventos não são assinados pelo Strava: valida-se o segredo da URL e o owner_id conhecido,
 * e a atividade é sempre relida pela API autenticada.
 */
export async function receiveStravaEvent(db: Db, env: Env, secret: string, ev: StravaEvent, now: () => Date): Promise<(() => Promise<void>) | null> {
  assertWebhookSecret(env, secret);
  const conn = await findStravaConnectionByAthlete(db, String(ev.owner_id));
  const event = await insertEventIfNew(db, {
    userId: conn?.userId ?? null,
    provider: 'strava',
    eventType: `${ev.object_type}.${ev.aspect_type}`,
    externalId: String(ev.object_id),
    dedupeKey: `${ev.object_type}:${ev.object_id}:${ev.aspect_type}:${ev.event_time}`,
    payload: { updates: ev.updates ?? null },
    status: conn ? 'received' : 'ignored',
  });
  if (!conn || !event) return null;
  return () => processStravaEvent(db, env, conn.userId, event.id, ev, now());
}

async function processStravaEvent(db: Db, env: Env, userId: string, eventId: string, ev: StravaEvent, now: Date): Promise<void> {
  try {
    const today = await todayFor(db, userId, now);
    if (ev.object_type === 'athlete' && ev.updates?.authorized === 'false') {
      // Desautorização: remove credenciais; os dados derivados devem ser excluídos (política Strava §7.4).
      await inTransaction(db, async (tx) => {
        for (const a of await listActivitiesFromSource(tx, userId, 'strava'))
          if (a.externalId) await removeExternalActivity(tx, userId, 'strava', a.externalId);
        await updateConnectionOf(tx, userId, 'strava', { status: 'revoked', accessTokenEnc: null, refreshTokenEnc: null });
      });
      return markEvent(db, eventId, 'processed');
    }
    if (ev.object_type !== 'activity') return markEvent(db, eventId, 'ignored');
    if (ev.aspect_type === 'delete') {
      await inTransaction(db, async (tx) => {
        await removeExternalActivity(tx, userId, 'strava', String(ev.object_id));
        await afterAction(tx, userId, today);
      });
      return markEvent(db, eventId, 'processed');
    }
    if (ev.aspect_type === 'update') return markEvent(db, eventId, 'ignored'); // título/privacidade não afetam recompensas
    const token = await stravaAccessToken(db, env, userId);
    const detail = await stravaGetActivity(env.STRAVA_API_BASE, token, String(ev.object_id));
    const tz = await getTimezone(db, userId);
    const c = await findConnection(db, userId, 'strava');
    await inTransaction(db, async (tx) => {
      await ingestExternalActivity(tx, userId, normalizeStrava(detail, tz), today, c?.settings ?? {});
      await afterAction(tx, userId, today);
    });
    return markEvent(db, eventId, 'processed');
  } catch (err) {
    return markEvent(db, eventId, 'error', (err as Error).message);
  }
}
