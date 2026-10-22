import type { GameConfig } from './config';
import { DIFFICULTY_LABELS, type AttributeWeights, type Difficulty } from './types';

/**
 * Resultado de um cálculo de recompensa. XP geral, XP de atributos, maestria e
 * moedas são sistemas independentes; o resultado os mantém separados.
 */
export interface RewardResult {
  /** XP geral concedido ao personagem. */
  xp: number;
  coins: number;
  /** XP por código de atributo. */
  attributeXp: Record<string, number>;
  /** XP de maestria para a habilidade associada (se houver). */
  masteryXp: number;
  /** XP base antes de reduções, multiplicadores e limites. */
  baseXp: number;
  multiplier: number;
  /** True quando um limite diário reduziu a recompensa. */
  capped: boolean;
  /** Linhas legíveis explicando cada passo do cálculo. */
  explanation: string[];
}

export function emptyReward(): RewardResult {
  return { xp: 0, coins: 0, attributeXp: {}, masteryXp: 0, baseXp: 0, multiplier: 1, capped: false, explanation: [] };
}

/**
 * Minutos efetivos com retornos decrescentes:
 * 100% até `fullMinutes`, 50% até `halfUntilMinutes`, 25% até `quarterUntilMinutes`, 0 depois.
 * Desestimula sessões excessivamente longas apenas para ganhar XP.
 */
export function effectiveMinutes(minutes: number, cfg: GameConfig['timed']): number {
  const m = Math.max(0, minutes);
  const full = Math.min(m, cfg.fullMinutes);
  const half = Math.max(0, Math.min(m, cfg.halfUntilMinutes) - cfg.fullMinutes);
  const quarter = Math.max(0, Math.min(m, cfg.quarterUntilMinutes) - cfg.halfUntilMinutes);
  return full + half * 0.5 + quarter * 0.25;
}

/**
 * Distribui um total inteiro entre chaves por pesos (método do maior resto).
 * A soma do resultado é exatamente `total` quando há pesos positivos.
 */
export function distributeByWeights(total: number, weights: AttributeWeights): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => Number.isFinite(w) && w > 0);
  const out: Record<string, number> = {};
  if (total <= 0 || entries.length === 0) return out;
  const sum = entries.reduce((acc, [, w]) => acc + w, 0);
  const raw = entries.map(([k, w]) => ({ k, exact: (total * w) / sum }));
  let assigned = 0;
  for (const r of raw) {
    out[r.k] = Math.floor(r.exact);
    assigned += out[r.k]!;
  }
  const rest = raw.map((r) => ({ k: r.k, frac: r.exact - Math.floor(r.exact) })).sort((a, b) => b.frac - a.frac || a.k.localeCompare(b.k));
  for (let i = 0; i < total - assigned; i++) {
    const key = rest[i % rest.length]!.k;
    out[key] = (out[key] ?? 0) + 1;
  }
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
}

/**
 * Multiplicador de consistência baseado na taxa de cumprimento de hábitos na janela.
 * `dampening` é a redução ativa vinda de penalidades (ex.: 0.05) — nunca abaixo de 1.0.
 */
export function consistencyMultiplier(input: { completed: number; scheduled: number; dampening?: number }, cfg: GameConfig['consistency']): number {
  if (input.scheduled < cfg.minScheduled) return 1;
  const rate = input.completed / input.scheduled;
  const tier = [...cfg.tiers].sort((a, b) => b.minRate - a.minRate).find((t) => rate >= t.minRate);
  const mult = (tier?.multiplier ?? 1) - (input.dampening ?? 0);
  return Math.max(1, Math.round(mult * 1000) / 1000);
}

interface FinalizeInput {
  baseXp: number;
  baseCoins: number;
  decay: number;
  multiplier: number;
  /** XP já recebido hoje na mesma origem. */
  alreadyToday: number;
  dailyCap: number;
  attributeWeights: AttributeWeights;
  masteryXp: number;
  explanation: string[];
}

