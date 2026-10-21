import { z } from 'zod';
import { curveConfigSchema } from './curve';
import { DIFFICULTIES, MISSION_TYPES, type Difficulty, type MissionType } from './types';

const rewardPairSchema = z.object({
  xp: z.number().int().min(0).max(100_000),
  coins: z.number().int().min(0).max(100_000),
});

const timedRateSchema = z.object({
  /** XP geral por minuto efetivo. */
  xpPerMinute: z.number().min(0).max(10),
  /** Moedas por bloco de 30 minutos efetivos. */
  coinsPer30Min: z.number().min(0).max(100),
  /** XP de maestria (habilidade) por minuto efetivo. */
  masteryPerMinute: z.number().min(0).max(10),
});

/**
 * Configuração versionada da economia e da progressão.
 * Toda recompensa concedida grava a versão usada, impedindo que alterações
 * posteriores mudem silenciosamente resultados históricos.
 */
export const gameConfigSchema = z.object({
  version: z.number().int().min(1),
  curves: z.object({
    character: curveConfigSchema,
    attribute: curveConfigSchema,
    mastery: curveConfigSchema,
  }),
  difficulty: z.record(z.enum(DIFFICULTIES), rewardPairSchema),
  /** Dificuldade máxima permitida para cada tipo de missão (evita "lendárias" triviais). */
  maxDifficultyByMissionType: z.record(z.enum(MISSION_TYPES), z.enum(DIFFICULTIES)),
  /** Requisitos mínimos para dificuldades altas. */
  highDifficultyRules: z.object({
    epic: z.object({ minSpanDays: z.number().int().min(0), minObjectives: z.number().int().min(0) }),
    legendary: z.object({ minSpanDays: z.number().int().min(0), minObjectives: z.number().int().min(0) }),
  }),
  /** Redução para missões difíceis concluídas no mesmo dia (índice = ordem no dia). */
  hardMissionDailyDecay: z.array(z.number().min(0).max(1)).min(1),
  /** Retornos decrescentes por tempo de sessão. */
  timed: z.object({
    fullMinutes: z.number().int().min(1),
    halfUntilMinutes: z.number().int().min(1),
    quarterUntilMinutes: z.number().int().min(1),
    study: timedRateSchema,
    training: timedRateSchema,
    distanceXpPerKm: z.number().min(0).max(50),
    distanceCapKm: z.number().min(0).max(500),
  }),
  /** Limites diários de XP geral por origem (dia local do usuário). */
  dailyXpCaps: z.object({
    study: z.number().int().min(0),
    training: z.number().int().min(0),
    quick: z.number().int().min(0),
    mission: z.number().int().min(0),
    habit: z.number().int().min(0),
  }),
  /** Fator aplicado a repetições do mesmo registro rápido no mesmo dia. */
  quickRepeatDecay: z.array(z.number().min(0).max(1)).min(1),
  quickReward: rewardPairSchema,
  consistency: z.object({
    windowDays: z.number().int().min(3).max(90),
    /** Faixas ordenadas da maior taxa para a menor. */
    tiers: z.array(z.object({ minRate: z.number().min(0).max(1), multiplier: z.number().min(1).max(2) })),
    /** Mínimo de ocorrências programadas na janela para ativar o multiplicador. */
    minScheduled: z.number().int().min(1),
  }),
  penalties: z.object({
    dailyCoinCap: z.number().int().min(0),
    weeklyCoinCap: z.number().int().min(0),
    skillXpLossCap: z.number().int().min(0),
  }),
  /** Fração do XP geral (antes de multiplicadores) convertida em XP de atributos. */
  attributeXpFactor: z.number().min(0).max(5),
  study: z.object({
    unitCompletionMastery: z.number().int().min(0),
    assessmentMasteryMax: z.number().int().min(0),
    milestoneMastery: z.number().int().min(0),
  }),
  streakMilestones: z.array(
    z.object({ days: z.number().int().min(2), xp: z.number().int().min(0), coins: z.number().int().min(0) }),
  ),
});
export type GameConfig = z.infer<typeof gameConfigSchema>;

const DIFFICULTY_TABLE: Record<Difficulty, { xp: number; coins: number }> = {
  routine: { xp: 10, coins: 2 },
  easy: { xp: 20, coins: 4 },
  moderate: { xp: 40, coins: 8 },
  hard: { xp: 80, coins: 16 },
  very_hard: { xp: 150, coins: 30 },
  epic: { xp: 300, coins: 60 },
  legendary: { xp: 600, coins: 120 },
};

const MAX_DIFFICULTY: Record<MissionType, Difficulty> = {
  daily: 'hard',
  weekly: 'very_hard',
  monthly: 'epic',
  one_time: 'very_hard',
  recurring: 'hard',
  long_term: 'legendary',
  chain: 'epic',
  project: 'legendary',
  season: 'epic',
  secret: 'epic',
  milestone: 'legendary',
  special: 'epic',
};

/**
 * Valores padrão calibrados pelas simulações em `scripts/simulate.ts`
 * (ver docs/05-curva-de-xp.md e docs/06-economia.md).
 */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  version: 1,
  curves: {
    character: { kind: 'power', A: 13, p: 1.6, B: 45, maxLevel: 999 },
    attribute: { kind: 'power', A: 12, p: 1.5, B: 40, maxLevel: 999 },
    mastery: { kind: 'power', A: 10, p: 1.5, B: 30, maxLevel: 999 },
  },
  difficulty: DIFFICULTY_TABLE,
  maxDifficultyByMissionType: MAX_DIFFICULTY,
  highDifficultyRules: {
    epic: { minSpanDays: 7, minObjectives: 3 },
    legendary: { minSpanDays: 28, minObjectives: 3 },
  },
  hardMissionDailyDecay: [1, 1, 1, 0.5, 0.25],
  timed: {
    fullMinutes: 60,
    halfUntilMinutes: 120,
    quarterUntilMinutes: 240,
    study: { xpPerMinute: 1, coinsPer30Min: 4, masteryPerMinute: 0.5 },
    training: { xpPerMinute: 1, coinsPer30Min: 4, masteryPerMinute: 0.5 },
    distanceXpPerKm: 2,
    distanceCapKm: 21,
  },
  dailyXpCaps: {
    study: 300,
    training: 250,
    quick: 150,
    mission: 1500,
    habit: 400,
  },
  quickRepeatDecay: [1, 1, 0.5, 0.25, 0],
  quickReward: { xp: 10, coins: 2 },
  consistency: {
    windowDays: 14,
    tiers: [
      { minRate: 0.9, multiplier: 1.1 },
      { minRate: 0.75, multiplier: 1.05 },
    ],
    minScheduled: 7,
  },
  penalties: {
    dailyCoinCap: 40,
    weeklyCoinCap: 150,
    skillXpLossCap: 50,
  },
  attributeXpFactor: 1,
  study: {
    unitCompletionMastery: 25,
    assessmentMasteryMax: 150,
    milestoneMastery: 300,
  },
  streakMilestones: [
    { days: 7, xp: 50, coins: 15 },
    { days: 30, xp: 200, coins: 60 },
    { days: 100, xp: 600, coins: 180 },
    { days: 365, xp: 2000, coins: 500 },
  ],
};

export function parseGameConfig(input: unknown): GameConfig {
  return gameConfigSchema.parse(input);
}
