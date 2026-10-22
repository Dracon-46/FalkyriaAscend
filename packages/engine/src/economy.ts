import type { CoinTxKind } from './types';

export interface LedgerEntry {
  amount: number;
  kind: CoinTxKind;
  balanceAfter: number;
}

export interface WalletTotals {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  totalPenalties: number;
}

/**
 * Recalcula os totais da carteira a partir do livro-razão (fonte da verdade).
 * Estornos são contabilizados pelo sinal: um estorno positivo devolve moedas.
 */
export function totalsFromLedger(entries: Pick<LedgerEntry, 'amount' | 'kind'>[]): WalletTotals {
  let balance = 0;
  let totalEarned = 0;
  let totalSpent = 0;
  let totalPenalties = 0;
  for (const e of entries) {
    balance += e.amount;
    if (e.kind === 'earn' || (e.kind === 'adjustment' && e.amount > 0)) totalEarned += e.amount;
    if (e.kind === 'spend') totalSpent += -e.amount;
    if (e.kind === 'penalty') totalPenalties += -e.amount;
  }
  return { balance, totalEarned, totalSpent, totalPenalties };
}

export interface LedgerIssue {
  index: number;
  message: string;
}

/** Verifica a cadeia de saldos do livro-razão (ordenado cronologicamente). */
export function verifyLedger(entries: LedgerEntry[], allowNegative = false): LedgerIssue[] {
  const issues: LedgerIssue[] = [];
  let running = 0;
  entries.forEach((e, index) => {
    running += e.amount;
    if (running !== e.balanceAfter) {
      issues.push({ index, message: `Saldo esperado ${running}, registrado ${e.balanceAfter}` });
      running = e.balanceAfter;
    }
    if (!allowNegative && e.balanceAfter < 0) issues.push({ index, message: 'Saldo negativo' });
    if (e.kind === 'spend' && e.amount > 0) issues.push({ index, message: 'Gasto com valor positivo' });
    if (e.kind === 'earn' && e.amount < 0) issues.push({ index, message: 'Ganho com valor negativo' });
    if (e.kind === 'penalty' && e.amount > 0) issues.push({ index, message: 'Penalidade com valor positivo' });
  });
  return issues;
}

export interface PurchaseCheckInput {
  price: number;
  quantity: number;
  balance: number;
  active: boolean;
  availableFrom?: Date | null;
  availableUntil?: Date | null;
  now: Date;
  minLevel?: number | null;
  characterLevel: number;
  requiredAchievementUnlocked?: boolean | null;
  purchaseLimit?: number | null;
  alreadyPurchased: number;
  lockedUntil?: Date | null;
  /** Data da última compra (para recarga/cooldown). */
  lastPurchaseAt?: Date | null;
  cooldownDays?: number | null;
}

/** Retorna a lista de motivos que impedem a compra (vazia = permitida). */
export function purchaseBlockers(input: PurchaseCheckInput): string[] {
  const out: string[] = [];
  if (!input.active) out.push('Item indisponível');
  if (!Number.isInteger(input.quantity) || input.quantity < 1) out.push('Quantidade inválida');
  if (input.price < 0) out.push('Preço inválido');
  if (input.availableFrom && input.now < input.availableFrom) out.push('Item ainda não disponível');
  if (input.availableUntil && input.now > input.availableUntil) out.push('Período de disponibilidade encerrado');
  if (input.minLevel && input.characterLevel < input.minLevel) out.push(`Requer nível ${input.minLevel}`);
  if (input.requiredAchievementUnlocked === false) out.push('Requer uma conquista ainda não desbloqueada');
  if (input.purchaseLimit != null && input.alreadyPurchased + input.quantity > input.purchaseLimit) {
    out.push(`Limite de compras atingido (${input.purchaseLimit})`);
  }
  if (input.lockedUntil && input.now < input.lockedUntil) {
    out.push(`Recompensa bloqueada por penalidade até ${input.lockedUntil.toISOString().slice(0, 10)}`);
  }
  if (input.cooldownDays && input.lastPurchaseAt) {
    const next = new Date(input.lastPurchaseAt.getTime() + input.cooldownDays * 86_400_000);
    if (input.now < next) out.push(`Disponível novamente em ${next.toISOString().slice(0, 10)}`);
  }
  if (input.price * input.quantity > input.balance) out.push('Saldo insuficiente');
  return out;
}

/** Estimativa (não promessa) de dias até poder comprar um item, dado o ritmo líquido recente. */
export function daysToAfford(price: number, balance: number, netCoinsPerDay: number): number | null {
  if (balance >= price) return 0;
  if (netCoinsPerDay <= 0) return null;
  return Math.ceil((price - balance) / netCoinsPerDay);
}
