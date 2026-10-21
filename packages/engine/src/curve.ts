import { z } from 'zod';

/**
 * Curva de progressão. Única implementação usada por API, interface e simulações.
 *
 * `xpRequired(n)` é o XP necessário para passar do nível n-1 para o nível n (n ≥ 2).
 * O nível 1 começa com 0 XP. O XP vitalício nunca é "gasto" ao subir de nível:
 * o nível é sempre derivado do XP acumulado.
 *
 * Tipos suportados:
 *  - power:       round(A · n^p + B)
 *  - exponential: round(base · growth^(n-2))
 *  - hybrid:      round((A · n^p + B) · growth^max(0, n - knee))
 */
export const curveConfigSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('power'),
    A: z.number().positive(),
    p: z.number().min(1).max(4),
    B: z.number().min(0),
    maxLevel: z.number().int().min(10).max(5000).default(999),
  }),
  z.object({
    kind: z.literal('exponential'),
    base: z.number().positive(),
    growth: z.number().gt(1).max(1.5),
    maxLevel: z.number().int().min(10).max(5000).default(999),
  }),
  z.object({
    kind: z.literal('hybrid'),
    A: z.number().positive(),
    p: z.number().min(1).max(4),
    B: z.number().min(0),
    knee: z.number().int().min(2),
    growth: z.number().gt(1).max(1.2),
    maxLevel: z.number().int().min(10).max(5000).default(999),
  }),
]);
export type CurveConfig = z.infer<typeof curveConfigSchema>;

export function xpRequired(level: number, cfg: CurveConfig): number {
  if (!Number.isInteger(level) || level < 2) {
    throw new Error(`Nível de destino inválido: ${level}`);
  }
  let value: number;
  switch (cfg.kind) {
    case 'power':
      value = cfg.A * level ** cfg.p + cfg.B;
      break;
    case 'exponential':
      value = cfg.base * cfg.growth ** (level - 2);
      break;
    case 'hybrid':
      value = (cfg.A * level ** cfg.p + cfg.B) * cfg.growth ** Math.max(0, level - cfg.knee);
      break;
  }
  // Nunca menos de 1 XP por nível: garante monotonicidade estrita do acumulado.
  return Math.max(1, Math.round(value));
}

const tableCache = new Map<string, number[]>();

/** Tabela de XP acumulado: table[L] = XP total necessário para estar no nível L. */
function cumulativeTable(cfg: CurveConfig): number[] {
  const key = JSON.stringify(cfg);
  const cached = tableCache.get(key);
  if (cached) return cached;
  const table: number[] = [0, 0];
  for (let n = 2; n <= cfg.maxLevel; n++) {
    const next = table[n - 1]! + xpRequired(n, cfg);
    // Evita perda de precisão em curvas extremas.
    if (!Number.isSafeInteger(next)) break;
    table[n] = next;
  }
  if (tableCache.size > 32) tableCache.clear();
  tableCache.set(key, table);
  return table;
}

/** XP total acumulado necessário para atingir `level`. */
export function cumulativeXpForLevel(level: number, cfg: CurveConfig): number {
  const table = cumulativeTable(cfg);
  if (level < 1) throw new Error(`Nível inválido: ${level}`);
  const v = table[Math.min(level, table.length - 1)];
  return v ?? 0;
}

export function maxReachableLevel(cfg: CurveConfig): number {
  return cumulativeTable(cfg).length - 1;
}

export interface LevelState {
  level: number;
  /** XP vitalício considerado. */
  totalXp: number;
  /** XP acumulado dentro do nível atual. */
  xpIntoLevel: number;
  /** XP necessário para passar do nível atual ao próximo (0 no nível máximo). */
  xpForNextLevel: number;
  /** XP que ainda falta para o próximo nível. */
  xpToNextLevel: number;
  /** Fração [0,1] do nível atual. */
  progress: number;
  isMaxLevel: boolean;
}

/** Deriva o nível a partir do XP vitalício (busca binária na tabela acumulada). */
export function levelFromXp(totalXp: number, cfg: CurveConfig): LevelState {
  const xp = Math.max(0, Math.floor(totalXp));
  const table = cumulativeTable(cfg);
  let lo = 1;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (table[mid]! <= xp) lo = mid;
    else hi = mid - 1;
  }
  const level = lo;
  const isMaxLevel = level >= table.length - 1;
  const floor = table[level]!;
  const xpForNextLevel = isMaxLevel ? 0 : table[level + 1]! - floor;
  const xpIntoLevel = xp - floor;
  return {
    level,
    totalXp: xp,
    xpIntoLevel,
    xpForNextLevel,
    xpToNextLevel: isMaxLevel ? 0 : xpForNextLevel - xpIntoLevel,
    progress: isMaxLevel ? 1 : xpIntoLevel / xpForNextLevel,
    isMaxLevel,
  };
}

/** Níveis alcançados ao passar de `beforeXp` para `afterXp` (pode ser mais de um). */
export function levelsCrossed(beforeXp: number, afterXp: number, cfg: CurveConfig): number[] {
  const a = levelFromXp(beforeXp, cfg).level;
  const b = levelFromXp(afterXp, cfg).level;
  const out: number[] = [];
  for (let l = a + 1; l <= b; l++) out.push(l);
  return out;
}
