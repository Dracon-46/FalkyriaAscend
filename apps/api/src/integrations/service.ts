import { and, eq, ilike } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { activities, activityTypes, exercises, integrationConnections, integrationEvents } from '../db/schema';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { AppError, unprocessable } from '../lib/errors';
import { deleteActivity, recordActivity } from '../services/activities';
import type { ExternalActivity } from './normalize';

export type Provider = 'strava' | 'lyfta' | 'hevy';

export function requireKey(key: string | undefined): string {
  if (!key) throw new AppError(503, 'integration_unconfigured', 'INTEGRATION_ENCRYPTION_KEY não configurada no servidor.');
  return key;
}

export const seal = (value: string, key: string | undefined) => encryptSecret(value, requireKey(key));
export const unseal = (value: string, key: string | undefined) => decryptSecret(value, requireKey(key));

export async function getConnection(db: DbOrTx, userId: string, provider: Provider) {
  const [c] = await db
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.userId, userId), eq(integrationConnections.provider, provider)));
  return c ?? null;
}

async function resolveType(tx: DbOrTx, userId: string, ext: ExternalActivity, settings: { defaultTypeId?: string; typeMap?: Record<string, string> }) {
  const mapped = settings.typeMap?.[ext.category];
  if (mapped) return mapped;
  const [t] = await tx
    .select({ id: activityTypes.id })
    .from(activityTypes)
    .where(and(eq(activityTypes.userId, userId), eq(activityTypes.category, ext.category)))
    .limit(1);
  if (t) return t.id;
  if (settings.defaultTypeId) return settings.defaultTypeId;
  throw unprocessable(`Nenhum tipo de atividade para a categoria "${ext.category}". Crie um em Treinos → Tipos.`);
}

async function resolveExercise(tx: DbOrTx, userId: string, name: string) {
  const [e] = await tx.select({ id: exercises.id }).from(exercises).where(and(eq(exercises.userId, userId), ilike(exercises.name, name))).limit(1);
  if (e) return e.id;
  const [created] = await tx.insert(exercises).values({ userId, name, muscleGroup: 'importado' }).returning({ id: exercises.id });
  return created!.id;
}

/**
 * Pipeline: atividade externa → normalização (já feita) → validação → deduplicação →
 * evento interno → recompensa → livro-razão. Idempotente: reprocessar o mesmo evento não gera ganhos.
 */
export async function ingestExternalActivity(
  tx: DbOrTx,
  userId: string,
  ext: ExternalActivity,
  today: string,
  settings: { defaultTypeId?: string; typeMap?: Record<string, string> } = {},
) {
  const dedupeKey = `${userId}:${ext.externalId}:upsert`;
  const typeId = await resolveType(tx, userId, ext, settings);
  const sets = [];
  for (const s of ext.sets) sets.push({ exerciseId: await resolveExercise(tx, userId, s.exerciseName), reps: s.reps, weightKg: s.weightKg, rir: s.rir });
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
  await tx
    .insert(integrationEvents)
    .values({
      userId,
      provider: ext.provider,
      eventType: 'activity.upsert',
      externalId: ext.externalId,
      dedupeKey,
      // Apenas identificadores e o resultado: nenhum payload bruto é retido.
      payload: { activityId: result.activity.id, duplicate: result.duplicate },
      status: result.duplicate ? 'ignored' : 'processed',
      processedAt: new Date(),
    })
    .onConflictDoNothing();
  return result;
}

/** Exclusão sincronizada: a atividade é excluída logicamente e sua recompensa estornada. */
export async function removeExternalActivity(tx: DbOrTx, userId: string, provider: Provider, externalId: string) {
  const [a] = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.source, provider), eq(activities.externalId, externalId)));
  if (!a) return null;
  return deleteActivity(tx, userId, a.id, `Excluída em ${provider}`, null);
}
