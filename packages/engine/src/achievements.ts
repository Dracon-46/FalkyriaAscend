import { z } from 'zod';

/**
 * Métricas agregadas que o motor de conquistas sabe avaliar.
 * A API calcula esses valores a partir do banco; o motor apenas compara.
 */
export const ACHIEVEMENT_METRICS = [
  'character_level',
  'lifetime_xp',
  'missions_completed',
  'missions_completed_hard_plus',
  'missions_completed_epic_plus',
  'habit_checkins',
  'best_habit_streak',
  'study_sessions',
  'study_minutes',
  'assessments_passed',
  'training_sessions',
  'strength_sessions',
  'run_distance_km',
  'longest_run_km',
  'coins_earned',
  'purchases',
  'goals_completed',
  'seasons_completed',
  'attribute_max_level',
  'skills_level5',
  'distinct_pages_visited',
  'personal_records',
  'perfect_weeks',
] as const;
export type AchievementMetric = (typeof ACHIEVEMENT_METRICS)[number];

export const ACHIEVEMENT_METRIC_LABELS: Record<AchievementMetric, string> = {
  character_level: 'Nível do personagem',
  lifetime_xp: 'XP vitalício',
  missions_completed: 'Missões concluídas',
  missions_completed_hard_plus: 'Missões Difíceis ou superiores concluídas',
  missions_completed_epic_plus: 'Missões Épicas ou Lendárias concluídas',
  habit_checkins: 'Hábitos cumpridos',
  best_habit_streak: 'Melhor sequência de um hábito (dias)',
  study_sessions: 'Sessões de estudo',
  study_minutes: 'Minutos de estudo',
  assessments_passed: 'Avaliações aprovadas (≥ 70%)',
  training_sessions: 'Sessões de treino',
  strength_sessions: 'Sessões de musculação',
  run_distance_km: 'Distância corrida acumulada (km)',
  longest_run_km: 'Maior corrida (km)',
  coins_earned: 'Moedas recebidas no total',
  purchases: 'Compras na loja',
  goals_completed: 'Metas concluídas',
  seasons_completed: 'Temporadas concluídas',
  attribute_max_level: 'Maior nível de atributo',
  skills_level5: 'Habilidades no nível 5+',
  distinct_pages_visited: 'Áreas do aplicativo exploradas',
  personal_records: 'Recordes pessoais',
  perfect_weeks: 'Semanas perfeitas de hábitos',
};

/** Critério de uma conquista: uma ou mais condições (todas precisam ser atendidas). */
export const achievementCriteriaSchema = z.object({
  all: z
    .array(
      z.object({
        metric: z.enum(ACHIEVEMENT_METRICS),
        gte: z.number().min(0),
      }),
    )
    .min(1)
    .max(5),
});
export type AchievementCriteria = z.infer<typeof achievementCriteriaSchema>;
export type AchievementMetrics = Partial<Record<AchievementMetric, number>>;

export interface AchievementProgress {
  unlocked: boolean;
  /** Progresso agregado [0,1] (média das condições, cada uma limitada a 1). */
  progress: number;
  conditions: Array<{ metric: AchievementMetric; current: number; target: number; met: boolean }>;
}

export function evaluateAchievement(criteria: AchievementCriteria, metrics: AchievementMetrics): AchievementProgress {
  const conditions = criteria.all.map((c) => {
    const current = metrics[c.metric] ?? 0;
    return { metric: c.metric, current, target: c.gte, met: current >= c.gte };
  });
  const progress =
    conditions.reduce((acc, c) => acc + (c.target === 0 ? 1 : Math.min(1, c.current / c.target)), 0) / conditions.length;
  return { unlocked: conditions.every((c) => c.met), progress, conditions };
}

/** Métricas exigidas por um conjunto de critérios (para a API calcular somente o necessário). */
export function metricsNeeded(criteriaList: AchievementCriteria[]): AchievementMetric[] {
  const set = new Set<AchievementMetric>();
  for (const c of criteriaList) for (const cond of c.all) set.add(cond.metric);
  return [...set];
}
