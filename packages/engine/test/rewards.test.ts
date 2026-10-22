import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_CONFIG as cfg,
  assessmentMastery,
  computeFixedReward,
  computeHabitReward,
  computeMissionReward,
  computeQuickReward,
  computeTimedReward,
  consistencyMultiplier,
  distributeByWeights,
  effectiveMinutes,
} from '../src';

describe('minutos efetivos (retornos decrescentes)', () => {
  it('100% até 60, 50% até 120, 25% até 240, zero depois', () => {
    expect(effectiveMinutes(30, cfg.timed)).toBe(30);
    expect(effectiveMinutes(60, cfg.timed)).toBe(60);
    expect(effectiveMinutes(120, cfg.timed)).toBe(90);
    expect(effectiveMinutes(240, cfg.timed)).toBe(120);
    expect(effectiveMinutes(600, cfg.timed)).toBe(120);
    expect(effectiveMinutes(-10, cfg.timed)).toBe(0);
  });
});

describe('distribuição por pesos', () => {
  it('soma exatamente o total e respeita proporções', () => {
    const out = distributeByWeights(100, { FOR: 0.7, RES: 0.2, DIS: 0.1 });
    expect(out).toEqual({ FOR: 70, RES: 20, DIS: 10 });
    const odd = distributeByWeights(10, { A: 1, B: 1, C: 1 });
    expect(Object.values(odd).reduce((a, b) => a + b, 0)).toBe(10);
  });
  it('ignora pesos inválidos e totais nulos', () => {
    expect(distributeByWeights(0, { A: 1 })).toEqual({});
    expect(distributeByWeights(10, { A: 0, B: -1 })).toEqual({});
    expect(distributeByWeights(10, { A: Number.NaN, B: 2 })).toEqual({ B: 10 });
  });
});

describe('recompensa de missão', () => {
  it('usa a tabela de dificuldade', () => {
    const r = computeMissionReward({ difficulty: 'hard', attributeWeights: { EXE: 1 }, hardCompletedToday: 0, xpFromMissionsToday: 0, multiplier: 1 }, cfg);
    expect(r.xp).toBe(80);
    expect(r.coins).toBe(16);
    expect(r.attributeXp).toEqual({ EXE: 80 });
    expect(r.explanation.length).toBeGreaterThan(0);
  });

  it('aplica retorno decrescente para muitas missões difíceis no mesmo dia', () => {
    const fourth = computeMissionReward({ difficulty: 'hard', attributeWeights: {}, hardCompletedToday: 3, xpFromMissionsToday: 0, multiplier: 1 }, cfg);
    expect(fourth.xp).toBe(40);
    const tenth = computeMissionReward({ difficulty: 'hard', attributeWeights: {}, hardCompletedToday: 9, xpFromMissionsToday: 0, multiplier: 1 }, cfg);
    expect(tenth.xp).toBe(20);
  });

  it('missões fáceis não sofrem a redução de missões difíceis', () => {
    const r = computeMissionReward({ difficulty: 'easy', attributeWeights: {}, hardCompletedToday: 10, xpFromMissionsToday: 0, multiplier: 1 }, cfg);
    expect(r.xp).toBe(20);
  });

  it('recompensa personalizada nunca passa de 2× a tabela', () => {
    const r = computeMissionReward(
      {
        difficulty: 'moderate',
        attributeWeights: {},
        hardCompletedToday: 0,
        xpFromMissionsToday: 0,
        multiplier: 1,
        override: { xp: 10_000, coins: 9_999 },
      },
      cfg,
    );
    expect(r.xp).toBe(80);
    expect(r.coins).toBe(16);
  });

  it('respeita o limite diário e reduz moedas e atributos proporcionalmente', () => {
    const r = computeMissionReward(
      {
        difficulty: 'hard',
        attributeWeights: { EXE: 1 },
        hardCompletedToday: 0,
        xpFromMissionsToday: cfg.dailyXpCaps.mission - 40,
        multiplier: 1,
      },
      cfg,
    );
    expect(r.xp).toBe(40);
    expect(r.capped).toBe(true);
    expect(r.coins).toBe(8);
    expect(r.attributeXp.EXE).toBe(40);
  });

  it('multiplicador de consistência afeta XP geral e moedas, não atributos', () => {
    const r = computeMissionReward({ difficulty: 'hard', attributeWeights: { EXE: 1 }, hardCompletedToday: 0, xpFromMissionsToday: 0, multiplier: 1.1 }, cfg);
    expect(r.xp).toBe(88);
    expect(r.coins).toBe(18);
    expect(r.attributeXp.EXE).toBe(80);
  });
});

