import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { addDays, ACTIVITY_CATEGORIES } from '@rpg/engine';
import { activities, activityTypes, integrationConnections, integrationEvents } from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';
import { AppError, badRequest, notFound } from '../lib/errors';
import { noContent, parse, requireUser } from '../lib/http';
import { audit } from '../services/audit';
import { afterAction } from '../services/hooks';
import { getTimezone, todayFor } from '../services/time';
import type { AppContext } from '../context';
import {
  hevyListWorkouts,
  lyftaListWorkouts,
  stravaAuthorizeUrl,
  stravaExchange,
  stravaGetActivity,
  stravaListActivities,
  stravaRefresh,
  stravaRevoke,
} from './clients';
import { normalizeHevy, normalizeLyfta, normalizeStrava, type ExternalActivity } from './normalize';
import { getConnection, ingestExternalActivity, removeExternalActivity, seal, unseal, type Provider } from './service';

const STATE_COOKIE = 'rpg_strava_state';

const importItem = z.object({
  externalId: z.string().min(1).max(120),
  category: z.enum(ACTIVITY_CATEGORIES),
  title: z.string().max(160).nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMin: z.number().int().min(1).max(1440),
  distanceKm: z.number().min(0).max(1000).nullish(),
  elevationM: z.number().int().min(0).max(20000).nullish(),
  avgHeartRate: z.number().int().min(30).max(250).nullish(),
  sets: z
    .array(z.object({ exerciseName: z.string().min(1).max(120), reps: z.number().int().min(1).max(1000), weightKg: z.number().min(0).max(1000).nullish(), rir: z.number().min(0).max(10).nullish() }))
    .max(200)
    .default([]),
});

