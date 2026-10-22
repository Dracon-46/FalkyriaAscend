/** Totais do livro-razão usados para verificar e reconstruir projeções. */
import { asc, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { coinTransactions, grantAttributeXp, grantSkillXp, rewardGrants } from '../schema';

/** Lançamentos de moedas na ordem estrita de gravação. */
export function coinLedgerInOrder(db: DbOrTx, userId: string) {
  return db.select().from(coinTransactions).where(eq(coinTransactions.userId, userId)).orderBy(asc(coinTransactions.seq));
}

/** Soma de XP de todas as recompensas (estornos incluídos, que já são negativos). */
export async function totalGrantedXp(db: DbOrTx, userId: string): Promise<number> {
  const [xp] = await db
    .select({ total: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` })
    .from(rewardGrants)
    .where(eq(rewardGrants.userId, userId));
  return xp?.total ?? 0;
}

export async function attributeXpTotals(db: DbOrTx, userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: grantAttributeXp.attributeId, total: sql<number>`coalesce(sum(${grantAttributeXp.amount}),0)::int` })
    .from(grantAttributeXp)
    .where(eq(grantAttributeXp.userId, userId))
    .groupBy(grantAttributeXp.attributeId);
  return new Map(rows.map((r) => [r.id, r.total]));
}

export async function skillXpTotals(db: DbOrTx, userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: grantSkillXp.skillId, total: sql<number>`coalesce(sum(${grantSkillXp.amount}),0)::int` })
    .from(grantSkillXp)
    .where(eq(grantSkillXp.userId, userId))
    .groupBy(grantSkillXp.skillId);
  return new Map(rows.map((r) => [r.id, r.total]));
}
