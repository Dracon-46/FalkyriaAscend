import type { GameConfig } from './config';
import { cumulativeXpForLevel, levelFromXp } from './curve';
import { computeHabitReward, computeMissionReward, computeTimedReward, consistencyMultiplier } from './rewards';
import { escalatedAmount } from './penalties';
import type { Difficulty } from './types';

/**
 * Simulação de progressão e economia usando as MESMAS funções de recompensa da API.
 * Serve para calibrar parâmetros e para a pré-visualização de mudanças de curva.
 */

export interface ActivityProfile {
  key: string;
  label: string;
  description: string;
  /** Probabilidade de o dia ser "ativo", em função do dia (permite ciclos). */
  activeProbability: (day: number) => number;
  habitsScheduled: number;
  /** Probabilidade de cumprir cada hábito num dia ativo. */
  habitCompletion: number;
  study: { probability: number; minutes: number };
  training: { probability: number; minutes: number; km: number };
  dailyMissions: Array<{ difficulty: Difficulty; probability: number }>;
  /** Missão semanal concluída no domingo com esta probabilidade. */
  weeklyMission?: { difficulty: Difficulty; probability: number };
  monthlyMission?: { difficulty: Difficulty; probability: number };
}

export const DEFAULT_PROFILES: ActivityProfile[] = [
  {
    key: 'low',
    label: 'Pouco ativo',
    description: '~40% dos dias ativos; 2 de 4 hábitos; estudo e treino curtos e esporádicos.',
    activeProbability: () => 0.4,
    habitsScheduled: 4,
    habitCompletion: 0.5,
    study: { probability: 0.35, minutes: 30 },
    training: { probability: 0.3, minutes: 35, km: 0 },
    dailyMissions: [{ difficulty: 'easy', probability: 0.3 }],
  },
  {
    key: 'moderate',
    label: 'Moderadamente ativo',
    description: '~75% dos dias ativos; 5 hábitos (80%); 1h de estudo e ~50 min de treino em metade dos dias.',
    activeProbability: () => 0.75,
    habitsScheduled: 5,
    habitCompletion: 0.8,
    study: { probability: 0.6, minutes: 60 },
    training: { probability: 0.5, minutes: 50, km: 3 },
    dailyMissions: [{ difficulty: 'moderate', probability: 0.6 }],
    weeklyMission: { difficulty: 'hard', probability: 0.6 },
  },
  {
    key: 'high',
    label: 'Altamente consistente',
    description: '~93% dos dias ativos; 6 hábitos (95%); 90 min de estudo e 1h de treino quase diários.',
    activeProbability: () => 0.93,
    habitsScheduled: 6,
    habitCompletion: 0.95,
    study: { probability: 0.8, minutes: 90 },
    training: { probability: 0.8, minutes: 60, km: 5 },
    dailyMissions: [
      { difficulty: 'moderate', probability: 0.85 },
      { difficulty: 'hard', probability: 0.3 },
    ],
    weeklyMission: { difficulty: 'very_hard', probability: 0.85 },
    monthlyMission: { difficulty: 'epic', probability: 0.6 },
  },
  {
    key: 'cyclic',
    label: 'Alterna atividade e pausa',
    description: '6 semanas no ritmo alto, 4 semanas quase inativo (10% dos dias), em ciclos.',
    activeProbability: (day) => (day % 70 < 42 ? 0.9 : 0.1),
    habitsScheduled: 5,
    habitCompletion: 0.85,
    study: { probability: 0.7, minutes: 75 },
    training: { probability: 0.65, minutes: 55, km: 4 },
    dailyMissions: [{ difficulty: 'moderate', probability: 0.7 }],
    weeklyMission: { difficulty: 'hard', probability: 0.6 },
  },
];

/** PRNG determinístico (mulberry32) para simulações reprodutíveis. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulationOptions {
  days: number;
  seed?: number;
  levelMarks?: number[];
  /** Penalidade por hábito perdido (regra coin_loss padrão). */
  penalty?: { base: number; step: number; max: number } | null;
}

export interface SimulationResult {
  profile: string;
  label: string;
  days: number;
  finalXp: number;
  finalLevel: number;
  /** Dia (1-based) em que cada nível marcado foi atingido, ou null. */
  levelReachedDay: Record<number, number | null>;
  avgXpPerDay: number;
  avgCoinsPerDay: number;
  avgPenaltyCoinsPerDay: number;
  totalCoins: number;
  /** Série mensal (a cada 30 dias) de nível. */
  levelByMonth: number[];
}

