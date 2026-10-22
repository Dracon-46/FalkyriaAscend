/**
 * Ranks herdados do protótipo original (Chronicles of the Self).
 * Persistidos por usuário e editáveis; estes são os valores iniciais.
 */
export interface RankDefinition {
  minLevel: number;
  code: string;
  name: string;
}

export const DEFAULT_RANKS: RankDefinition[] = [
  { minLevel: 1, code: 'G', name: 'Civil' },
  { minLevel: 5, code: 'F', name: 'Recruta' },
  { minLevel: 10, code: 'E', name: 'Soldado' },
  { minLevel: 20, code: 'D', name: 'Lutador' },
  { minLevel: 30, code: 'C', name: 'Veterano' },
  { minLevel: 45, code: 'B', name: 'Elite' },
  { minLevel: 60, code: 'A', name: 'Mestre' },
  { minLevel: 80, code: 'S', name: 'Lendário' },
  { minLevel: 100, code: 'SS', name: 'Além dos Mortais' },
];

export function rankForLevel<T extends RankDefinition>(level: number, ranks: T[]): T | null {
  const sorted = [...ranks].sort((a, b) => b.minLevel - a.minLevel);
  return sorted.find((r) => level >= r.minLevel) ?? null;
}

export function nextRank<T extends RankDefinition>(level: number, ranks: T[]): T | null {
  const sorted = [...ranks].sort((a, b) => a.minLevel - b.minLevel);
  return sorted.find((r) => r.minLevel > level) ?? null;
}