export async function registerIntegrationRoutes(app: FastifyInstance, ctx: AppContext) {
  const env = ctx.env;
  const stravaConfigured = () => Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET);

  app.get('/api/integrations', async (req) => {
    const me = requireUser(req);
    const rows = await ctx.db.select().from(integrationConnections).where(eq(integrationConnections.userId, me.id));
    const recent = await ctx.db.select().from(integrationEvents).where(eq(integrationEvents.userId, me.id)).orderBy(integrationEvents.receivedAt).limit(50);
    const safe = (p: Provider) => {
      const c = rows.find((r) => r.provider === p);
      return c
        ? { provider: p, status: c.status, externalAccountId: c.externalAccountId, scopes: c.scopes, lastSyncAt: c.lastSyncAt, lastError: c.lastError, settings: c.settings }
        : { provider: p, status: 'disconnected' as const };
    };
    return {
      encryptionConfigured: Boolean(env.INTEGRATION_ENCRYPTION_KEY),
      strava: { ...safe('strava'), serverConfigured: stravaConfigured() },
      lyfta: safe('lyfta'),
      hevy: safe('hevy'),
      events: recent.reverse(),
    };
  });

  /** Atualiza preferências (unidade de peso, mapeamento de tipos). */
  app.put('/api/integrations/:provider/settings', async (req) => {
    const me = requireUser(req);
    const { provider } = parse(z.object({ provider: z.enum(['strava', 'lyfta', 'hevy']) }), req.params);
    const settings = parse(
      z.object({ weightUnit: z.enum(['kg', 'lb']).optional(), defaultTypeId: z.uuid().optional(), typeMap: z.record(z.enum(ACTIVITY_CATEGORIES), z.uuid()).optional() }),
      req.body,
    );
    const c = await getConnection(ctx.db, me.id, provider);
    if (!c) throw notFound('Conexão');
    for (const typeId of [settings.defaultTypeId, ...Object.values(settings.typeMap ?? {})].filter(Boolean) as string[]) {
      const [t] = await ctx.db.select({ id: activityTypes.id }).from(activityTypes).where(and(eq(activityTypes.id, typeId), eq(activityTypes.userId, me.id)));
      if (!t) throw badRequest('Tipo de atividade inválido');
    }
    const [u] = await ctx.db.update(integrationConnections).set({ settings, updatedAt: new Date() }).where(eq(integrationConnections.id, c.id)).returning();
    return { settings: u!.settings };
  });

  // ---------------------------------------------------------------- Chave de API (Lyfta / Hevy)

  app.post('/api/integrations/:provider/key', async (req) => {
    const me = requireUser(req);
    const { provider } = parse(z.object({ provider: z.enum(['lyfta', 'hevy']) }), req.params);
    const { apiKey } = parse(z.object({ apiKey: z.string().trim().min(10).max(500) }), req.body);
    const enc = seal(apiKey, env.INTEGRATION_ENCRYPTION_KEY);
    await ctx.db
      .insert(integrationConnections)
      .values({ userId: me.id, provider, status: 'connected', accessTokenEnc: enc, settings: provider === 'lyfta' ? { weightUnit: 'kg' } : {} })
      .onConflictDoUpdate({ target: [integrationConnections.userId, integrationConnections.provider], set: { status: 'connected', accessTokenEnc: enc, lastError: null, updatedAt: new Date() } });
    await audit(ctx.db, { actorId: me.id, userId: me.id, action: 'integration.connect', entityType: 'integration_connections', entityId: provider });
    return { provider, status: 'connected' };
  });

  /** Sincroniza uma janela recente (padrão 14 dias) e reconcilia por id externo (sem duplicar). */
  app.post('/api/integrations/:provider/sync', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (req) => {
    const me = requireUser(req);
    const { provider } = parse(z.object({ provider: z.enum(['strava', 'lyfta', 'hevy']) }), req.params);
    const { days } = parse(z.object({ days: z.number().int().min(1).max(90).default(14) }), req.body ?? {});
    const c = await getConnection(ctx.db, me.id, provider);
    if (!c || c.status !== 'connected') throw badRequest('Integração não conectada.');
    const tz = await getTimezone(ctx.db, me.id);
    const today = await todayFor(ctx.db, me.id, ctx.now());
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
        const token = await stravaAccessToken(me.id);
        const after = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000);
        for (let page = 1; page <= 5; page++) {
          const list = await stravaListActivities(env.STRAVA_API_BASE, token, after, page);
          external.push(...list.map((a) => normalizeStrava(a, tz)));
          if (list.length < 50) break;
        }
      }
    } catch (err) {
      await ctx.db.update(integrationConnections).set({ lastError: (err as Error).message, updatedAt: new Date() }).where(eq(integrationConnections.id, c.id));
      throw err;
    }
    external = external.filter((e) => e.date <= today);
    const summary = { fetched: external.length, created: 0, duplicates: 0, errors: [] as string[] };
    for (const ext of external) {
      try {
        const r = await ctx.db.transaction((tx) => ingestExternalActivity(tx, me.id, ext, today, c.settings));
        if (r.duplicate) summary.duplicates++;
        else summary.created++;
      } catch (err) {
        summary.errors.push(`${ext.externalId}: ${(err as Error).message}`);
      }
    }
    await ctx.db.transaction(async (tx) => afterAction(tx, me.id, today));
    await ctx.db.update(integrationConnections).set({ lastSyncAt: new Date(), lastError: summary.errors[0] ?? null, updatedAt: new Date() }).where(eq(integrationConnections.id, c.id));
    return summary;
  });

  app.delete('/api/integrations/:provider', async (req, reply) => {
    const me = requireUser(req);
    const { provider } = parse(z.object({ provider: z.enum(['strava', 'lyfta', 'hevy']) }), req.params);
    const c = await getConnection(ctx.db, me.id, provider);
    if (!c) return noContent(reply);
    if (provider === 'strava' && c.accessTokenEnc && stravaConfigured()) {
      await stravaRevoke(env.STRAVA_CLIENT_ID!, env.STRAVA_CLIENT_SECRET!, unseal(c.accessTokenEnc, env.INTEGRATION_ENCRYPTION_KEY)).catch(() => undefined);
    }
    await ctx.db
      .update(integrationConnections)
      .set({ status: 'revoked', accessTokenEnc: null, refreshTokenEnc: null, updatedAt: new Date() })
      .where(eq(integrationConnections.id, c.id));
    await audit(ctx.db, { actorId: me.id, userId: me.id, action: 'integration.disconnect', entityType: 'integration_connections', entityId: provider });
    return noContent(reply);
  });

  // ---------------------------------------------------------------- Importação autorizada (JSON)

  /** Importação manual de atividades exportadas (ex.: export oficial do Lyfta/Strava convertido). */
  app.post('/api/import/activities', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const me = requireUser(req);
    const items = parse(z.array(importItem).min(1).max(500), req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const summary = { received: items.length, created: 0, duplicates: 0, errors: [] as string[] };
    for (const it of items) {
      const ext: ExternalActivity = {
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
      };
      try {
        const r = await ctx.db.transaction((tx) => ingestExternalActivity(tx, me.id, ext, today));
        if (r.duplicate) summary.duplicates++;
        else summary.created++;
      } catch (err) {
        summary.errors.push(`${it.externalId}: ${(err as Error).message}`);
      }
    }
    await ctx.db.transaction(async (tx) => afterAction(tx, me.id, today));
    return summary;
  });

  // ---------------------------------------------------------------- Strava OAuth

  async function stravaAccessToken(userId: string): Promise<string> {
    const c = await getConnection(ctx.db, userId, 'strava');
    if (!c?.accessTokenEnc || !c.refreshTokenEnc) throw badRequest('Strava não conectado.');
    if (c.expiresAt && c.expiresAt.getTime() > Date.now() + 60_000) return unseal(c.accessTokenEnc, env.INTEGRATION_ENCRYPTION_KEY);
    const t = await stravaRefresh(env.STRAVA_CLIENT_ID!, env.STRAVA_CLIENT_SECRET!, unseal(c.refreshTokenEnc, env.INTEGRATION_ENCRYPTION_KEY));
    await ctx.db
      .update(integrationConnections)
      .set({
        accessTokenEnc: seal(t.access_token, env.INTEGRATION_ENCRYPTION_KEY),
        refreshTokenEnc: seal(t.refresh_token, env.INTEGRATION_ENCRYPTION_KEY),
        expiresAt: new Date(t.expires_at * 1000),
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, c.id));
    return t.access_token;
  }

  const redirectUri = () => `${env.APP_ORIGIN}/api/integrations/strava/callback`;

  app.get('/api/integrations/strava/connect', async (req, reply) => {
    requireUser(req);
    if (!stravaConfigured()) throw new AppError(503, 'integration_unconfigured', 'STRAVA_CLIENT_ID/SECRET não configurados no servidor.');
    const state = randomToken(16);
    reply.setCookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/api/integrations/strava', maxAge: 600 });
    return { url: stravaAuthorizeUrl(env.STRAVA_CLIENT_ID!, redirectUri(), state) };
  });

  app.get('/api/integrations/strava/callback', async (req, reply) => {
    const me = requireUser(req);
    const q = parse(z.object({ code: z.string().optional(), state: z.string().optional(), scope: z.string().optional(), error: z.string().optional() }), req.query);
    const expected = req.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: '/api/integrations/strava' });
    if (q.error) return reply.redirect('/configuracoes?aba=integracoes&strava=negado');
    if (!q.code || !q.state || !expected || q.state.length !== expected.length || !timingSafeEqual(Buffer.from(q.state), Buffer.from(expected))) {
      throw badRequest('Estado OAuth inválido. Tente conectar novamente.');
    }
    const t = await stravaExchange(env.STRAVA_CLIENT_ID!, env.STRAVA_CLIENT_SECRET!, q.code);
    const scopes = t.scope ?? q.scope ?? '';
    const values = {
      status: 'connected' as const,
      externalAccountId: t.athlete ? String(t.athlete.id) : null,
      scopes,
      accessTokenEnc: seal(t.access_token, env.INTEGRATION_ENCRYPTION_KEY),
      refreshTokenEnc: seal(t.refresh_token, env.INTEGRATION_ENCRYPTION_KEY),
      expiresAt: new Date(t.expires_at * 1000),
      lastError: scopes.includes('activity:read') ? null : 'Permissão de leitura de atividades não concedida.',
      updatedAt: new Date(),
    };
    await ctx.db
      .insert(integrationConnections)
      .values({ userId: me.id, provider: 'strava', ...values })
      .onConflictDoUpdate({ target: [integrationConnections.userId, integrationConnections.provider], set: values });
    await audit(ctx.db, { actorId: me.id, userId: me.id, action: 'integration.connect', entityType: 'integration_connections', entityId: 'strava', meta: { scopes } });
    return reply.redirect('/configuracoes?aba=integracoes&strava=conectado');
  });

  // ---------------------------------------------------------------- Strava webhook

  const webhookSecretOk = (secret: string) => {
    if (!env.STRAVA_WEBHOOK_VERIFY_TOKEN) return false;
    const a = Buffer.from(sha256(secret));
    const b = Buffer.from(sha256(env.STRAVA_WEBHOOK_VERIFY_TOKEN));
    return timingSafeEqual(a, b);
  };

  /** Handshake de assinatura: responder 200 com hub.challenge em até 2 s. */
  app.get('/api/integrations/strava/webhook/:secret', async (req) => {
    const { secret } = req.params as { secret: string };
    const q = req.query as Record<string, string>;
    if (!webhookSecretOk(secret) || q['hub.mode'] !== 'subscribe' || q['hub.verify_token'] !== env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
      throw new AppError(403, 'forbidden', 'Verificação de webhook inválida');
    }
    return { 'hub.challenge': q['hub.challenge'] };
  });

  /**
   * Eventos não são assinados pelo Strava: valida-se o segredo da URL e o owner_id conhecido,
   * e a atividade é sempre relida pela API autenticada. Responde 200 imediatamente e processa depois.
   */
  app.post('/api/integrations/strava/webhook/:secret', async (req, reply) => {
    const { secret } = req.params as { secret: string };
    if (!webhookSecretOk(secret)) throw new AppError(403, 'forbidden', 'Webhook inválido');
    const ev = parse(
      z.object({
        object_type: z.enum(['activity', 'athlete']),
        object_id: z.union([z.number(), z.string()]),
        aspect_type: z.enum(['create', 'update', 'delete']),
        owner_id: z.union([z.number(), z.string()]),
        subscription_id: z.union([z.number(), z.string()]).optional(),
        event_time: z.number(),
        updates: z.record(z.string(), z.unknown()).optional(),
      }),
      req.body,
    );
    const [conn] = await ctx.db
      .select()
      .from(integrationConnections)
      .where(and(eq(integrationConnections.provider, 'strava'), eq(integrationConnections.externalAccountId, String(ev.owner_id))));
    const dedupeKey = `${ev.object_type}:${ev.object_id}:${ev.aspect_type}:${ev.event_time}`;
    const inserted = await ctx.db
      .insert(integrationEvents)
      .values({ userId: conn?.userId ?? null, provider: 'strava', eventType: `${ev.object_type}.${ev.aspect_type}`, externalId: String(ev.object_id), dedupeKey, payload: { updates: ev.updates ?? null }, status: conn ? 'received' : 'ignored' })
      .onConflictDoNothing()
      .returning();
    reply.status(200).send({ ok: true });
    if (!conn || inserted.length === 0) return reply;
    setImmediate(() => {
      processStravaEvent(conn.userId, inserted[0]!.id, ev).catch(() => undefined);
    });
    return reply;
  });

  async function processStravaEvent(
    userId: string,
    eventId: string,
    ev: { object_type: string; object_id: number | string; aspect_type: string; updates?: Record<string, unknown> },
  ) {
    const mark = (status: 'processed' | 'ignored' | 'error', error?: string) =>
      ctx.db.update(integrationEvents).set({ status, error: error ?? null, processedAt: new Date() }).where(eq(integrationEvents.id, eventId));
    try {
      const today = await todayFor(ctx.db, userId, ctx.now());
      if (ev.object_type === 'athlete' && ev.updates?.authorized === 'false') {
        // Desautorização: remove credenciais; os dados derivados devem ser excluídos (política Strava §7.4).
        await ctx.db.transaction(async (tx) => {
          const list = await tx.select().from(activities).where(and(eq(activities.userId, userId), eq(activities.source, 'strava')));
          for (const a of list) if (a.externalId) await removeExternalActivity(tx, userId, 'strava', a.externalId);
          await tx.update(integrationConnections).set({ status: 'revoked', accessTokenEnc: null, refreshTokenEnc: null, updatedAt: new Date() }).where(and(eq(integrationConnections.userId, userId), eq(integrationConnections.provider, 'strava')));
        });
        return mark('processed');
      }
      if (ev.object_type !== 'activity') return mark('ignored');
      if (ev.aspect_type === 'delete') {
        await ctx.db.transaction(async (tx) => {
          await removeExternalActivity(tx, userId, 'strava', String(ev.object_id));
          await afterAction(tx, userId, today);
        });
        return mark('processed');
      }
      if (ev.aspect_type === 'update') return mark('ignored'); // título/privacidade não afetam recompensas
      const token = await stravaAccessToken(userId);
      const detail = await stravaGetActivity(env.STRAVA_API_BASE, token, String(ev.object_id));
      const tz = await getTimezone(ctx.db, userId);
      const c = await getConnection(ctx.db, userId, 'strava');
      await ctx.db.transaction(async (tx) => {
        await ingestExternalActivity(tx, userId, normalizeStrava(detail, tz), today, c?.settings ?? {});
        await afterAction(tx, userId, today);
      });
      return mark('processed');
    } catch (err) {
      return mark('error', (err as Error).message);
    }
  }
}
