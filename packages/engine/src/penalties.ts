import type { GameConfig } from './config';
import { PENALTY_TYPE_LABELS, type PenaltyType } from './types';

export interface PenaltyRule {
  type: PenaltyType;
  /** Quantidade na primeira falha (moedas, dias, unidades de progresso ou XP, conforme o tipo). */
  baseAmount: number;
  /** Acréscimo por falha consecutiva adicional. */
  escalationStep: number;
  /** Teto absoluto por ocorrência. */
  maxAmount: number;
  /** Duração em dias (redução de multiplicador / bloqueio de recompensa). */
  durationDays?: number | null;
  /** Redução do multiplicador de consistência (ex.: 0.05). */
  reductionPct?: number | null;
}

export interface PenaltyContext {
  /** Falhas consecutivas, incluindo a atual (≥ 1). */
  consecutiveMisses: number;
  coinsLostToday: number;
  coinsLostThisWeek: number;
  /** Saldo atual de moedas: a penalidade nunca deixa o saldo negativo. */
  balance: number;
  allowSkillXpLoss: boolean;
  /** Moedas ganhas na semana (antes desta penalidade). Ausente = sem teto proporcional. */
  coinsEarnedThisWeek?: number;
}

export interface PenaltyEffect {
  type: PenaltyType;
  /** Passo de escalonamento aplicado (1 = primeira falha). */
  step: number;
  /** Quantidade efetivamente aplicada após limites. */
  amount: number;
  /** Quantidade calculada antes dos limites. */
  requestedAmount: number;
  durationDays: number | null;
  reductionPct: number | null;
  /** True se algum limite reduziu a penalidade. */
  limited: boolean;
  /** True quando a regra não teve efeito material (apenas registro). */
  recordOnly: boolean;
  explanation: string[];
}

/** Quantidade escalonada: base + passo × (falhas consecutivas − 1), limitada ao teto. */
export function escalatedAmount(rule: PenaltyRule, consecutiveMisses: number): number {
  const n = Math.max(1, Math.floor(consecutiveMisses));
  return Math.max(0, Math.min(rule.maxAmount, rule.baseAmount + rule.escalationStep * (n - 1)));
}

export function computePenalty(rule: PenaltyRule, ctx: PenaltyContext, cfg: GameConfig): PenaltyEffect {
  const step = Math.max(1, Math.floor(ctx.consecutiveMisses));
  const requested = escalatedAmount(rule, step);
  const explanation = [
    `${PENALTY_TYPE_LABELS[rule.type]} — falha consecutiva nº ${step}`,
    `Cálculo: ${rule.baseAmount} + ${rule.escalationStep} × ${step - 1} = ${rule.baseAmount + rule.escalationStep * (step - 1)} (teto ${rule.maxAmount})`,
  ];
  const base: PenaltyEffect = {
    type: rule.type,
    step,
    amount: requested,
    requestedAmount: requested,
    durationDays: rule.durationDays ?? null,
    reductionPct: rule.reductionPct ?? null,
    limited: false,
    recordOnly: false,
    explanation,
  };

  switch (rule.type) {
    case 'failure_record':
    case 'forfeit_reward':
    case 'streak_reset':
      return { ...base, amount: 0, requestedAmount: 0, recordOnly: true };

    case 'coin_loss': {
      const dailyLeft = Math.max(0, cfg.penalties.dailyCoinCap - ctx.coinsLostToday);
      const weeklyLeft = Math.max(0, cfg.penalties.weeklyCoinCap - ctx.coinsLostThisWeek);
      const shareLeft =
        ctx.coinsEarnedThisWeek === undefined
          ? Number.POSITIVE_INFINITY
          : Math.max(0, Math.floor(ctx.coinsEarnedThisWeek * cfg.penalties.maxShareOfWeeklyEarnings) - ctx.coinsLostThisWeek);
      const amount = Math.max(0, Math.min(requested, dailyLeft, weeklyLeft, shareLeft, ctx.balance));
      const limited = amount < requested;
      if (limited) {
        if (amount === ctx.balance && ctx.balance < requested) explanation.push('Limitado ao saldo disponível (saldo nunca fica negativo)');
        if (amount === dailyLeft && dailyLeft < requested) explanation.push(`Limite diário de penalidades: ${cfg.penalties.dailyCoinCap} moedas`);
        if (amount === weeklyLeft && weeklyLeft < requested) explanation.push(`Limite semanal de penalidades: ${cfg.penalties.weeklyCoinCap} moedas`);
        if (amount === shareLeft && shareLeft < requested)
          explanation.push(`Teto proporcional: multas da semana limitadas a ${Math.round(cfg.penalties.maxShareOfWeeklyEarnings * 100)}% das moedas ganhas na semana`);
      }
      return { ...base, amount, limited, recordOnly: amount === 0 };
    }

    case 'skill_xp_loss': {
      if (!ctx.allowSkillXpLoss) {
        explanation.push('Perda de XP de habilidade está desabilitada nas configurações: apenas registrada');
        return { ...base, amount: 0, recordOnly: true, limited: true };
      }
      const amount = Math.min(requested, cfg.penalties.skillXpLossCap);
      if (amount < requested) explanation.push(`Limite por ocorrência: ${cfg.penalties.skillXpLossCap} XP`);
      return { ...base, amount, limited: amount < requested };
    }

    case 'multiplier_reduction': {
      const reductionPct = Math.min(0.5, Math.max(0, rule.reductionPct ?? 0.05));
      const durationDays = Math.min(30, Math.max(1, rule.durationDays ?? requested ?? 3));
      return { ...base, amount: 0, reductionPct, durationDays };
    }

    case 'reward_lock': {
      const durationDays = Math.min(30, Math.max(1, requested || rule.durationDays || 1));
      return { ...base, amount: 0, durationDays };
    }

    case 'mission_progress':
      return base;
  }
}

export interface SuppressionContext {
  habitPaused?: boolean;
  unavailable?: boolean;
  recoveryMode?: boolean;
  penaltiesSuspended?: boolean;
  isBasicNeed?: boolean;
  isRestDay?: boolean;
  missionSuspended?: boolean;
  rescheduledBeforeDeadline?: boolean;
}

/**
 * Retorna o motivo pelo qual uma penalidade NÃO deve ser aplicada, ou null.
 * Necessidades básicas (sono, alimentação, descanso) nunca são puníveis.
 */
export function penaltySuppressionReason(ctx: SuppressionContext): string | null {
  if (ctx.isBasicNeed) return 'Necessidade básica: nunca gera penalidade';
  if (ctx.habitPaused) return 'Hábito pausado';
  if (ctx.missionSuspended) return 'Missão suspensa';
  if (ctx.unavailable) return 'Indisponibilidade registrada';
  if (ctx.isRestDay) return 'Dia de descanso programado';
  if (ctx.recoveryMode) return 'Modo de recuperação ativo';
  if (ctx.penaltiesSuspended) return 'Penalidades suspensas temporariamente';
  if (ctx.rescheduledBeforeDeadline) return 'Reagendada antes do prazo';
  return null;
}
