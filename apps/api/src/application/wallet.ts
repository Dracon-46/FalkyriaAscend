import { eq, sql } from 'drizzle-orm';
import type { CoinTxKind } from '@rpg/engine';
import type { DbOrTx } from '../persistence/client';
import { coinTransactions, wallets } from '../persistence/schema';
import { conflict } from '../shared/errors';

export interface CoinTxInput {
  userId: string;
  amount: number;
  kind: CoinTxKind;
  category: string;
  reason: string;
  localDate: string;
  grantId?: string | null;
  purchaseId?: string | null;
  penaltyId?: string | null;
  reversalOf?: string | null;
  actorId?: string | null;
}

/** Bloqueia a carteira do usuário (SELECT ... FOR UPDATE), criando-a se necessário. */
export async function lockWallet(tx: DbOrTx, userId: string) {
  await tx.insert(wallets).values({ userId }).onConflictDoNothing();
  const [w] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for('update');
  return w!;
}

/**
 * Lança uma transação no livro-razão e atualiza a projeção da carteira na MESMA transação.
 * Nunca permite saldo negativo (também garantido por CHECK no banco).
 */
export async function postCoinTx(tx: DbOrTx, input: CoinTxInput) {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new Error('Valor de transação inválido');
  const wallet = await lockWallet(tx, input.userId);
  const balanceAfter = wallet.balance + input.amount;
  if (balanceAfter < 0) {
    throw conflict(`Saldo insuficiente: saldo ${wallet.balance}, necessário ${-input.amount}`, {
      balance: wallet.balance,
      required: -input.amount,
    });
  }
  const [row] = await tx
    .insert(coinTransactions)
    .values({
      userId: input.userId,
      amount: input.amount,
      kind: input.kind,
      category: input.category,
      reason: input.reason,
      localDate: input.localDate,
      grantId: input.grantId ?? null,
      purchaseId: input.purchaseId ?? null,
      penaltyId: input.penaltyId ?? null,
      reversalOf: input.reversalOf ?? null,
      actorId: input.actorId ?? null,
      balanceAfter,
    })
    .returning();
  const earned = input.kind === 'earn' || (input.kind === 'adjustment' && input.amount > 0) ? input.amount : 0;
  const spent = input.kind === 'spend' ? -input.amount : 0;
  const penalties = input.kind === 'penalty' ? -input.amount : 0;
  await tx
    .update(wallets)
    .set({
      balance: balanceAfter,
      totalEarned: sql`${wallets.totalEarned} + ${earned}`,
      totalSpent: sql`${wallets.totalSpent} + ${spent}`,
      totalPenalties: sql`${wallets.totalPenalties} + ${penalties}`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.userId, input.userId));
  return row!;
}
