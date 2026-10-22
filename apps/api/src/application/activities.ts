import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { computeQuickReward, computeTimedReward } from '@rpg/engine';
import type { z } from 'zod';
import type { activityInput, quickLogInput } from '@rpg/contracts';
import type { DbOrTx } from '../persistence/client';
import { activities, activitySets, activityTypes, attributes, exercises, personalRecords, quickLogs, RECORD_SOURCES } from '../persistence/schema';
import { badRequest, notFound, unprocessable } from '../shared/errors';
import { getActiveConfig } from './config';
import { xpTodayBySource } from './gameplay';
import { grantReward, reverseGrant } from './rewards';

type Source = (typeof RECORD_SOURCES)[number];

/**
 * Atividade normalizada: formato interno único para registros manuais e integrações.
 * Atividade externa → normalização → validação → deduplicação → evento interno → recompensa.
 */
export interface NormalizedActivity {
  typeId: string;
  title?: string | null;
  date: string;
  startedAt?: Date | null;
  durationMin: number;
  distanceKm?: number | null;
  elevationM?: number | null;
  avgHeartRate?: number | null;
  perceivedEffort?: number | null;
  notes?: string | null;
  sets?: Array<{ exerciseId: string; reps: number; weightKg?: number | null; rir?: number | null }>;
  source: Source;
  externalId?: string | null;
}

export function toNormalized(input: z.infer<typeof activityInput>, today: string): NormalizedActivity {
  return { ...input, date: input.date ?? today, source: 'manual', externalId: null };
}

/** Estimativa de 1RM (Epley). */
export function epley1rm(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10;
}

async function detectRecords(tx: DbOrTx, userId: string, activityId: string, a: NormalizedActivity, category: string) {
  const found: string[] = [];
  const best = async (kind: string, exerciseId: string | null) => {
    const conds = [eq(personalRecords.userId, userId), eq(personalRecords.kind, kind)];
    if (exerciseId) conds.push(eq(personalRecords.exerciseId, exerciseId));
    const [r] = await tx.select().from(personalRecords).where(and(...conds)).orderBy(desc(personalRecords.value)).limit(1);
    return r ? Number(r.value) : null;
  };
  const record = async (kind: string, value: number, unit: string, exerciseId: string | null, label: string, lowerIsBetter = false) => {
    const prev = await best(kind, exerciseId);
    const improved = prev === null || (lowerIsBetter ? value < prev : value > prev);
    if (!improved || value <= 0) return;
    await tx.insert(personalRecords).values({ userId, kind, exerciseId, value, unit, activityId, achievedOn: a.date });
    found.push(label);
  };
  if (category === 'run' && a.distanceKm && a.distanceKm > 0) {
    await record('longest_run_km', a.distanceKm, 'km', null, `Maior corrida: ${a.distanceKm} km`);
    if (a.distanceKm >= 5) {
      // Ritmo médio (min/km): menor é melhor. Armazenado negativo para reaproveitar "maior valor".
      const pace = Math.round((a.durationMin / a.distanceKm) * 100) / 100;
      await record('best_pace_5k_plus', -pace, 'min/km (neg.)', null, `Melhor ritmo (≥5 km): ${pace} min/km`);
    }
  }
  for (const s of a.sets ?? []) {
    if (!s.weightKg || s.reps <= 0) continue;
    await record('estimated_1rm', epley1rm(s.weightKg, s.reps), 'kg', s.exerciseId, `1RM estimado: ${epley1rm(s.weightKg, s.reps)} kg`);
  }
  return found;
}