describe('recompensa por tempo', () => {
  it('sessão de estudo de 60 min', () => {
    const r = computeTimedReward({ kind: 'study', minutes: 60, attributeWeights: { INT: 1 }, alreadyToday: 0 }, cfg);
    expect(r.xp).toBe(60);
    expect(r.coins).toBe(8);
    expect(r.masteryXp).toBe(30);
  });

  it('sessões absurdamente longas não geram XP ilimitado', () => {
    const r8h = computeTimedReward({ kind: 'study', minutes: 480, attributeWeights: {}, alreadyToday: 0 }, cfg);
    const r4h = computeTimedReward({ kind: 'study', minutes: 240, attributeWeights: {}, alreadyToday: 0 }, cfg);
    expect(r8h.xp).toBe(r4h.xp);
    expect(r8h.xp).toBe(120);
  });

  it('distância concede bônus limitado', () => {
    const r = computeTimedReward({ kind: 'training', minutes: 60, distanceKm: 42.2, attributeWeights: {}, alreadyToday: 0 }, cfg);
    expect(r.xp).toBe(60 + 21 * 2);
  });

  it('limite diário por origem impede acúmulo ilimitado', () => {
    const r = computeTimedReward({ kind: 'training', minutes: 60, attributeWeights: {}, alreadyToday: cfg.dailyXpCaps.training }, cfg);
    expect(r.xp).toBe(0);
    expect(r.coins).toBe(0);
    expect(r.masteryXp).toBe(0);
    expect(r.capped).toBe(true);
  });

  it('intensidade é limitada a [0.5, 1.5]', () => {
    const r = computeTimedReward({ kind: 'training', minutes: 60, attributeWeights: {}, alreadyToday: 0, intensity: 10 }, cfg);
    expect(r.xp).toBe(90);
  });
});

describe('registro rápido', () => {
  it('repetições do mesmo registro no dia decrescem até zero', () => {
    const xs = [0, 1, 2, 3, 4, 5].map((i) => computeQuickReward({ repeatIndex: i, xpFromQuickToday: 0, attributeWeights: {} }, cfg).xp);
    expect(xs).toEqual([10, 10, 5, 3, 0, 0]);
  });
});

describe('hábito, recompensas fixas e avaliações', () => {
  it('hábito rotineiro', () => {
    const r = computeHabitReward({ difficulty: 'routine', attributeWeights: { DIS: 1 }, xpFromHabitsToday: 0, multiplier: 1 }, cfg);
    expect(r).toMatchObject({ xp: 10, coins: 2, attributeXp: { DIS: 10 } });
  });
  it('recompensa fixa não tem limite diário', () => {
    expect(computeFixedReward({ xp: 5000, coins: 100, label: 'Conquista' }, cfg).xp).toBe(5000);
  });
  it('maestria por avaliação é proporcional ao desempenho', () => {
    expect(assessmentMastery(7, 10, cfg)).toBe(105);
    expect(assessmentMastery(12, 10, cfg)).toBe(150);
    expect(assessmentMastery(1, 0, cfg)).toBe(0);
  });
});

describe('multiplicador de consistência', () => {
  it('faixas por taxa de cumprimento', () => {
    expect(consistencyMultiplier({ completed: 14, scheduled: 14 }, cfg.consistency)).toBe(1.1);
    expect(consistencyMultiplier({ completed: 11, scheduled: 14 }, cfg.consistency)).toBe(1.05);
    expect(consistencyMultiplier({ completed: 5, scheduled: 14 }, cfg.consistency)).toBe(1);
  });
  it('exige um mínimo de ocorrências e nunca fica abaixo de 1', () => {
    expect(consistencyMultiplier({ completed: 3, scheduled: 3 }, cfg.consistency)).toBe(1);
    expect(consistencyMultiplier({ completed: 14, scheduled: 14, dampening: 0.5 }, cfg.consistency)).toBe(1);
    expect(consistencyMultiplier({ completed: 14, scheduled: 14, dampening: 0.05 }, cfg.consistency)).toBe(1.05);
  });
});
