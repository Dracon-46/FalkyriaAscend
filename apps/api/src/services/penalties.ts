import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { addDays, computePenalty, startOfIsoWeek, type PenaltyRule } from '@rpg/engine';
import type { DbOrTx } from '../db/client';
import {
  coinTransactions,
  missionObjectives,
  missions,
  penaltyApplications,
  penaltyRules,
  rewardGrants,
  skills,
  userSettings,
  wallets,
} from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { audit } from './audit';
import { getActiveConfig } from './config';
import { notify } from './notifications';
import { grantReward, reverseGrant } from './rewards';
import { postCoinTx } from './wallet';

type RuleRow = typeof penaltyRules.$inferSelect;

export interface ApplyPenaltiesInput {
  userId: string;
  rules: RuleRow[];
  sourceType: 'habit' | 'mission';
  sourceId: string;
  sourceTitle: string;
  localDate: string;
  consecutiveMisses: number;
  /** Prefixo da chave de idempotência (ex.: habit:<id>:2026-10-21). */
  keyBase: string;
  categoryId?: string | null;
}

async function coinsLost(tx: DbOrTx, userId: string, from: string, to: string): Promise<number> {
  const [r] = await tx
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
  // Penalidades revertidas devolvem moedas; o limite considera apenas o que ficou aplicado.
  const [rev] = await tx
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

async function coinsEarned(tx: DbOrTx, userId: string, from: string, to: string): Promise<number> {
  const [r] = await tx
    .select({ total: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)::int` })
    .from(coinTransactions)
    .where(
      and(
        eq(coinTransactions.userId, userId),
        eq(coinTransactions.kind, 'earn'),
        gte(coinTransactions.localDate, from),
        lte(coinTransactions.localDate, to),
      ),
    );
  return r?.total ?? 0;
}

/** Aplica exatamente as regras configuradas para a origem. Idempotente por regra e ocorrência. */
export async function applyPenalties(tx: DbOrTx, input: ApplyPenaltiesInput) {
  const [settings] = await tx.select().from(userSettings).where(eq(userSettings.userId, input.userId));
  if (settings && !settings.penaltiesEnabled) return [];
  const { config } = await getActiveConfig(tx, input.userId);
  const applied: Array<typeof penaltyApplications.$inferSelect> = [];

  for (const rule of input.rules.filter((r) => r.active)) {
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, input.userId));
    const ctx = {
      consecutiveMisses: input.consecutiveMisses,
      coinsLostToday: await coinsLost(tx, input.userId, input.localDate, input.localDate),
      coinsLostThisWeek: await coinsLost(tx, input.userId, startOfIsoWeek(input.localDate), input.localDate),
      balance: wallet?.balance ?? 0,
      allowSkillXpLoss: settings?.allowSkillXpPenalty ?? false,
      coinsEarnedThisWeek: await coinsEarned(tx, input.userId, startOfIsoWeek(input.localDate), input.localDate),
    };
    const engineRule: PenaltyRule = {
      type: rule.type,
      baseAmount: rule.baseAmount,
      escalationStep: rule.escalationStep,
      maxAmount: rule.maxAmount,
      durationDays: rule.durationDays,
      reductionPct: rule.reductionPct,
    };
    const effect = computePenalty(engineRule, ctx, config);
    const expiresOn = effect.durationDays ? addDays(input.localDate, effect.durationDays - 1) : null;

    const inserted = await tx
      .insert(penaltyApplications)
      .values({
        userId: input.userId,
        ruleId: rule.id,
        ruleSnapshot: rule,
        idempotencyKey: `${input.keyBase}:rule:${rule.id}`,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceTitle: input.sourceTitle,
        localDate: input.localDate,
        type: rule.type,
        step: effect.step,
        amount: effect.amount,
        durationDays: effect.durationDays,
        reductionPct: effect.reductionPct,
        expiresOn: rule.type === 'multiplier_reduction' || rule.type === 'reward_lock' ? expiresOn : null,
        targetItemId: rule.type === 'reward_lock' ? rule.targetItemId : null,
        targetSkillId: rule.type === 'skill_xp_loss' ? rule.targetSkillId : null,
        explanation: effect.explanation,
      })
      .onConflictDoNothing()
      .returning();
    const app = inserted[0];
    if (!app) continue;

    if (rule.type === 'coin_loss' && effect.amount > 0) {
      await postCoinTx(tx, {
        userId: input.userId,
        amount: -effect.amount,
        kind: 'penalty',
        category: 'penalty',
        reason: `Penalidade: ${input.sourceTitle} (${rule.name})`,
        localDate: input.localDate,
        penaltyId: app.id,
      });
    }

    if (rule.type === 'skill_xp_loss' && effect.amount > 0 && rule.targetSkillId) {
      const [skill] = await tx.select().from(skills).where(eq(skills.id, rule.targetSkillId));
      const amount = Math.min(effect.amount, skill?.xp ?? 0);
      if (amount > 0) {
        await grantReward(tx, {
          userId: input.userId,
          idempotencyKey: `penalty:${app.id}`,
          sourceType: 'adjustment',
          sourceId: app.id,
          xpSource: 'adjustment',
          title: `Penalidade de habilidade: ${input.sourceTitle}`,
          localDate: input.localDate,
          reward: { xp: 0, coins: 0, attributeXp: {}, explanation: effect.explanation },
          skillXp: { [rule.targetSkillId]: -amount },
          allowNegative: true,
        });
      }
    }

    if (rule.type === 'mission_progress' && effect.amount > 0) {
      await reduceMissionProgress(tx, input, effect.amount);
    }

    applied.push(app);
    await notify(tx, input.userId, {
      category: 'penalty',
      title: `Penalidade aplicada: ${input.sourceTitle}`,
      body: effect.explanation.join(' · '),
      link: '/historico?aba=penalidades',
      dedupeKey: `penalty:${app.id}`,
    });
  }
  return applied;
}

/**
 * Redução de progresso: para missões, afeta objetivos manuais da missão-mãe; para hábitos,
 * objetivos manuais de missões ativas da mesma categoria. Nunca abaixo de zero.
 */
async function reduceMissionProgress(tx: DbOrTx, input: ApplyPenaltiesInput, amount: number) {
  let missionIds: string[] = [];
  if (input.sourceType === 'mission') {
    const [m] = await tx.select({ parentId: missions.parentId }).from(missions).where(eq(missions.id, input.sourceId));
    if (m?.parentId) missionIds = [m.parentId];
  } else if (input.categoryId) {
    const rows = await tx
      .select({ id: missions.id })
      .from(missions)
      .where(
        and(
          eq(missions.userId, input.userId),
          eq(missions.categoryId, input.categoryId),
          inArray(missions.status, ['available', 'in_progress']),
        ),
      );
    missionIds = rows.map((r) => r.id);
  }
  if (missionIds.length === 0) return;
  await tx
    .update(missionObjectives)
    .set({ current: sql`greatest(0, ${missionObjectives.current} - ${amount})` })
    .where(and(inArray(missionObjectives.missionId, missionIds), eq(missionObjectives.metric, 'manual')));
}

/** Itens bloqueados por penalidades ativas (reward_lock). */
export async function activeItemLocks(db: DbOrTx, userId: string, today: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ itemId: penaltyApplications.targetItemId, until: penaltyApplications.expiresOn })
    .from(penaltyApplications)
    .where(
      and(
        eq(penaltyApplications.userId, userId),
        eq(penaltyApplications.type, 'reward_lock'),
        eq(penaltyApplications.status, 'applied'),
        gte(penaltyApplications.expiresOn, today),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) if (r.itemId && r.until) map.set(r.itemId, r.until > (map.get(r.itemId) ?? '') ? r.until : map.get(r.itemId)!);
  return map;
}

/** Reverte uma penalidade aplicada incorretamente, devolvendo seus efeitos e registrando auditoria. */
export async function revertPenalty(tx: DbOrTx, userId: string, penaltyId: string, reason: string, actorId: string | null) {
  const [app] = await tx
    .select()
    .from(penaltyApplications)
    .where(and(eq(penaltyApplications.id, penaltyId), eq(penaltyApplications.userId, userId)))
    .for('update');
  if (!app) throw notFound('Penalidade');
  if (app.status === 'reversed') throw conflict('Penalidade já revertida');

  const [coinTx] = await tx
    .select()
    .from(coinTransactions)
    .where(and(eq(coinTransactions.penaltyId, app.id), eq(coinTransactions.kind, 'penalty')));
  if (coinTx) {
    await postCoinTx(tx, {
      userId,
      amount: -coinTx.amount,
      kind: 'reversal',
      category: 'penalty',
      reason: `Reversão de penalidade: ${app.sourceTitle} — ${reason}`,
      localDate: app.localDate,
      penaltyId: app.id,
      reversalOf: coinTx.id,
      actorId,
    });
  }
  const [skillGrant] = await tx
    .select()
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), eq(rewardGrants.idempotencyKey, `penalty:${app.id}`), isNull(rewardGrants.reversedAt)));
  if (skillGrant) await reverseGrant(tx, userId, skillGrant.id, reason, actorId);

  const [updated] = await tx
    .update(penaltyApplications)
    .set({ status: 'reversed', reversedAt: new Date(), reversalReason: reason })
    .where(eq(penaltyApplications.id, app.id))
    .returning();
  await audit(tx, { actorId, userId, action: 'penalty.revert', entityType: 'penalty_applications', entityId: app.id, before: app, after: updated, meta: { reason } });
  return updated!;
}
