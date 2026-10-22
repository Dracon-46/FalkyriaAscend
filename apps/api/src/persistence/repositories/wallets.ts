import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { coinTransactions, penaltyApplications, wallets } from '../schema';

export type NewCoinTransaction = typeof coinTransactions.$inferInsert;

/** Bloqueia a carteira (SELECT ... FOR UPDATE), criando-a se necessário. */
export async function lockWallet(tx: DbOrTx, userId: string) {
  await tx.insert(wallets).values({ userId }).onConflictDoNothing();
  const [w] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for('update');
  return w!;
}

export async function findWallet(db: DbOrTx, userId: string) {
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  return w ?? null;
}

export async function insertCoinTransaction(tx: DbOrTx, values: NewCoinTransaction) {
  const [row] = await tx.insert(coinTransactions).values(values).returning();
  return row!;
}

/** Atualiza a projeção da carteira somando os deltas aos totais. */
export async function applyWalletDelta(
  tx: DbOrTx,
  userId: string,
  delta: { balance: number; earned: number; spent: number; penalties: number },
): Promise<void> {
  await tx
    .update(wallets)
    .set({
      balance: delta.balance,
      totalEarned: sql`${wallets.totalEarned} + ${delta.earned}`,
      totalSpent: sql`${wallets.totalSpent} + ${delta.spent}`,
      totalPenalties: sql`${wallets.totalPenalties} + ${delta.penalties}`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.userId, userId));
}

export async function findCoinTxByGrant(db: DbOrTx, grantId: string) {
  const [row] = await db.select().from(coinTransactions).where(eq(coinTransactions.grantId, grantId));
  return row ?? null;
}

export async function findPenaltyCoinTx(db: DbOrTx, penaltyId: string) {
  const [row] = await db
    .select()
    .from(coinTransactions)
    .where(and(eq(coinTransactions.penaltyId, penaltyId), eq(coinTransactions.kind, 'penalty')));
  return row ?? null;
}

/** Moedas perdidas em penalidades no intervalo, descontadas as reversões dessas penalidades. */
export async function sumPenaltyCoinsLost(db: DbOrTx, userId: string, from: string, to: string): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`coalesce(-sum(${coinTransactions.amount}), 0)::int` })
    .from(coinTransactions)
    .where(
      and(
        eq(coinTransactions.userId, userId),
        eq(coinTransactions.kind, 'penalty'),
        gte(coinTransactions.localDate, from),
        lte(coinTransactions.localDate, to),
      ),
    );
  const [rev] = await db
    .select({ total: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)::int` })
    .from(coinTransactions)
    .innerJoin(penaltyApplications, eq(penaltyApplications.id, coinTransactions.penaltyId))
    .where(
      and(
        eq(coinTransactions.userId, userId),
        eq(coinTransactions.kind, 'reversal'),
        gte(penaltyApplications.localDate, from),
        lte(penaltyApplications.localDate, to),
      ),
    );
  return Math.max(0, (r?.total ?? 0) - (rev?.total ?? 0));
}

/** Moedas ganhas (lançamentos `earn`) no intervalo. */
export async function sumCoinsEarned(db: DbOrTx, userId: string, from: string, to: string): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)::int` })
    .from(coinTransactions)
    .where(
      and(eq(coinTransactions.userId, userId), eq(coinTransactions.kind, 'earn'), gte(coinTransactions.localDate, from), lte(coinTransactions.localDate, to)),
    );
  return r?.total ?? 0;
}

/** Sobrescreve a projeção da carteira com totais recalculados do livro-razão. */
export async function overwriteWalletTotals(
  tx: DbOrTx,
  userId: string,
  totals: { balance: number; totalEarned: number; totalSpent: number; totalPenalties: number },
): Promise<void> {
  await tx.insert(wallets).values({ userId }).onConflictDoNothing();
  await tx
    .update(wallets)
    .set({ ...totals, updatedAt: new Date() })
    .where(eq(wallets.userId, userId));
}

export async function findCoinTx(db: DbOrTx, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(coinTransactions)
    .where(and(eq(coinTransactions.id, id), eq(coinTransactions.userId, userId)));
  return row ?? null;
}

/** Estorno já lançado para a transação, se houver. */
export async function findReversalOf(db: DbOrTx, id: string) {
  const [row] = await db.select({ id: coinTransactions.id }).from(coinTransactions).where(eq(coinTransactions.reversalOf, id));
  return row ?? null;
}