export function simulateProfile(profile: ActivityProfile, cfg: GameConfig, opts: SimulationOptions): SimulationResult {
  const rand = mulberry32(opts.seed ?? 42);
  const marks = opts.levelMarks ?? [2, 5, 10, 20, 30, 45, 60, 80, 100];
  const reached: Record<number, number | null> = Object.fromEntries(marks.map((m) => [m, null]));
  const habitHistory: Array<{ scheduled: number; done: number }> = [];
  let xp = 0;
  let coins = 0;
  let penaltyCoins = 0;
  let consecutiveMisses = 0;
  let earnedWeek = 0;
  let lostWeek = 0;
  const levelByMonth: number[] = [];

  for (let day = 0; day < opts.days; day++) {
    if (day % 7 === 0) {
      earnedWeek = 0;
      lostWeek = 0;
    }
    const coinsAtStart = coins;
    const window = habitHistory.slice(-cfg.consistency.windowDays);
    const mult = consistencyMultiplier(
      {
        scheduled: window.reduce((a, h) => a + h.scheduled, 0),
        completed: window.reduce((a, h) => a + h.done, 0),
      },
      cfg.consistency,
    );
    const active = rand() < profile.activeProbability(day);
    let habitsDone = 0;
    let habitXpToday = 0;
    let missionXpToday = 0;
    let hardToday = 0;
    let dayPenalty = 0;

    for (let h = 0; h < profile.habitsScheduled; h++) {
      const done = active && rand() < profile.habitCompletion;
      if (done) {
        habitsDone++;
        const r = computeHabitReward(
          { difficulty: 'routine', attributeWeights: {}, xpFromHabitsToday: habitXpToday, multiplier: mult },
          cfg,
        );
        habitXpToday += r.xp;
        xp += r.xp;
        coins += r.coins;
      }
      // Apenas o primeiro hábito tem penalidade configurada (configuração típica e conservadora).
      if (h === 0) {
        consecutiveMisses = done ? 0 : consecutiveMisses + 1;
        if (!done && opts.penalty) {
          const amount = Math.min(
            escalatedAmount(
              { type: 'coin_loss', baseAmount: opts.penalty.base, escalationStep: opts.penalty.step, maxAmount: opts.penalty.max },
              consecutiveMisses,
            ),
            cfg.penalties.dailyCoinCap - dayPenalty,
            cfg.penalties.weeklyCoinCap - lostWeek - dayPenalty,
            Math.floor(earnedWeek * cfg.penalties.maxShareOfWeeklyEarnings) - lostWeek - dayPenalty,
            coins,
          );
          dayPenalty += Math.max(0, amount);
        }
      }
    }
    coins -= dayPenalty;
    penaltyCoins += dayPenalty;
    lostWeek += dayPenalty;
    habitHistory.push({ scheduled: profile.habitsScheduled, done: habitsDone });

    if (active) {
      if (rand() < profile.study.probability) {
        const r = computeTimedReward({ kind: 'study', minutes: profile.study.minutes, attributeWeights: {}, alreadyToday: 0, multiplier: 1 }, cfg);
        xp += r.xp;
        coins += r.coins;
      }
      if (rand() < profile.training.probability) {
        const r = computeTimedReward(
          { kind: 'training', minutes: profile.training.minutes, distanceKm: profile.training.km, attributeWeights: {}, alreadyToday: 0 },
          cfg,
        );
        xp += r.xp;
        coins += r.coins;
      }
      const extra: Array<{ difficulty: Difficulty; probability: number }> = [...profile.dailyMissions];
      if (profile.weeklyMission && day % 7 === 6) extra.push(profile.weeklyMission);
      if (profile.monthlyMission && day % 30 === 29) extra.push(profile.monthlyMission);
      for (const m of extra) {
        if (rand() < m.probability) {
          const r = computeMissionReward(
            { difficulty: m.difficulty, attributeWeights: {}, hardCompletedToday: hardToday, xpFromMissionsToday: missionXpToday, multiplier: mult },
            cfg,
          );
          if (['hard', 'very_hard', 'epic', 'legendary'].includes(m.difficulty)) hardToday++;
          missionXpToday += r.xp;
          xp += r.xp;
          coins += r.coins;
        }
      }
    }

    earnedWeek += Math.max(0, coins - coinsAtStart + dayPenalty);
    const lvl = levelFromXp(xp, cfg.curves.character).level;
    for (const m of marks) if (reached[m] === null && lvl >= m) reached[m] = day + 1;
    if ((day + 1) % 30 === 0) levelByMonth.push(lvl);
  }

  return {
    profile: profile.key,
    label: profile.label,
    days: opts.days,
    finalXp: xp,
    finalLevel: levelFromXp(xp, cfg.curves.character).level,
    levelReachedDay: reached,
    avgXpPerDay: xp / opts.days,
    avgCoinsPerDay: (coins + penaltyCoins) / opts.days,
    avgPenaltyCoinsPerDay: penaltyCoins / opts.days,
    totalCoins: coins,
    levelByMonth,
  };
}

/** Formata um número de dias como texto curto (d / meses / anos). */
export function formatDuration(days: number | null): string {
  if (days === null) return '—';
  if (days < 60) return `${days} d`;
  if (days < 730) return `${(days / 30.44).toFixed(1)} meses`;
  return `${(days / 365.25).toFixed(1)} anos`;
}

/** Tabela de referência: XP por nível e acumulado. */
export function curveTable(cfg: GameConfig['curves']['character'], levels: number[]): Array<{ level: number; required: number; cumulative: number }> {
  return levels.map((level) => ({
    level,
    required: level <= 1 ? 0 : cumulativeXpForLevel(level, cfg) - cumulativeXpForLevel(level - 1, cfg),
    cumulative: cumulativeXpForLevel(level, cfg),
  }));
}
