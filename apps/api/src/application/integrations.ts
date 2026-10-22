/**
 * Integrações (Strava, Lyfta, Hevy e importação manual). Pipeline único:
 * atividade externa → normalização (adaptador) → validação → deduplicação → evento interno → recompensa → livro-razão.
 * Credenciais ficam cifradas no banco e nunca aparecem em respostas ou logs.
 */
import { type ActivityCategory } from '@rpg/engine';
import type { Env } from '../config/env';
import { stravaRefresh } from '../integrations/clients';
import { type ExternalActivity } from '../integrations/normalize';
import { findActivityByExternalId, findActivityTypeByCategory, findOrCreateExercise } from '../persistence/repositories/activities';
import { findConnection, insertEventIfNew, updateConnection, type Provider } from '../persistence/repositories/integrations';
import { inTransaction, type Db, type DbOrTx } from '../persistence/unit-of-work';
import { decryptSecret, encryptSecret } from '../shared/crypto';
import { AppError, badRequest, unprocessable } from '../shared/errors';
import { deleteActivity, recordActivity } from './activities';
import { afterAction } from './hooks';

export type { Provider };

export interface IntegrationSettings {
  weightUnit?: 'kg' | 'lb';
  defaultTypeId?: string;
  typeMap?: Record<string, string>;
}

export interface ImportItem {
  externalId: string;
  category: ActivityCategory;
  title?: string | null;
  date: string;
  durationMin: number;
  distanceKm?: number | null;
  elevationM?: number | null;
  avgHeartRate?: number | null;
  sets: Array<{ exerciseName: string; reps: number; weightKg?: number | null; rir?: number | null }>;
}

export interface StravaEvent {
  object_type: 'activity' | 'athlete';
  object_id: number | string;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number | string;
  event_time: number;
  updates?: Record<string, unknown>;
}

// ------------------------------------------------------------------ Credenciais

export function requireKey(key: string | undefined): string {
  if (!key) throw new AppError(503, 'integration_unconfigured', 'INTEGRATION_ENCRYPTION_KEY não configurada no servidor.');
  return key;
}

export const seal = (value: string, key: string | undefined) => encryptSecret(value, requireKey(key));
export const unseal = (value: string, key: string | undefined) => decryptSecret(value, requireKey(key));

export function getConnection(db: DbOrTx, userId: string, provider: Provider) {
  return findConnection(db, userId, provider);
}

export const stravaConfigured = (env: Env) => Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET);

/** Token de acesso do Strava, renovado quando faltar menos de 1 minuto. O refresh token pode mudar a cada renovação. */
export async function stravaAccessToken(db: Db, env: Env, userId: string): Promise<string> {
  const c = await findConnection(db, userId, 'strava');
  if (!c?.accessTokenEnc || !c.refreshTokenEnc) throw badRequest('Strava não conectado.');
  if (c.expiresAt && c.expiresAt.getTime() > Date.now() + 60_000) return unseal(c.accessTokenEnc, env.INTEGRATION_ENCRYPTION_KEY);
  const t = await stravaRefresh(env.STRAVA_CLIENT_ID!, env.STRAVA_CLIENT_SECRET!, unseal(c.refreshTokenEnc, env.INTEGRATION_ENCRYPTION_KEY));
  await updateConnection(db, c.id, {
    accessTokenEnc: seal(t.access_token, env.INTEGRATION_ENCRYPTION_KEY),
    refreshTokenEnc: seal(t.refresh_token, env.INTEGRATION_ENCRYPTION_KEY),
    expiresAt: new Date(t.expires_at * 1000),
  });
  return t.access_token;
}

// ------------------------------------------------------------------ Pipeline de ingestão

async function resolveType(tx: DbOrTx, userId: string, ext: ExternalActivity, settings: IntegrationSettings) {
  const mapped = settings.typeMap?.[ext.category];
  if (mapped) return mapped;
  const t = await findActivityTypeByCategory(tx, userId, ext.category);
  if (t) return t.id;
  if (settings.defaultTypeId) return settings.defaultTypeId;
  throw unprocessable(`Nenhum tipo de atividade para a categoria "${ext.category}". Crie um em Treinos → Tipos.`);
}

/** Idempotente: reprocessar o mesmo evento não gera ganhos. */
export async function ingestExternalActivity(tx: DbOrTx, userId: string, ext: ExternalActivity, today: string, settings: IntegrationSettings = {}) {
  const typeId = await resolveType(tx, userId, ext, settings);
  const sets = [];
  for (const s of ext.sets) sets.push({ exerciseId: await findOrCreateExercise(tx, userId, s.exerciseName), reps: s.reps, weightKg: s.weightKg, rir: s.rir });
  const result = await recordActivity(
    tx,
    userId,
    {
      typeId,
      title: ext.title,
      date: ext.date > today ? today : ext.date,
      startedAt: ext.startedAt,
      durationMin: ext.durationMin,
      distanceKm: ext.distanceKm,
      elevationM: ext.elevationM,
      avgHeartRate: ext.avgHeartRate,
      notes: ext.notes.join('\n') || null,
      sets,
      source: ext.provider,
      externalId: ext.externalId,
    },
    today,
  );
  await insertEventIfNew(tx, {
    userId,
    provider: ext.provider,
    eventType: 'activity.upsert',
    externalId: ext.externalId,
    dedupeKey: `${userId}:${ext.externalId}:upsert`,
    // Apenas identificadores e o resultado: nenhum payload bruto é retido.
    payload: { activityId: result.activity.id, duplicate: result.duplicate },
    status: result.duplicate ? 'ignored' : 'processed',
    processedAt: new Date(),
  });
  return result;
}

/** Exclusão sincronizada: a atividade é excluída logicamente e sua recompensa estornada. */
export async function removeExternalActivity(tx: DbOrTx, userId: string, provider: Provider, externalId: string) {
  const a = await findActivityByExternalId(tx, userId, provider, externalId);
  if (!a) return null;
  return deleteActivity(tx, userId, a.id, `Excluída em ${provider}`, null);
}

/** Ingere uma lista (cada item na sua transação) e reavalia o progresso uma vez ao final. */
export async function ingestBatch(db: Db, userId: string, list: ExternalActivity[], today: string, settings: IntegrationSettings) {
  const summary = { created: 0, duplicates: 0, errors: [] as string[] };
  for (const ext of list) {
    try {
      const r = await inTransaction(db, (tx) => ingestExternalActivity(tx, userId, ext, today, settings));
      if (r.duplicate) summary.duplicates++;
      else summary.created++;
    } catch (err) {
      summary.errors.push(`${ext.externalId}: ${(err as Error).message}`);
    }
  }
  await inTransaction(db, (tx) => afterAction(tx, userId, today));
  return summary;
}
