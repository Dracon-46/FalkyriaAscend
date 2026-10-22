import { computeStreak } from '@rpg/engine';
import type { HabitCheckinInput, HabitInput } from '@rpg/contracts';
import type { Habit } from '../../persistence/models';
import {
  deleteHabit as deleteHabitRow,
  habitRuleLinks,
  hasAnyCheckin,
  insertHabit,
  listArchivedHabits,
  recentCheckinsOfHabit,
  replaceHabitRules,
  ruleIdsOfHabit,
  setHabitOrder,
  updateHabitRow,
} from '../../persistence/repositories/habits';
import { applicationsOfSource } from '../../persistence/repositories/penalties';
import { inTransaction, type Db } from '../../persistence/unit-of-work';
import { conflict } from '../../shared/errors';
import { audit } from '../audit';
import { afterAction } from '../hooks';
import { todayFor } from '../time';
import { assertNotBasicNeed, assertOwned, validatePenaltyRules, validateWeights } from '../validation';
import { checkin, getHabit, habitsForDay, refreshStreak, streakEntries, undoCheckin } from '../habits';

// ------------------------------------------------------------------ Casos de uso

/** Hábitos do dia com regras vinculadas, mais os arquivados. */
export async function listHabitsView(db: Db, userId: string, now: Date) {
  const today = await todayFor(db, userId, now);
  const list = await habitsForDay(db, userId, today);
  const archived = await listArchivedHabits(db, userId);
  const links = await habitRuleLinks(db, userId);
  return {
    today,
    habits: list.map((h) => ({ ...h, penaltyRuleIds: links.filter((r) => r.habitId === h.id).map((r) => r.ruleId) })),
    archived,
  };
}

export async function habitDetail(db: Db, userId: string, id: string, now: Date) {
  const today = await todayFor(db, userId, now);
  const h = await getHabit(db, userId, id);
  return {
    ...h,
    history: await recentCheckinsOfHabit(db, id),
    streak: computeStreak(await streakEntries(db, h, today)),
    penaltyRuleIds: await ruleIdsOfHabit(db, id),
    penalties: await applicationsOfSource(db, userId, id),
  };
}

/** Cria (existingId = null) ou atualiza um hábito com suas regras de penalidade. */
export function saveHabit(db: Db, userId: string, data: HabitInput, existingId: string | null) {
  return inTransaction(db, async (tx) => {
    await assertOwned(tx, 'categories', data.categoryId, userId, 'Categoria');
    await assertNotBasicNeed(tx, userId, data.categoryId, data.isBasicNeed, data.penaltyRuleIds);
    await validatePenaltyRules(tx, userId, data.penaltyRuleIds);
    const weights = await validateWeights(tx, userId, data.attributeWeights);
    const { penaltyRuleIds, ...rest } = data;
    const values = {
      ...rest,
      attributeWeights: weights,
      endDate: rest.endDate ?? null,
      timeOfDay: rest.timeOfDay ?? null,
      categoryId: rest.categoryId ?? null,
    };
    let before: Habit | null = null;
    let row: Habit;
    if (existingId) {
      before = await getHabit(tx, userId, existingId, true);
      row = await updateHabitRow(tx, existingId, values);
    } else {
      row = await insertHabit(tx, { ...values, userId });
    }
    await replaceHabitRules(tx, userId, row.id, penaltyRuleIds);
    await audit(tx, {
      actorId: userId,
      userId,
      action: existingId ? 'update' : 'create',
      entityType: 'habits',
      entityId: row.id,
      before,
      after: { ...row, penaltyRuleIds },
    });
    return row;
  });
}

/** Pausar / retomar / arquivar. Pausa gera "dispensado" (não falha) na avaliação diária. */
export function setHabitStatus(db: Db, userId: string, id: string, input: { status: Habit['status']; pausedUntil?: string | null }) {
  return inTransaction(db, async (tx) => {
    const before = await getHabit(tx, userId, id, true);
    const u = await updateHabitRow(tx, id, { status: input.status, pausedUntil: input.status === 'paused' ? (input.pausedUntil ?? null) : null });
    await audit(tx, { actorId: userId, userId, action: `habit.${input.status}`, entityType: 'habits', entityId: id, before, after: u });
    return u;
  });
}

export function reorderHabits(db: Db, userId: string, ids: string[]): Promise<void> {
  return inTransaction(db, async (tx) => {
    for (const [i, id] of ids.entries()) await setHabitOrder(tx, userId, id, i);
  });
}

/** Exclusão só para hábitos sem histórico; os demais devem ser arquivados. */
export function deleteHabit(db: Db, userId: string, id: string): Promise<void> {
  return inTransaction(db, async (tx) => {
    const h = await getHabit(tx, userId, id);
    if (await hasAnyCheckin(tx, id)) throw conflict('Este hábito possui histórico. Arquive-o para preservar sequências e recompensas.');
    await deleteHabitRow(tx, id);
    await audit(tx, { actorId: userId, userId, action: 'delete', entityType: 'habits', entityId: id, before: h });
  });
}

/** Registro do dia (ou de ontem) com recompensa, sequência e reavaliação do progresso. */
export async function recordCheckin(db: Db, userId: string, habitId: string, input: HabitCheckinInput, now: Date) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => {
    const r = await checkin(tx, userId, habitId, input, today);
    return { ...r, after: await afterAction(tx, userId, today) };
  });
}

export async function undoCheckinFor(db: Db, userId: string, habitId: string, date: string, now: Date): Promise<void> {
  const today = await todayFor(db, userId, now);
  await inTransaction(db, async (tx) => {
    await undoCheckin(tx, userId, habitId, date, today);
    await afterAction(tx, userId, today);
  });
}

export async function recomputeStreak(db: Db, userId: string, habitId: string, now: Date) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => refreshStreak(tx, await getHabit(tx, userId, habitId, true), today));
}
