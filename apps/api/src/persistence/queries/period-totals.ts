/** Totais de um período (temporadas e resumos): XP e moedas efetivos, missões concluídas e hábitos cumpridos. */
import { and, count, eq, gte, lte, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { habitCheckins, missions, rewardGrants } from '../schema';
import { effectiveGrant } from './ledger-filters';

export async function periodTotals(db: DbOrTx, userId: string, from: string, to: string) {
  const [xp] = await db
    .select({ xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int`, coins: sql<number>`coalesce(sum(${rewardGrants.coins}),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), gte(rewardGrants.localDate, from), lte(rewardGrants.localDate, to), effectiveGrant));
  const [done] = await db
    .select({ n: count() })
    .from(missions)
    .where(and(eq(missions.userId, userId), eq(missions.status, 'completed'), gte(missions.completedOn, from), lte(missions.completedOn, to)));
  const [habitsDone] = await db
    .select({ n: count() })
    .from(habitCheckins)
    .where(and(eq(habitCheckins.userId, userId), eq(habitCheckins.status, 'done'), gte(habitCheckins.localDate, from), lte(habitCheckins.localDate, to)));
  const bySource = await db
    .select({ source: rewardGrants.xpSource, xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), gte(rewardGrants.localDate, from), lte(rewardGrants.localDate, to), effectiveGrant))
    .groupBy(rewardGrants.xpSource);
  return { xp: xp?.xp ?? 0, coins: xp?.coins ?? 0, missionsCompleted: done?.n ?? 0, habitsDone: habitsDone?.n ?? 0, bySource };
}
