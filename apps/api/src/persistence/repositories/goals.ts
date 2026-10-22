/** Metas: agregado com etapas (milestones) e dependências entre metas. */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { goalDependencies, goalMilestones, goals } from '../schema';

export type NewGoal = typeof goals.$inferInsert;
export type GoalPatch = Partial<Omit<NewGoal, 'id' | 'userId'>>;
export type MilestonePatch = Partial<Omit<typeof goalMilestones.$inferInsert, 'id' | 'userId' | 'goalId'>>;

export async function findGoal(db: DbOrTx, userId: string, id: string) {
  const [g] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
  return g ?? null;
}

export async function lockGoal(tx: DbOrTx, userId: string, id: string) {
  const [g] = await tx
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .for('update');
  return g ?? null;
}

export function listGoals(db: DbOrTx, userId: string) {
  return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.deadline), desc(goals.createdAt));
}

export function listActiveGoals(db: DbOrTx, userId: string) {
  return db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.status, 'active')));
}

export async function countOwnedGoals(db: DbOrTx, userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.userId, userId), inArray(goals.id, ids)));
  return rows.length;
}

export async function insertGoal(tx: DbOrTx, values: NewGoal) {
  const [g] = await tx.insert(goals).values(values).returning();
  return g!;
}

export async function updateGoalRow(tx: DbOrTx, id: string, patch: GoalPatch) {
  const [g] = await tx
    .update(goals)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(goals.id, id))
    .returning();
  return g!;
}

export async function deleteGoalRow(db: DbOrTx, id: string): Promise<void> {
  await db.delete(goals).where(eq(goals.id, id));
}

// ------------------------------------------------------------------ Etapas

export function listMilestones(db: DbOrTx, goalId: string) {
  return db.select().from(goalMilestones).where(eq(goalMilestones.goalId, goalId)).orderBy(asc(goalMilestones.sortOrder));
}

export async function findMilestone(db: DbOrTx, goalId: string, milestoneId: string) {
  const [m] = await db
    .select()
    .from(goalMilestones)
    .where(and(eq(goalMilestones.id, milestoneId), eq(goalMilestones.goalId, goalId)));
  return m ?? null;
}

export async function insertMilestone(tx: DbOrTx, values: typeof goalMilestones.$inferInsert): Promise<void> {
  await tx.insert(goalMilestones).values(values);
}

export async function updateMilestone(tx: DbOrTx, id: string, patch: MilestonePatch): Promise<void> {
  await tx.update(goalMilestones).set(patch).where(eq(goalMilestones.id, id));
}

export async function deleteMilestones(tx: DbOrTx, ids: string[]): Promise<void> {
  if (ids.length) await tx.delete(goalMilestones).where(inArray(goalMilestones.id, ids));
}

// ------------------------------------------------------------------ Dependências

export function listDependencies(db: DbOrTx, userId: string) {
  return db.select().from(goalDependencies).where(eq(goalDependencies.userId, userId));
}

/** Metas das quais a meta depende, com título e status. */
export function prerequisitesOf(db: DbOrTx, goalId: string) {
  return db
    .select({ id: goals.id, title: goals.title, status: goals.status })
    .from(goalDependencies)
    .innerJoin(goals, eq(goals.id, goalDependencies.dependsOnId))
    .where(eq(goalDependencies.goalId, goalId));
}

export async function replaceDependencies(tx: DbOrTx, userId: string, goalId: string, dependsOn: string[]): Promise<void> {
  await tx.delete(goalDependencies).where(eq(goalDependencies.goalId, goalId));
  if (dependsOn.length) await tx.insert(goalDependencies).values(dependsOn.map((d) => ({ userId, goalId, dependsOnId: d })));
}
