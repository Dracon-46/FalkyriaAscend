import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_CONFIG,
  cumulativeXpForLevel,
  curveConfigSchema,
  levelFromXp,
  levelsCrossed,
  maxReachableLevel,
  xpRequired,
  type CurveConfig,
} from '../src';

const power = DEFAULT_GAME_CONFIG.curves.character;
const curves: CurveConfig[] = [
  power,
  { kind: 'exponential', base: 150, growth: 1.06, maxLevel: 999 },
  { kind: 'hybrid', A: 18, p: 1.6, B: 70, knee: 25, growth: 1.015, maxLevel: 999 },
];

describe('curva de XP', () => {
  it.each(curves)('é estritamente crescente por nível (%o)', (cfg) => {
    let prev = 0;
    for (let n = 2; n <= 300; n++) {
      const req = xpRequired(n, cfg);
      expect(req).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(req)).toBe(true);
      if (cfg.kind !== 'exponential' || n > 2) expect(req).toBeGreaterThanOrEqual(prev);
      prev = req;
    }
  });

  it('XP acumulado é a soma dos requisitos', () => {
    let sum = 0;
    for (let n = 2; n <= 120; n++) {
      sum += xpRequired(n, power);
      expect(cumulativeXpForLevel(n, power)).toBe(sum);
    }
    expect(cumulativeXpForLevel(1, power)).toBe(0);
  });

  it('usa a fórmula A·n^p + B arredondada', () => {
    expect(xpRequired(2, power)).toBe(Math.round(13 * 2 ** 1.6 + 45));
    expect(xpRequired(10, power)).toBe(Math.round(13 * 10 ** 1.6 + 45));
  });

  it('rejeita nível de destino inválido', () => {
    expect(() => xpRequired(1, power)).toThrow();
    expect(() => xpRequired(2.5, power)).toThrow();
  });

  it('deriva nível, XP no nível e restante a partir do XP vitalício', () => {
    const l5 = cumulativeXpForLevel(5, power);
    const s = levelFromXp(l5 + 10, power);
    expect(s.level).toBe(5);
    expect(s.xpIntoLevel).toBe(10);
    expect(s.xpForNextLevel).toBe(xpRequired(6, power));
    expect(s.xpToNextLevel).toBe(xpRequired(6, power) - 10);
    expect(s.progress).toBeCloseTo(10 / xpRequired(6, power));
  });

  it('limites exatos: exatamente o acumulado sobe de nível; 1 XP a menos não', () => {
    for (const lvl of [2, 3, 10, 50, 100]) {
      const need = cumulativeXpForLevel(lvl, power);
      expect(levelFromXp(need, power).level).toBe(lvl);
      expect(levelFromXp(need - 1, power).level).toBe(lvl - 1);
    }
  });

  it('XP zero, negativo ou fracionário é tratado com segurança', () => {
    expect(levelFromXp(0, power).level).toBe(1);
    expect(levelFromXp(-50, power).level).toBe(1);
    expect(levelFromXp(120.9, power).totalXp).toBe(120);
  });

  it('subida de vários níveis em uma única operação', () => {
    const crossed = levelsCrossed(0, cumulativeXpForLevel(7, power) + 1, power);
    expect(crossed).toEqual([2, 3, 4, 5, 6, 7]);
    expect(levelsCrossed(500, 500, power)).toEqual([]);
  });

  it('no nível máximo o progresso é 1 e não há próximo nível', () => {
    const small: CurveConfig = { kind: 'power', A: 13, p: 1.6, B: 45, maxLevel: 10 };
    const s = levelFromXp(10_000_000, small);
    expect(s.level).toBe(maxReachableLevel(small));
    expect(s.isMaxLevel).toBe(true);
    expect(s.xpToNextLevel).toBe(0);
    expect(s.progress).toBe(1);
  });

  it('valida parâmetros da curva', () => {
    expect(curveConfigSchema.safeParse({ kind: 'power', A: -1, p: 1.5, B: 0 }).success).toBe(false);
    expect(curveConfigSchema.safeParse({ kind: 'exponential', base: 100, growth: 0.9 }).success).toBe(false);
    expect(curveConfigSchema.parse({ kind: 'power', A: 1, p: 1.5, B: 0 }).maxLevel).toBe(999);
  });
});
