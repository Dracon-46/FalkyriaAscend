import { addDays, computePenalty, startOfIsoWeek, type PenaltyRule } from '@rpg/engine';
import type { PenaltyApplication, PenaltyRule as RuleRow } from '../persistence/models';
import { findActiveGrantByKey } from '../persistence/repositories/ledger';
import { activeMissionIdsInCategory, findMission } from '../persistence/repositories/missions';
import {
  activeRewardLocks,
  insertApplicationIfNew,
  lockApplication,
  markApplicationReversed,
  reduceManualObjectives,
} from '../persistence/repositories/penalties';
import { findSkill } from '../persistence/repositories/progression';
import { findSettings } from '../persistence/repositories/settings';
import { findPenaltyCoinTx, findWallet, sumCoinsEarned, sumPenaltyCoinsLost } from '../persistence/repositories/wallets';
import type { DbOrTx } from '../persistence/unit-of-work';
import { conflict, notFound } from '../shared/errors';
import { audit } from './audit';
import { getActiveConfig } from './config';
import { notify } from './notifications';
import { grantReward, reverseGrant } from './rewards';
import { postCoinTx } from './wallet';

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

/** Aplica exatamente as regras configuradas para a origem. Idempotente por regra e ocorrência. */
export async function applyPenalties(tx: DbOrTx, input: ApplyPenaltiesInput) {
  const settings = await findSettings(tx, input.userId);
  if (settings && !settings.penaltiesEnabled) return [];
  const { config } = await getActiveConfig(tx, input.userId);
  const applied: PenaltyApplication[] = [];

  for (const rule of input.rules.filter((r) => r.active)) {
    const wallet = await findWallet(tx, input.userId);
    const ctx = {
      consecutiveMisses: input.consecutiveMisses,
      coinsLostToday: await sumPenaltyCoinsLost(tx, input.userId, input.localDate, input.localDate),
      coinsLostThisWeek: await sumPenaltyCoinsLost(tx, input.userId, startOfIsoWeek(input.localDate), input.localDate),
      balance: wallet?.balance ?? 0,
      allowSkillXpLoss: settings?.allowSkillXpPenalty ?? false,
      coinsEarnedThisWeek: await sumCoinsEarned(tx, input.userId, startOfIsoWeek(input.localDate), input.localDate),
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

    const app = await insertApplicationIfNew(tx, {
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
    });
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
      const skill = await findSkill(tx, rule.targetSkillId);
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
    const m = await findMission(tx, input.userId, input.sourceId);
    if (m?.parentId) missionIds = [m.parentId];
  } else if (input.categoryId) {
    missionIds = await activeMissionIdsInCategory(tx, input.userId, input.categoryId);
  }
  await reduceManualObjectives(tx, missionIds, amount);
}

/** Itens bloqueados por penalidades ativas (reward_lock). */
export async function activeItemLocks(db: DbOrTx, userId: string, today: string): Promise<Map<string, string>> {
  const rows = await activeRewardLocks(db, userId, today);
  const map = new Map<string, string>();
  for (const r of rows) if (r.itemId && r.until) map.set(r.itemId, r.until > (map.get(r.itemId) ?? '') ? r.until : map.get(r.itemId)!);
  return map;
}

/** Reverte uma penalidade aplicada incorretamente, devolvendo seus efeitos e registrando auditoria. */
export async function revertPenalty(tx: DbOrTx, userId: string, penaltyId: string, reason: string, actorId: string | null) {
  const app = await lockApplication(tx, userId, penaltyId);
  if (!app) throw notFound('Penalidade');
  if (app.status === 'reversed') throw conflict('Penalidade já revertida');

  const coinTx = await findPenaltyCoinTx(tx, app.id);
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
  const skillGrant = await findActiveGrantByKey(tx, userId, `penalty:${app.id}`);
  if (skillGrant) await reverseGrant(tx, userId, skillGrant.id, reason, actorId);

  const updated = await markApplicationReversed(tx, app.id, reason);
  await audit(tx, {
    actorId,
    userId,
    action: 'penalty.revert',
    entityType: 'penalty_applications',
    entityId: app.id,
    before: app,
    after: updated,
    meta: { reason },
  });
  return updated;
}