function finalize(input: FinalizeInput, cfg: GameConfig): RewardResult {
  const explanation = [...input.explanation];
  const preCap = input.baseXp * input.decay;
  if (input.decay < 1) explanation.push(`Retorno decrescente aplicado: ×${input.decay}`);
  const multiplied = Math.round(preCap * input.multiplier);
  if (input.multiplier > 1) explanation.push(`Multiplicador de consistência: ×${input.multiplier}`);
  const remaining = Math.max(0, input.dailyCap - input.alreadyToday);
  const xp = Math.min(multiplied, remaining);
  const capped = xp < multiplied;
  if (capped) {
    explanation.push(
      remaining === 0
        ? `Limite diário desta origem atingido (${input.dailyCap} XP): nenhum XP adicional hoje`
        : `Limite diário desta origem (${input.dailyCap} XP): concedidos ${xp} de ${multiplied} XP`,
    );
  }
  const ratio = multiplied === 0 ? 0 : xp / multiplied;
  const coins = Math.round(input.baseCoins * input.decay * input.multiplier * ratio);
  const attributeBase = Math.round(preCap * ratio * cfg.attributeXpFactor);
  const attributeXp = distributeByWeights(attributeBase, input.attributeWeights);
  const masteryXp = Math.round(input.masteryXp * input.decay * ratio);
  return {
    xp,
    coins,
    attributeXp,
    masteryXp,
    baseXp: input.baseXp,
    multiplier: input.multiplier,
    capped,
    explanation,
  };
}

export interface MissionRewardInput {
  difficulty: Difficulty;
  attributeWeights: AttributeWeights;
  /** Quantas missões Difícil+ já foram concluídas hoje (antes desta). */
  hardCompletedToday: number;
  xpFromMissionsToday: number;
  multiplier: number;
  /** Recompensa personalizada aprovada (substitui a tabela, mas nunca a ultrapassa em 2×). */
  override?: { xp?: number | null; coins?: number | null } | null;
}

export function computeMissionReward(input: MissionRewardInput, cfg: GameConfig): RewardResult {
  const table = cfg.difficulty[input.difficulty];
  const maxXp = table.xp * 2;
  const maxCoins = table.coins * 2;
  const baseXp = Math.min(input.override?.xp ?? table.xp, maxXp);
  const baseCoins = Math.min(input.override?.coins ?? table.coins, maxCoins);
  const explanation = [`Missão ${DIFFICULTY_LABELS[input.difficulty]}: base ${table.xp} XP / ${table.coins} moedas`];
  if (input.override?.xp != null || input.override?.coins != null) {
    explanation.push(`Recompensa personalizada: ${baseXp} XP / ${baseCoins} moedas (máximo 2× a tabela)`);
  }
  let decay = 1;
  const isHard = ['hard', 'very_hard', 'epic', 'legendary'].includes(input.difficulty);
  if (isHard) {
    const list = cfg.hardMissionDailyDecay;
    decay = list[Math.min(input.hardCompletedToday, list.length - 1)]!;
  }
  return finalize(
    {
      baseXp,
      baseCoins,
      decay,
      multiplier: input.multiplier,
      alreadyToday: input.xpFromMissionsToday,
      dailyCap: cfg.dailyXpCaps.mission,
      attributeWeights: input.attributeWeights,
      masteryXp: 0,
      explanation,
    },
    cfg,
  );
}

export interface HabitRewardInput {
  difficulty: Difficulty;
  attributeWeights: AttributeWeights;
  xpFromHabitsToday: number;
  multiplier: number;
}

export function computeHabitReward(input: HabitRewardInput, cfg: GameConfig): RewardResult {
  const table = cfg.difficulty[input.difficulty];
  return finalize(
    {
      baseXp: table.xp,
      baseCoins: table.coins,
      decay: 1,
      multiplier: input.multiplier,
      alreadyToday: input.xpFromHabitsToday,
      dailyCap: cfg.dailyXpCaps.habit,
      attributeWeights: input.attributeWeights,
      masteryXp: 0,
      explanation: [`Hábito ${DIFFICULTY_LABELS[input.difficulty]}: base ${table.xp} XP / ${table.coins} moedas`],
    },
    cfg,
  );
}

