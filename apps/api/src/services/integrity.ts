import { asc, eq, sql } from 'drizzle-orm';
import { levelFromXp, totalsFromLedger, verifyLedger } from '@rpg/engine';
import type { DbOrTx } from '../db/client';
import { attributes, characterProgress, coinTransactions, grantAttributeXp, grantSkillXp, rewardGrants, skills, wallets } from '../db/schema';
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

  const ledger = await db.select().from(coinTransactions).where(eq(coinTransactions.userId, userId)).orderBy(asc(coinTransactions.seq));
  for (const i of verifyLedger(ledger)) issues.push({ area: 'Livro-razão de moedas', message: `Lançamento #${i.index + 1}: ${i.message}` });
  const totals = totalsFromLedger(ledger);
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  for (const k of ['balance', 'totalEarned', 'totalSpent', 'totalPenalties'] as const) {
    if ((w?.[k] ?? 0) !== totals[k]) issues.push({ area: 'Carteira', message: `${k} divergente do livro-razão`, expected: totals[k], actual: w?.[k] ?? 0 });
  }

  const [xp] = await db.select({ total: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` }).from(rewardGrants).where(eq(rewardGrants.userId, userId));
  const [cp] = await db.select().from(characterProgress).where(eq(characterProgress.userId, userId));
  if ((cp?.lifetimeXp ?? 0) !== (xp?.total ?? 0)) issues.push({ area: 'Personagem', message: 'XP vitalício divergente da soma das recompensas', expected: xp?.total ?? 0, actual: cp?.lifetimeXp ?? 0 });
  const expectedLevel = levelFromXp(xp?.total ?? 0, config.curves.character).level;
  if ((cp?.level ?? 1) !== expectedLevel) issues.push({ area: 'Personagem', message: 'Nível divergente da curva vigente', expected: expectedLevel, actual: cp?.level });

  const attrSums = await db
    .select({ id: grantAttributeXp.attributeId, total: sql<number>`coalesce(sum(${grantAttributeXp.amount}),0)::int` })
    .from(grantAttributeXp)
    .where(eq(grantAttributeXp.userId, userId))
    .groupBy(grantAttributeXp.attributeId);
  for (const a of await db.select().from(attributes).where(eq(attributes.userId, userId))) {
    const total = attrSums.find((x) => x.id === a.id)?.total ?? 0;
    if (a.xp !== total) issues.push({ area: 'Atributos', message: `${a.code}: XP divergente`, expected: total, actual: a.xp });
    const lvl = levelFromXp(total, config.curves.attribute).level;
    if (a.level !== lvl) issues.push({ area: 'Atributos', message: `${a.code}: nível divergente`, expected: lvl, actual: a.level });
  }
  const skillSums = await db
    .select({ id: grantSkillXp.skillId, total: sql<number>`coalesce(sum(${grantSkillXp.amount}),0)::int` })
    .from(grantSkillXp)
    .where(eq(grantSkillXp.userId, userId))
    .groupBy(grantSkillXp.skillId);
  for (const sk of await db.select().from(skills).where(eq(skills.userId, userId))) {
    const total = skillSums.find((x) => x.id === sk.id)?.total ?? 0;
    if (sk.xp !== total) issues.push({ area: 'Habilidades', message: `${sk.name}: XP divergente`, expected: total, actual: sk.xp });
  }
  return issues;
}

/** Recalcula todas as projeções a partir do livro-razão (recuperação de operações parciais). */
export async function rebuildProjections(tx: DbOrTx, userId: string) {
  const { config } = await getActiveConfig(tx, userId);
  const ledger = await tx.select().from(coinTransactions).where(eq(coinTransactions.userId, userId)).orderBy(asc(coinTransactions.seq));
  const totals = totalsFromLedger(ledger);
  await tx.insert(wallets).values({ userId }).onConflictDoNothing();
  await tx.update(wallets).set({ ...totals, updatedAt: new Date() }).where(eq(wallets.userId, userId));
  const [xp] = await tx.select({ total: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` }).from(rewardGrants).where(eq(rewardGrants.userId, userId));
  const lifetimeXp = Math.max(0, xp?.total ?? 0);
  await tx.insert(characterProgress).values({ userId }).onConflictDoNothing();
  await tx
    .update(characterProgress)
    .set({ lifetimeXp, level: levelFromXp(lifetimeXp, config.curves.character).level, updatedAt: new Date() })
    .where(eq(characterProgress.userId, userId));
  const attrSums = await tx
    .select({ id: grantAttributeXp.attributeId, total: sql<number>`coalesce(sum(${grantAttributeXp.amount}),0)::int` })
    .from(grantAttributeXp)
    .where(eq(grantAttributeXp.userId, userId))
    .groupBy(grantAttributeXp.attributeId);
  for (const a of await tx.select().from(attributes).where(eq(attributes.userId, userId))) {
    const total = Math.max(0, attrSums.find((x) => x.id === a.id)?.total ?? 0);
    await tx.update(attributes).set({ xp: total, level: levelFromXp(total, config.curves.attribute).level }).where(eq(attributes.id, a.id));
  }
  const skillSums = await tx
    .select({ id: grantSkillXp.skillId, total: sql<number>`coalesce(sum(${grantSkillXp.amount}),0)::int` })
    .from(grantSkillXp)
    .where(eq(grantSkillXp.userId, userId))
    .groupBy(grantSkillXp.skillId);
  for (const sk of await tx.select().from(skills).where(eq(skills.userId, userId))) {
    const total = Math.max(0, skillSums.find((x) => x.id === sk.id)?.total ?? 0);
    await tx.update(skills).set({ xp: total, level: levelFromXp(total, config.curves.mastery).level }).where(eq(skills.id, sk.id));
  }
  return checkIntegrity(tx, userId);
}
