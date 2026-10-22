import type { GameConfig } from './config';
import { diffDays } from './dates';
import { DIFFICULTY_LABELS, MISSION_TYPE_LABELS, difficultyRank, type Difficulty, type MissionType } from './types';

export interface DifficultyCheckInput {
  type: MissionType;
  difficulty: Difficulty;
  /** Datas locais de início e prazo (YYYY-MM-DD), quando definidas. */
  startDate?: string | null;
  dueDate?: string | null;
  objectiveCount: number;
}

/**
 * Valida se uma dificuldade é coerente com o tipo e o escopo da missão.
 * Evita que uma tarefa trivial seja cadastrada como "lendária" para inflar recompensas.
 * Retorna a lista de violações (vazia = válida).
 */
export function validateDifficulty(input: DifficultyCheckInput, cfg: GameConfig): string[] {
  const errors: string[] = [];
  const max = cfg.maxDifficultyByMissionType[input.type];
  if (difficultyRank(input.difficulty) > difficultyRank(max)) {
    errors.push(`Missões do tipo "${MISSION_TYPE_LABELS[input.type]}" admitem no máximo a dificuldade "${DIFFICULTY_LABELS[max]}".`);
  }
  const check = (rule: { minSpanDays: number; minObjectives: number }, label: string) => {
    const span = input.startDate && input.dueDate ? diffDays(input.startDate, input.dueDate) : 0;
    if (span < rule.minSpanDays) {
      errors.push(`Dificuldade ${label} exige um período de pelo menos ${rule.minSpanDays} dias entre início e prazo.`);
    }
    if (input.objectiveCount < rule.minObjectives) {
      errors.push(`Dificuldade ${label} exige pelo menos ${rule.minObjectives} objetivos mensuráveis.`);
    }
  };
  if (input.difficulty === 'epic') check(cfg.highDifficultyRules.epic, 'Épica');
  if (input.difficulty === 'legendary') check(cfg.highDifficultyRules.legendary, 'Lendária');
  return errors;
}