export interface TimedRewardInput {
  kind: 'study' | 'training';
  minutes: number;
  distanceKm?: number | null;
  attributeWeights: AttributeWeights;
  /** XP já recebido hoje nesta origem (estudos ou treinos). */
  alreadyToday: number;
  multiplier?: number;
  /** Fator de intensidade/tipo de atividade (0.5 – 1.5), configurado por tipo. */
  intensity?: number;
}

/** Recompensa por sessão com duração (estudo ou treino). */
export function computeTimedReward(input: TimedRewardInput, cfg: GameConfig): RewardResult {
  const rates = cfg.timed[input.kind];
  const eff = effectiveMinutes(input.minutes, cfg.timed);
  const intensity = Math.min(1.5, Math.max(0.5, input.intensity ?? 1));
  let baseXp = eff * rates.xpPerMinute * intensity;
  const explanation = [
    `${Math.round(input.minutes)} min registrados → ${Math.round(eff)} min efetivos (retornos decrescentes após ${cfg.timed.fullMinutes} min)`,
    `${rates.xpPerMinute} XP por minuto efetivo${intensity !== 1 ? ` × intensidade ${intensity}` : ''}`,
  ];
  if (input.kind === 'training' && input.distanceKm && input.distanceKm > 0) {
    const km = Math.min(input.distanceKm, cfg.timed.distanceCapKm);
    const bonus = km * cfg.timed.distanceXpPerKm;
    baseXp += bonus;
    explanation.push(
      `Distância: ${km.toFixed(1)} km × ${cfg.timed.distanceXpPerKm} XP${input.distanceKm > cfg.timed.distanceCapKm ? ` (limitado a ${cfg.timed.distanceCapKm} km)` : ''}`,
    );
  }
  const baseCoins = Math.floor(eff / 30) * rates.coinsPer30Min;
  return finalize(
    {
      baseXp: Math.round(baseXp),
      baseCoins,
      decay: 1,
      multiplier: input.multiplier ?? 1,
      alreadyToday: input.alreadyToday,
      dailyCap: cfg.dailyXpCaps[input.kind],
      attributeWeights: input.attributeWeights,
      masteryXp: Math.round(eff * rates.masteryPerMinute),
      explanation,
    },
    cfg,
  );
}

export interface QuickRewardInput {
  /** Quantas vezes o mesmo registro (chave normalizada) já foi feito hoje. */
  repeatIndex: number;
  xpFromQuickToday: number;
  attributeWeights: AttributeWeights;
}

/** Registro rápido de tarefa cotidiana: recompensa pequena, decrescente e limitada. */
export function computeQuickReward(input: QuickRewardInput, cfg: GameConfig): RewardResult {
  const list = cfg.quickRepeatDecay;
  const decay = list[Math.min(input.repeatIndex, list.length - 1)]!;
  return finalize(
    {
      baseXp: cfg.quickReward.xp,
      baseCoins: cfg.quickReward.coins,
      decay,
      multiplier: 1,
      alreadyToday: input.xpFromQuickToday,
      dailyCap: cfg.dailyXpCaps.quick,
      attributeWeights: input.attributeWeights,
      masteryXp: 0,
      explanation: [`Registro rápido: base ${cfg.quickReward.xp} XP / ${cfg.quickReward.coins} moedas`],
    },
    cfg,
  );
}

/** Recompensa fixa (conquistas, marcos, metas). Sem limite diário. */
export function computeFixedReward(input: { xp: number; coins: number; attributeWeights?: AttributeWeights; label: string }, cfg: GameConfig): RewardResult {
  return finalize(
    {
      baseXp: Math.max(0, Math.round(input.xp)),
      baseCoins: Math.max(0, Math.round(input.coins)),
      decay: 1,
      multiplier: 1,
      alreadyToday: 0,
      dailyCap: Number.MAX_SAFE_INTEGER,
      attributeWeights: input.attributeWeights ?? {},
      masteryXp: 0,
      explanation: [input.label],
    },
    cfg,
  );
}

/** Maestria por desempenho em avaliação: proporcional ao percentual obtido. */
export function assessmentMastery(score: number, maxScore: number, cfg: GameConfig): number {
  if (maxScore <= 0) return 0;
  const pct = Math.min(1, Math.max(0, score / maxScore));
  return Math.round(pct * cfg.study.assessmentMasteryMax);
}
