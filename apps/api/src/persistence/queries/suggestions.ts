/** Sinais usados para sugerir missões (nunca criadas automaticamente). */
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { categories, goals, habitCheckins, habits, missions, rewardGrants, studySessions } from '../schema';

/** Categorias ativas, exceto necessidades básicas, sem nenhuma recompensa desde `since`. */
export async function neglectedCategories(db: DbOrTx, userId: string, since: string) {
  const cats = await db
    .select()
    .from(categories)
    .where(and(eq(categories.userId, userId), isNull(categories.archivedAt), eq(categories.isBasicNeed, false)));
  const active = await db
    .select({ categoryId: rewardGrants.categoryId })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), gte(rewardGrants.localDate, since)))
    .groupBy(rewardGrants.categoryId);
  const activeSet = new Set(active.map((a) => a.categoryId));
  return cats.filter((c) => !activeSet.has(c.id));
}

/** Metas ativas sem nenhuma missão aberta vinculada. */
export async function goalsWithoutOpenMissions(db: DbOrTx, userId: string) {
  const goalRows = await db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.status, 'active')));
  const linked = await db
    .select({ goalId: missions.goalId })
    .from(missions)
    .where(and(eq(missions.userId, userId), inArray(missions.status, ['available', 'in_progress'])));
  const covered = new Set(linked.map((g) => g.goalId));
  return goalRows.filter((g) => !covered.has(g.id));
}

/** Adesão de cada hábito ativo desde `since`: feitos e avaliados (feito, falha, tolerado). */
export function habitAdherenceSince(db: DbOrTx, userId: string, since: string) {
  return db
    .select({
      id: habits.id,
      title: habits.title,
      done: sql<number>`count(*) filter (where ${habitCheckins.status} = 'done')::int`,
      evaluated: sql<number>`count(*) filter (where ${habitCheckins.status} in ('done','missed','tolerated'))::int`,
    })
    .from(habits)
    .leftJoin(habitCheckins, and(eq(habitCheckins.habitId, habits.id), gte(habitCheckins.localDate, since)))
    .where(and(eq(habits.userId, userId), eq(habits.status, 'active')))
    .groupBy(habits.id, habits.title);
}

export async function studyMinutesSince(db: DbOrTx, userId: string, since: string): Promise<number> {
  const [study] = await db
    .select({ minutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int` })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), gte(studySessions.localDate, since)));
  return study?.minutes ?? 0;
}
