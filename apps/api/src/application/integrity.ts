import { levelFromXp, totalsFromLedger, verifyLedger } from '@rpg/engine';
import { attributeXpTotals, coinLedgerInOrder, skillXpTotals, totalGrantedXp } from '../persistence/queries/ledger-totals';
import {
  findCharacterProgress,
  listAttributes,
  listSkills,
  lockCharacterProgress,
  setAttributeXp,
  setSkillXp,
  updateCharacterProgress,
} from '../persistence/repositories/progression';
import { findWallet, overwriteWalletTotals } from '../persistence/repositories/wallets';
import type { DbOrTx } from '../persistence/unit-of-work';
import { getActiveConfig } from './config';

export interface IntegrityIssue {
  area: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

/** Compara cada projeção com o livro-razão (fonte da verdade). Não altera nada. */
export async function checkIntegrity(db: DbOrTx, userId: string): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];
  const { config } = await getActiveConfig(db, userId);

  const ledger = await coinLedgerInOrder(db, userId);
  for (const i of verifyLedger(ledger)) issues.push({ area: 'Livro-razão de moedas', message: `Lançamento #${i.index + 1}: ${i.message}` });
  const totals = totalsFromLedger(ledger);
  const w = await findWallet(db, userId);
  for (const k of ['balance', 'totalEarned', 'totalSpent', 'totalPenalties'] as const) {
    if ((w?.[k] ?? 0) !== totals[k]) issues.push({ area: 'Carteira', message: `${k} divergente do livro-razão`, expected: totals[k], actual: w?.[k] ?? 0 });
  }

  const xp = await totalGrantedXp(db, userId);
  const cp = await findCharacterProgress(db, userId);
  if ((cp?.lifetimeXp ?? 0) !== xp) issues.push({ area: 'Personagem', message: 'XP vitalício divergente da soma das recompensas', expected: xp, actual: cp?.lifetimeXp ?? 0 });
  const expectedLevel = levelFromXp(xp, config.curves.character).level;
  if ((cp?.level ?? 1) !== expectedLevel) issues.push({ area: 'Personagem', message: 'Nível divergente da curva vigente', expected: expectedLevel, actual: cp?.level });

  const attrSums = await attributeXpTotals(db, userId);
  for (const a of await listAttributes(db, userId)) {
    const total = attrSums.get(a.id) ?? 0;
    if (a.xp !== total) issues.push({ area: 'Atributos', message: `${a.code}: XP divergente`, expected: total, actual: a.xp });
    const lvl = levelFromXp(total, config.curves.attribute).level;
    if (a.level !== lvl) issues.push({ area: 'Atributos', message: `${a.code}: nível divergente`, expected: lvl, actual: a.level });
  }
  const skillSums = await skillXpTotals(db, userId);
  for (const sk of await listSkills(db, userId)) {
    const total = skillSums.get(sk.id) ?? 0;
    if (sk.xp !== total) issues.push({ area: 'Habilidades', message: `${sk.name}: XP divergente`, expected: total, actual: sk.xp });
  }
  return issues;
}

/** Recalcula todas as projeções a partir do livro-razão (recuperação de operações parciais). */
export async function rebuildProjections(tx: DbOrTx, userId: string) {
  const { config } = await getActiveConfig(tx, userId);
  await overwriteWalletTotals(tx, userId, totalsFromLedger(await coinLedgerInOrder(tx, userId)));
  const lifetimeXp = Math.max(0, await totalGrantedXp(tx, userId));
  await lockCharacterProgress(tx, userId);
  await updateCharacterProgress(tx, userId, { lifetimeXp, level: levelFromXp(lifetimeXp, config.curves.character).level });
  const attrSums = await attributeXpTotals(tx, userId);
  for (const a of await listAttributes(tx, userId)) {
    const total = Math.max(0, attrSums.get(a.id) ?? 0);
    await setAttributeXp(tx, a.id, total, levelFromXp(total, config.curves.attribute).level);
  }
  const skillSums = await skillXpTotals(tx, userId);
  for (const sk of await listSkills(tx, userId)) {
    const total = Math.max(0, skillSums.get(sk.id) ?? 0);
    await setSkillXp(tx, sk.id, total, levelFromXp(total, config.curves.mastery).level);
  }
  return checkIntegrity(tx, userId);
}
