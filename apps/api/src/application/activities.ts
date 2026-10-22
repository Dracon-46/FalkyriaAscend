import type { ActivityInput, QuickLogInput } from '@rpg/contracts';
import { computeQuickReward, computeTimedReward } from '@rpg/engine';
import type { RECORD_SOURCES } from '../persistence/models';
import {
  bestRecordValue,
  countOwnedExercises,
  countQuickLogsOn,
  deleteRecordsOfActivity,
  findActivityByExternalId,
  findActivityType,
  findAttributeByCode,
  findEquivalentManualActivity,
  insertActivity,
  insertPersonalRecord,
  insertQuickLog,
  insertSets,
  lockActivity,
  setActivityGrant,
  setQuickLogGrant,
  updateActivity,
} from '../persistence/repositories/activities';
import { type DbOrTx } from '../persistence/unit-of-work';
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

export function toNormalized(input: ActivityInput, today: string): NormalizedActivity {
  return { ...input, date: input.date ?? today, source: 'manual', externalId: null };
}

/** Estimativa de 1RM (Epley). */
export function epley1rm(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10;
}

async function detectRecords(tx: DbOrTx, userId: string, activityId: string, a: NormalizedActivity, category: string) {
  const found: string[] = [];
  const record = async (kind: string, value: number, unit: string, exerciseId: string | null, label: string, lowerIsBetter = false) => {
    const prev = await bestRecordValue(tx, userId, kind, exerciseId);
    const improved = prev === null || (lowerIsBetter ? value < prev : value > prev);
    if (!improved || value <= 0) return;
    await insertPersonalRecord(tx, { userId, kind, exerciseId, value, unit, activityId, achievedOn: a.date });
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
  const type = await findActivityType(tx, userId, a.typeId);
  if (!type) throw notFound('Tipo de atividade');
  if (a.date > today) throw badRequest('Não é possível registrar atividades no futuro.');
  if (a.sets?.length) {
    const ids = [...new Set(a.sets.map((s) => s.exerciseId))];
    if ((await countOwnedExercises(tx, userId, ids)) !== ids.length) throw unprocessable('Exercício inválido');
  }

  if (a.externalId) {
    const dup = await findActivityByExternalId(tx, userId, a.source, a.externalId);
    if (dup) return { activity: dup, reward: null, duplicate: true, records: [] as string[] };
  }

  // Importação equivalente a um registro manual: vincula em vez de duplicar a recompensa.
  if (a.source !== 'manual') {
    const manual = await findEquivalentManualActivity(tx, userId, a.typeId, a.date, a.durationMin);
    if (manual) {
      const linked = await updateActivity(tx, manual.id, { notes: [manual.notes, `Vinculada a ${a.source}:${a.externalId}`].filter(Boolean).join('\n') });
      return { activity: linked, reward: null, duplicate: true, records: [] as string[] };
    }
  }

  const row = await insertActivity(tx, {
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
  });
  await insertSets(
    tx,
    (a.sets ?? []).map((s, i) => ({
      userId,
      activityId: row.id,
      exerciseId: s.exerciseId,
      setIndex: i + 1,
      reps: s.reps,
      weightKg: s.weightKg ?? null,
      rir: s.rir ?? null,
    })),
  );

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
    idempotencyKey: `activity:${row.id}`,
    sourceType: 'activity',
    sourceId: row.id,
    xpSource: 'training',
    title: `${type.name}${a.distanceKm ? ` ${a.distanceKm} km` : ''} (${a.durationMin} min)`,
    localDate: a.date,
    reward,
    skillId: type.skillId,
  });
  await setActivityGrant(tx, row.id, grant.grantId);
  const records = await detectRecords(tx, userId, row.id, a, type.category);
  return { activity: { ...row, grantId: grant.grantId }, reward: { ...grant, explanation: reward.explanation }, duplicate: false, records };
}

/** Exclusão lógica (preserva histórico) com estorno da recompensa. */
export async function deleteActivity(tx: DbOrTx, userId: string, id: string, reason: string, actorId: string | null) {
  const a = await lockActivity(tx, userId, id);
  if (!a) throw notFound('Atividade');
  if (a.deletedAt) return a;
  if (a.grantId) {
    await reverseGrant(tx, userId, a.grantId, reason, actorId).catch((e) => {
      if (e?.status !== 409) throw e;
    });
  }
  await deleteRecordsOfActivity(tx, id);
  return updateActivity(tx, id, { deletedAt: new Date() });
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
export async function quickLog(tx: DbOrTx, userId: string, input: QuickLogInput, today: string) {
  const key = normalizeKey(input.title);
  if (!key) throw badRequest('Título inválido');
  let attributeCode: string | null = null;
  let attributeId: string | null = null;
  if (input.attributeCode) {
    const attr = await findAttributeByCode(tx, userId, input.attributeCode);
    if (!attr) throw unprocessable('Atributo inexistente');
    attributeCode = attr.code;
    attributeId = attr.id;
  }
  const repeatIndex = await countQuickLogsOn(tx, userId, today, key);
  const row = await insertQuickLog(tx, { userId, title: input.title, normalizedKey: key, categoryId: input.categoryId ?? null, attributeId, localDate: today });
  const { config } = await getActiveConfig(tx, userId);
  const todayXp = await xpTodayBySource(tx, userId, today);
  const reward = computeQuickReward(
    { repeatIndex, xpFromQuickToday: todayXp.quick ?? 0, attributeWeights: attributeCode ? { [attributeCode]: 1 } : { DIS: 1 } },
    config,
  );
  const grant = await grantReward(tx, {
    userId,
    idempotencyKey: `quick:${row.id}`,
    sourceType: 'quick',
    sourceId: row.id,
    xpSource: 'quick',
    categoryId: input.categoryId ?? null,
    title: `Tarefa: ${input.title}`,
    localDate: today,
    reward,
  });
  await setQuickLogGrant(tx, row.id, grant.grantId);
  return { log: row, reward: { ...grant, explanation: reward.explanation } };
}
