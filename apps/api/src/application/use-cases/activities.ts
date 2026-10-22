import type { ActivityInput, ActivityTypeInput, ExerciseInput, QuickLogInput } from '@rpg/contracts';
import { listActivitiesWithSets, listPersonalRecords, listQuickLogs } from '../../persistence/repositories/activities';
import { inTransaction, type Db, type DbOrTx } from '../../persistence/unit-of-work';
import { crudService } from '../crud';
import { afterAction } from '../hooks';
import { todayFor } from '../time';
import { assertOwned, validateWeights } from '../validation';
import { deleteActivity, quickLog, recordActivity, toNormalized } from '../activities';

// ------------------------------------------------------------------ Cadastros

export const activityTypesCrud = crudService<ActivityTypeInput>({
  resource: 'activityTypes',
  entity: 'activity_types',
  label: 'Tipo de atividade',
  orderBy: [{ field: 'name' }],
  prepare: async (tx, userId, data) => {
    await assertOwned(tx, 'skills', data.skillId, userId, 'Habilidade');
    return { ...data, attributeWeights: await validateWeights(tx, userId, data.attributeWeights) };
  },
});

export const exercisesCrud = crudService<ExerciseInput>({ resource: 'exercises', entity: 'exercises', label: 'Exercício', orderBy: [{ field: 'name' }] });

// ------------------------------------------------------------------ Casos de uso

/** Atividades com ritmo (min/km), volume (kg) e séries. */
export async function activitiesView(db: DbOrTx, userId: string, limit: number) {
  const { rows, sets } = await listActivitiesWithSets(db, userId, limit);
  return rows.map((r) => {
    const mine = sets.filter((s) => s.s.activityId === r.a.id);
    return {
      ...r.a,
      typeName: r.typeName,
      category: r.category,
      pace: r.a.distanceKm && Number(r.a.distanceKm) > 0 ? Math.round((r.a.durationMin / Number(r.a.distanceKm)) * 100) / 100 : null,
      volumeKg: mine.reduce((acc, s) => acc + s.s.reps * Number(s.s.weightKg ?? 0), 0),
      sets: mine.map((s) => ({ ...s.s, exerciseName: s.exercise })),
    };
  });
}

export function personalRecordsOf(db: DbOrTx, userId: string) {
  return listPersonalRecords(db, userId);
}

export function quickLogsOf(db: DbOrTx, userId: string) {
  return listQuickLogs(db, userId);
}

export async function recordManualActivity(db: Db, userId: string, input: ActivityInput, now: Date) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => {
    const out = await recordActivity(tx, userId, toNormalized(input, today), today);
    return { ...out, after: await afterAction(tx, userId, today) };
  });
}

export async function removeActivity(db: Db, userId: string, id: string, now: Date): Promise<void> {
  const today = await todayFor(db, userId, now);
  await inTransaction(db, async (tx) => {
    await deleteActivity(tx, userId, id, 'Atividade excluída pelo usuário', userId);
    await afterAction(tx, userId, today);
  });
}

export async function recordQuickLog(db: Db, userId: string, input: QuickLogInput, now: Date) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => ({ ...(await quickLog(tx, userId, input, today)), after: await afterAction(tx, userId, today) }));
}
