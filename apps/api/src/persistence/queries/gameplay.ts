/** Leituras usadas no cálculo de recompensas: limites diários e insumos do multiplicador de consistência. */
import { and, count, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { XpSource } from '@rpg/engine';
import type { DbOrTx } from '../client';
import { habitCheckins, missions, rewardGrants } from '../schema';
import { effectiveGrant } from './ledger-filters';

/** XP geral recebido no dia local, por origem (para limites diários). */
export async function xpOnDateBySource(db: DbOrTx, userId: string, localDate: string): Promise<Partial<Record<XpSource, number>>> {
  const rows = await db
    .select({ source: rewardGrants.xpSource, xp: sql<number>`coalesce(sum(${rewardGrants.xp}), 0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), eq(rewardGrants.localDate, localDate), effectiveGrant))
    .groupBy(rewardGrants.xpSource);
  return Object.fromEntries(rows.map((r) => [r.source, r.xp]));
}

/** Quantidade de missões Difícil ou superior concluídas (e recompensadas) no dia. */
export async function hardMissionsRewardedOn(db: DbOrTx, userId: string, localDate: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(rewardGrants)
    .innerJoin(missions, eq(missions.id, rewardGrants.sourceId))
    .where(
      and(
        eq(rewardGrants.userId, userId),
        eq(rewardGrants.sourceType, 'mission'),
        eq(rewardGrants.localDate, localDate),
        effectiveGrant,
        inArray(missions.difficulty, ['hard', 'very_hard', 'epic', 'legendary']),
      ),
    );
  return row?.n ?? 0;
}

/** Contagem de registros de hábitos por status no intervalo [from, to]. */
export async function habitStatusCounts(db: DbOrTx, userId: string, from: string, to: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: habitCheckins.status, n: count() })
    .from(habitCheckins)
    .where(and(eq(habitCheckins.userId, userId), gte(habitCheckins.localDate, from), lte(habitCheckins.localDate, to)))
    .groupBy(habitCheckins.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
