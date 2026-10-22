import type { CoinTxKind } from '@rpg/engine';
import { applyWalletDelta, insertCoinTransaction, lockWallet } from '../persistence/repositories/wallets';
import type { DbOrTx } from '../persistence/unit-of-work';
import { conflict } from '../shared/errors';

export { lockWallet };

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
  const row = await insertCoinTransaction(tx, {
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
  });
  await applyWalletDelta(tx, input.userId, {
    balance: balanceAfter,
    earned: input.kind === 'earn' || (input.kind === 'adjustment' && input.amount > 0) ? input.amount : 0,
    spent: input.kind === 'spend' ? -input.amount : 0,
    penalties: input.kind === 'penalty' ? -input.amount : 0,
  });
  return row;
}
