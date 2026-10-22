/** Hábitos: agregado com registros diários (check-ins) e regras de penalidade vinculadas. */
import { and, asc, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { habitCheckins, habitPenaltyRules, habits } from '../schema';

export type NewHabit = typeof habits.$inferInsert;
export type HabitPatch = Partial<Omit<NewHabit, 'id' | 'userId'>>;
export type NewCheckin = typeof habitCheckins.$inferInsert;

// ------------------------------------------------------------------ Hábitos

export async function findHabit(db: DbOrTx, userId: string, id: string) {
  const [h] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
  return h ?? null;
}

export async function lockHabit(tx: DbOrTx, userId: string, id: string) {
  const [h] = await tx
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .for('update');
  return h ?? null;
}

/** Hábitos ativos e pausados, na ordem definida pelo usuário. */
export function listCurrentHabits(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), inArray(habits.status, ['active', 'paused'])))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt));
}

export function listArchivedHabits(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.status, 'archived')));
}

export function listHabits(db: DbOrTx, userId: string) {
  return db.select().from(habits).where(eq(habits.userId, userId));
}

export async function insertHabit(tx: DbOrTx, values: NewHabit) {
  const [h] = await tx.insert(habits).values(values).returning();
  return h!;
}

export async function updateHabitRow(tx: DbOrTx, id: string, patch: HabitPatch) {
  const [h] = await tx
    .update(habits)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(habits.id, id))
    .returning();
  return h!;
}

export async function setHabitStreak(tx: DbOrTx, id: string, current: number, best: number): Promise<void> {
  await tx.update(habits).set({ currentStreak: current, bestStreak: best }).where(eq(habits.id, id));
}

export async function setHabitOrder(tx: DbOrTx, userId: string, id: string, sortOrder: number): Promise<void> {
  await tx
    .update(habits)
    .set({ sortOrder })
    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
}

export async function deleteHabit(db: DbOrTx, id: string): Promise<void> {
  await db.delete(habits).where(eq(habits.id, id));
}

// ------------------------------------------------------------------ Regras de penalidade

export function habitRuleLinks(db: DbOrTx, userId: string) {
  return db.select().from(habitPenaltyRules).where(eq(habitPenaltyRules.userId, userId));
}

export async function ruleIdsOfHabit(db: DbOrTx, habitId: string): Promise<string[]> {
  const rows = await db.select({ ruleId: habitPenaltyRules.ruleId }).from(habitPenaltyRules).where(eq(habitPenaltyRules.habitId, habitId));
  return rows.map((r) => r.ruleId);
}

export async function replaceHabitRules(tx: DbOrTx, userId: string, habitId: string, ruleIds: string[]): Promise<void> {
  await tx.delete(habitPenaltyRules).where(eq(habitPenaltyRules.habitId, habitId));
  if (ruleIds.length) await tx.insert(habitPenaltyRules).values(ruleIds.map((ruleId) => ({ userId, habitId, ruleId })));
}

// ------------------------------------------------------------------ Registros (check-ins)

/** Registros do hábito, do mais antigo ao mais recente. */
export function checkinsOfHabit(db: DbOrTx, habitId: string) {
  return db
    .select({ date: habitCheckins.localDate, status: habitCheckins.status })
    .from(habitCheckins)
    .where(eq(habitCheckins.habitId, habitId))
    .orderBy(asc(habitCheckins.localDate));
}

/** Registros do hábito no intervalo [from, to], em ordem cronológica. */
export function checkinsOfHabitBetween(db: DbOrTx, habitId: string, from: string, to: string) {
  return db
    .select({ date: habitCheckins.localDate, status: habitCheckins.status })
    .from(habitCheckins)
    .where(and(eq(habitCheckins.habitId, habitId), gte(habitCheckins.localDate, from), lte(habitCheckins.localDate, to)))
    .orderBy(asc(habitCheckins.localDate));
}

/** Histórico recente para a tela do hábito (mais recente primeiro). */
export function recentCheckinsOfHabit(db: DbOrTx, habitId: string, limit = 400) {
  return db.select().from(habitCheckins).where(eq(habitCheckins.habitId, habitId)).orderBy(desc(habitCheckins.localDate)).limit(limit);
}

/** Registros de todos os hábitos do usuário no intervalo [from, to]. */
export function checkinsOfUserBetween(db: DbOrTx, userId: string, from: string, to: string) {
  return db
    .select()
    .from(habitCheckins)
    .where(and(eq(habitCheckins.userId, userId), gte(habitCheckins.localDate, from), lte(habitCheckins.localDate, to)));
}

export async function findCheckin(db: DbOrTx, habitId: string, date: string) {
  const [c] = await db
    .select()
    .from(habitCheckins)
    .where(and(eq(habitCheckins.habitId, habitId), eq(habitCheckins.localDate, date)));
  return c ?? null;
}

export async function hasAnyCheckin(db: DbOrTx, habitId: string): Promise<boolean> {
  const [any] = await db.select({ id: habitCheckins.id }).from(habitCheckins).where(eq(habitCheckins.habitId, habitId)).limit(1);
  return Boolean(any);
}

/** Quantas execuções "feito" o hábito tem no intervalo [from, to]. */
export async function countDoneBetween(db: DbOrTx, habitId: string, from: string, to: string): Promise<number> {
  const rows = await db
    .select({ id: habitCheckins.id })
    .from(habitCheckins)
    .where(and(eq(habitCheckins.habitId, habitId), eq(habitCheckins.status, 'done'), gte(habitCheckins.localDate, from), lte(habitCheckins.localDate, to)));
  return rows.length;
}

export async function insertCheckin(tx: DbOrTx, values: NewCheckin) {
  const [row] = await tx.insert(habitCheckins).values(values).returning();
  return row!;
}

/** Usado pela avaliação diária: não sobrescreve um registro já existente no dia. */
export async function insertCheckinIfAbsent(tx: DbOrTx, values: NewCheckin): Promise<void> {
  await tx.insert(habitCheckins).values(values).onConflictDoNothing();
}

export async function deleteCheckin(tx: DbOrTx, checkinId: string): Promise<void> {
  await tx.delete(habitCheckins).where(eq(habitCheckins.id, checkinId));
}

export function listNonArchivedHabits(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), ne(habits.status, 'archived')));
}