/** Cria a atividade, concede recompensa idempotente e detecta recordes pessoais. */
export async function recordActivity(tx: DbOrTx, userId: string, a: NormalizedActivity, today: string) {
  const [type] = await tx.select().from(activityTypes).where(and(eq(activityTypes.id, a.typeId), eq(activityTypes.userId, userId)));
  if (!type) throw notFound('Tipo de atividade');
  if (a.date > today) throw badRequest('Não é possível registrar atividades no futuro.');
  if (a.sets?.length) {
    const ids = [...new Set(a.sets.map((s) => s.exerciseId))];
    const rows = await tx.select({ id: exercises.id }).from(exercises).where(and(eq(exercises.userId, userId), inArray(exercises.id, ids)));
    if (rows.length !== ids.length) throw unprocessable('Exercício inválido');
  }

  if (a.externalId) {
    const [dup] = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.userId, userId), eq(activities.source, a.source), eq(activities.externalId, a.externalId)));
    if (dup) return { activity: dup, reward: null, duplicate: true, records: [] as string[] };
  }

  // Importação equivalente a um registro manual: vincula em vez de duplicar a recompensa.
  if (a.source !== 'manual') {
    const [manual] = await tx
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.typeId, a.typeId),
          eq(activities.localDate, a.date),
          eq(activities.source, 'manual'),
          isNull(activities.deletedAt),
          sql`abs(${activities.durationMin} - ${a.durationMin}) <= greatest(5, ${a.durationMin} * 0.1)`,
        ),
      )
      .limit(1);
    if (manual) {
      const [linked] = await tx
        .update(activities)
        .set({ notes: [manual.notes, `Vinculada a ${a.source}:${a.externalId}`].filter(Boolean).join('\n'), updatedAt: new Date() })
        .where(eq(activities.id, manual.id))
        .returning();
      return { activity: linked!, reward: null, duplicate: true, records: [] as string[] };
    }
  }

  const [row] = await tx
    .insert(activities)
    .values({
      userId,
      typeId: a.typeId,
      title: a.title ?? null,
      localDate: a.date,
      startedAt: a.startedAt ?? null,
      durationMin: a.durationMin,
      distanceKm: a.distanceKm ?? null,
      elevationM: a.elevationM ?? null,
      avgHeartRate: a.avgHeartRate ?? null,
      perceivedEffort: a.perceivedEffort ?? null,
      notes: a.notes ?? null,
      source: a.source,
      externalId: a.externalId ?? null,
    })
    .returning();
  if (a.sets?.length) {
    await tx.insert(activitySets).values(
      a.sets.map((s, i) => ({ userId, activityId: row!.id, exerciseId: s.exerciseId, setIndex: i + 1, reps: s.reps, weightKg: s.weightKg ?? null, rir: s.rir ?? null })),
    );
  }

  const { config } = await getActiveConfig(tx, userId);
  const todayXp = await xpTodayBySource(tx, userId, a.date);
  const reward = computeTimedReward(
    {
      kind: 'training',
      minutes: a.durationMin,
      distanceKm: a.distanceKm,
      attributeWeights: type.attributeWeights,
      alreadyToday: todayXp.training ?? 0,
      intensity: type.intensity,
    },
    config,
  );
  const grant = await grantReward(tx, {
    userId,
    idempotencyKey: `activity:${row!.id}`,
    sourceType: 'activity',
    sourceId: row!.id,
    xpSource: 'training',
    title: `${type.name}${a.distanceKm ? ` ${a.distanceKm} km` : ''} (${a.durationMin} min)`,
    localDate: a.date,
    reward,
    skillId: type.skillId,
  });
  await tx.update(activities).set({ grantId: grant.grantId }).where(eq(activities.id, row!.id));
  const records = await detectRecords(tx, userId, row!.id, a, type.category);
  return { activity: { ...row!, grantId: grant.grantId }, reward: { ...grant, explanation: reward.explanation }, duplicate: false, records };
}

/** Exclusão lógica (preserva histórico) com estorno da recompensa. */
export async function deleteActivity(tx: DbOrTx, userId: string, id: string, reason: string, actorId: string | null) {
  const [a] = await tx.select().from(activities).where(and(eq(activities.id, id), eq(activities.userId, userId))).for('update');
  if (!a) throw notFound('Atividade');
  if (a.deletedAt) return a;
  if (a.grantId) {
    await reverseGrant(tx, userId, a.grantId, reason, actorId).catch((e) => {
      if (e?.status !== 409) throw e;
    });
  }
  await tx.delete(personalRecords).where(eq(personalRecords.activityId, id));
  const [u] = await tx.update(activities).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(activities.id, id)).returning();
  return u!;
}

export function normalizeKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Registro rápido de tarefa cotidiana: um campo, recompensa pequena e decrescente. */
export async function quickLog(tx: DbOrTx, userId: string, input: z.infer<typeof quickLogInput>, today: string) {
  const key = normalizeKey(input.title);
  if (!key) throw badRequest('Título inválido');
  let attributeCode: string | null = null;
  let attributeId: string | null = null;
  if (input.attributeCode) {
    const [attr] = await tx.select().from(attributes).where(and(eq(attributes.userId, userId), eq(attributes.code, input.attributeCode)));
    if (!attr) throw unprocessable('Atributo inexistente');
    attributeCode = attr.code;
    attributeId = attr.id;
  }
  const [repeat] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(quickLogs)
    .where(and(eq(quickLogs.userId, userId), eq(quickLogs.localDate, today), eq(quickLogs.normalizedKey, key)));
  const [row] = await tx
    .insert(quickLogs)
    .values({ userId, title: input.title, normalizedKey: key, categoryId: input.categoryId ?? null, attributeId, localDate: today })
    .returning();
  const { config } = await getActiveConfig(tx, userId);
  const todayXp = await xpTodayBySource(tx, userId, today);
  const reward = computeQuickReward(
    { repeatIndex: repeat?.n ?? 0, xpFromQuickToday: todayXp.quick ?? 0, attributeWeights: attributeCode ? { [attributeCode]: 1 } : { DIS: 1 } },
    config,
  );
  const grant = await grantReward(tx, {
    userId,
    idempotencyKey: `quick:${row!.id}`,
    sourceType: 'quick',
    sourceId: row!.id,
    xpSource: 'quick',
    categoryId: input.categoryId ?? null,
    title: `Tarefa: ${input.title}`,
    localDate: today,
    reward,
  });
  await tx.update(quickLogs).set({ grantId: grant.grantId }).where(eq(quickLogs.id, row!.id));
  return { log: row!, reward: { ...grant, explanation: reward.explanation } };
}
