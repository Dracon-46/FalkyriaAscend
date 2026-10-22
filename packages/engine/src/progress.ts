/**
 * Progresso de objetivos de missões compostas e de metas de longo prazo.
 * O progresso é sempre derivado de critérios explícitos, nunca de uma porcentagem livre.
 */

export interface ObjectiveState {
  target: number;
  current: number;
  /** Objetivos opcionais não bloqueiam a conclusão. */
  optional?: boolean;
}

export function objectiveFraction(o: ObjectiveState): number {
  if (o.target <= 0) return 1;
  return Math.min(1, Math.max(0, o.current / o.target));
}

export function isObjectiveDone(o: ObjectiveState): boolean {
  return o.current >= o.target;
}

export interface CompositeProgress {
  /** Fração [0,1] considerando apenas objetivos obrigatórios. */
  progress: number;
  requiredDone: number;
  requiredTotal: number;
  complete: boolean;
}

/** Uma missão composta só conclui quando todos os objetivos obrigatórios estão cumpridos. */
export function compositeProgress(objectives: ObjectiveState[]): CompositeProgress {
  const required = objectives.filter((o) => !o.optional);
  if (required.length === 0) return { progress: 0, requiredDone: 0, requiredTotal: 0, complete: false };
  const done = required.filter(isObjectiveDone).length;
  const progress = required.reduce((acc, o) => acc + objectiveFraction(o), 0) / required.length;
  return { progress, requiredDone: done, requiredTotal: required.length, complete: done === required.length };
}

export type GoalProgressMode = 'milestones' | 'missions' | 'metric';

export interface GoalProgressInput {
  mode: GoalProgressMode;
  milestones?: Array<{ weight: number; done: boolean }>;
  missions?: Array<{ status: string }>;
  metric?: { current: number; target: number; start?: number };
}

/** Progresso de meta [0,1] segundo o modo configurado. */
export function goalProgress(input: GoalProgressInput): number {
  switch (input.mode) {
    case 'milestones': {
      const list = input.milestones ?? [];
      const total = list.reduce((a, m) => a + Math.max(0, m.weight), 0);
      if (total === 0) return 0;
      return list.filter((m) => m.done).reduce((a, m) => a + Math.max(0, m.weight), 0) / total;
    }
    case 'missions': {
      const list = (input.missions ?? []).filter((m) => m.status !== 'cancelled');
      if (list.length === 0) return 0;
      return list.filter((m) => m.status === 'completed').length / list.length;
    }
    case 'metric': {
      const m = input.metric;
      if (!m) return 0;
      const start = m.start ?? 0;
      const span = m.target - start;
      if (span === 0) return m.current >= m.target ? 1 : 0;
      return Math.min(1, Math.max(0, (m.current - start) / span));
    }
  }
}
