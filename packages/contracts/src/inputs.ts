import { z } from 'zod';
import {
  ACTIVITY_CATEGORIES,
  DIFFICULTIES,
  HABIT_FREQUENCIES,
  ITEM_KINDS,
  MISSION_TYPES,
  PENALTY_TYPES,
  RARITIES,
  STUDY_ACTIVITY_TYPES,
  UNAVAILABILITY_REASONS,
  achievementCriteriaSchema,
  isLocalDate,
} from '@rpg/engine';

/** Data local YYYY-MM-DD válida. */
export const localDate = z.string().refine(isLocalDate, 'Data inválida (use AAAA-MM-DD)');
export const optionalDate = localDate.nullish();
export const id = z.uuid('Identificador inválido');
export const optionalId = id.nullish();
const text = (max: number) => z.string().trim().max(max);
const title = z.string().trim().min(1, 'Obrigatório').max(160);
const optionalText = (max = 2000) => text(max).nullish();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor hexadecimal (#RRGGBB)');

export const ATTRIBUTE_CODE_RE = /^[A-Z][A-Z0-9_]{1,7}$/;
export const attributeWeights = z
  .record(z.string().regex(ATTRIBUTE_CODE_RE, 'Código de atributo inválido'), z.number().min(0).max(10))
  .default({});

export const OBJECTIVE_METRIC_VALUES = [
  'manual',
  'study_minutes',
  'study_sessions',
  'training_sessions',
  'training_minutes',
  'distance_km',
  'habit_checkins',
  'missions_completed',
] as const;
export const OBJECTIVE_METRIC_LABELS: Record<(typeof OBJECTIVE_METRIC_VALUES)[number], string> = {
  manual: 'Manual',
  study_minutes: 'Minutos de estudo',
  study_sessions: 'Sessões de estudo',
  training_sessions: 'Sessões de treino',
  training_minutes: 'Minutos de treino',
  distance_km: 'Distância (km)',
  habit_checkins: 'Hábitos cumpridos',
  missions_completed: 'Missões concluídas',
};

// ------------------------------------------------------------------ Autenticação

export const registerInput = z.object({
  email: z.email('E-mail inválido').max(200),
  password: z.string().min(10, 'Mínimo de 10 caracteres').max(200),
  displayName: z.string().trim().min(1).max(80),
});
export const loginInput = z.object({
  email: z.email('E-mail inválido').max(200),
  password: z.string().min(1).max(200),
});
export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, 'Mínimo de 10 caracteres').max(200),
});

// ------------------------------------------------------------------ Perfil e configurações

export const THEME_VALUES = ['medieval', 'vampire', 'angel', 'system', 'custom'] as const;
export const profileInput = z.object({
  displayName: z.string().trim().min(1).max(80),
  characterClass: optionalText(60),
  bio: optionalText(500),
});
export const settingsInput = z
  .object({
    timezone: z.string().min(1).max(64),
    theme: z.enum(THEME_VALUES),
    customTheme: z
      .object({
        base: z.enum(['medieval', 'vampire', 'angel', 'system']),
        accent: hexColor,
        accent2: hexColor,
        effects: z.number().min(0).max(1),
      })
      .nullish(),
    reducedMotion: z.enum(['system', 'on', 'off']),
    dashboardWidgets: z
      .object({ widgets: z.array(z.object({ id: z.string().max(40), visible: z.boolean() })).max(40), periodDays: z.number().int().min(7).max(365) })
      .nullish(),
    notificationPrefs: z
      .object({ categories: z.record(z.string().max(40), z.boolean()), quietStart: hhmm.optional(), quietEnd: hhmm.optional() })
      .nullish(),
    penaltiesEnabled: z.boolean(),
    penaltiesSuspendedUntil: optionalDate,
    recoveryModeUntil: optionalDate,
    allowSkillXpPenalty: z.boolean(),
  })
  .partial();

// ------------------------------------------------------------------ Definições

export const categoryInput = z.object({
  name: title,
  description: optionalText(),
  color: hexColor.default('#c9a84c'),
  icon: text(40).default('circle'),
  isBasicNeed: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const attributeInput = z.object({
  code: z.string().regex(ATTRIBUTE_CODE_RE, 'Use 2–8 letras maiúsculas (ex.: FOR)'),
  name: title,
  description: text(2000).default(''),
  category: text(60).default('geral'),
  color: hexColor.default('#c9a84c'),
  icon: text(40).default('shield'),
  progressionCriteria: text(2000).default(''),
  sortOrder: z.number().int().default(0),
});

export const skillInput = z.object({
  name: title,
  description: text(2000).default(''),
  attributeId: optionalId,
  parentId: optionalId,
  icon: text(40).default('sparkles'),
  unlockLevel: z.number().int().min(1).max(999).default(1),
  sortOrder: z.number().int().default(0),
});

export const penaltyRuleInput = z.object({
  name: title,
  description: text(2000).default(''),
  type: z.enum(PENALTY_TYPES),
  baseAmount: z.number().int().min(0).max(1000).default(0),
  escalationStep: z.number().int().min(0).max(1000).default(0),
  maxAmount: z.number().int().min(0).max(1000).default(0),
  durationDays: z.number().int().min(1).max(30).nullish(),
  reductionPct: z.number().min(0).max(0.5).nullish(),
  targetItemId: optionalId,
  targetSkillId: optionalId,
  active: z.boolean().default(true),
});

// ------------------------------------------------------------------ Missões

export const objectiveInput = z.object({
  id: optionalId,
  title,
  metric: z.enum(OBJECTIVE_METRIC_VALUES).default('manual'),
  metricRefId: optionalId,
  target: z.number().positive().max(1_000_000),
  current: z.number().min(0).max(1_000_000).optional(),
  unit: optionalText(20),
  optional: z.boolean().default(false),
});

export const missionInput = z.object({
  title,
  description: text(4000).default(''),
  type: z.enum(MISSION_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  categoryId: optionalId,
  goalId: optionalId,
  seasonId: optionalId,
  parentId: optionalId,
  startDate: optionalDate,
  dueDate: optionalDate,
  completionMode: z.enum(['manual', 'auto']).default('manual'),
  rewardXpOverride: z.number().int().min(0).max(100_000).nullish(),
  rewardCoinsOverride: z.number().int().min(0).max(100_000).nullish(),
  isSecret: z.boolean().default(false),
  evidenceRequired: z.boolean().default(false),
  priority: z.number().int().min(0).max(5).default(0),
  attributeWeights,
  objectives: z.array(objectiveInput).max(20).default([]),
  penaltyRuleIds: z.array(id).max(5).default([]),
});
export type MissionInput = z.infer<typeof missionInput>;

export const MISSION_ACTIONS = ['start', 'complete', 'fail', 'cancel', 'suspend', 'resume', 'reschedule'] as const;
export const missionActionInput = z.object({
  action: z.enum(MISSION_ACTIONS),
  reason: optionalText(500),
  dueDate: optionalDate,
  evidence: optionalText(2000),
});

export const objectiveProgressInput = z.object({ current: z.number().min(0).max(1_000_000) });

export const templateInput = z.object({
  title,
  description: text(4000).default(''),
  type: z.enum(MISSION_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  categoryId: optionalId,
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
  weekdaysMask: z.number().int().min(1).max(127).default(127),
  durationDays: z.number().int().min(1).max(365).default(1),
  attributeWeights,
  objectives: z
    .array(
      z.object({
        title,
        metric: z.enum(OBJECTIVE_METRIC_VALUES),
        target: z.number().positive(),
        unit: z.string().max(20).optional(),
        optional: z.boolean().optional(),
      }),
    )
    .max(20)
    .default([]),
  penaltyRuleIds: z.array(id).max(5).default([]),
  active: z.boolean().default(true),
});

// ------------------------------------------------------------------ Hábitos

export const habitInput = z.object({
  title,
  description: text(2000).default(''),
  categoryId: optionalId,
  difficulty: z.enum(['routine', 'easy', 'moderate']).default('routine'),
  frequency: z.enum(HABIT_FREQUENCIES).default('daily'),
  weekdaysMask: z.number().int().min(1).max(127).default(127),
  timesPerWeek: z.number().int().min(1).max(7).default(3),
  timeOfDay: hhmm.nullish(),
  completionCriteria: text(500).default(''),
  startDate: localDate,
  endDate: optionalDate,
  tolerancePerWeek: z.number().int().min(0).max(7).default(1),
  isBasicNeed: z.boolean().default(false),
  notify: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  attributeWeights,
  penaltyRuleIds: z.array(id).max(5).default([]),
});

export const habitCheckinInput = z.object({
  date: optionalDate,
  status: z.enum(['done', 'excused', 'rest']).default('done'),
  note: optionalText(500),
});

export const habitStatusInput = z.object({
  status: z.enum(['active', 'paused', 'archived']),
  pausedUntil: optionalDate,
});

export const unavailabilityInput = z.object({
  startDate: localDate,
  endDate: localDate,
  reason: z.enum(UNAVAILABILITY_REASONS),
  note: optionalText(500),
  categoryId: optionalId,
});

export const rankInput = z.object({
  minLevel: z.number().int().min(1).max(999),
  code: z.string().trim().min(1).max(4),
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
});

export const levelRewardInput = z.object({
  level: z.number().int().min(2).max(999),
  description: z.string().trim().min(1).max(200),
  itemId: z.uuid().nullish(),
  coins: z.number().int().min(0).max(100_000).default(0),
});

// ------------------------------------------------------------------ Metas

export const goalInput = z.object({
  title,
  description: text(4000).default(''),
  categoryId: optionalId,
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  difficulty: z.enum(DIFFICULTIES).default('hard'),
  startDate: optionalDate,
  deadline: optionalDate,
  progressMode: z.enum(['milestones', 'missions', 'metric']).default('milestones'),
  metric: z.enum(OBJECTIVE_METRIC_VALUES).nullish(),
  metricRefId: optionalId,
  metricStart: z.number().nullish(),
  metricTarget: z.number().nullish(),
  metricCurrent: z.number().nullish(),
  unit: optionalText(20),
  milestones: z
    .array(z.object({ id: optionalId, title, weight: z.number().int().min(1).max(100).default(1), dueDate: optionalDate, done: z.boolean().default(false) }))
    .max(50)
    .default([]),
  dependsOn: z.array(id).max(10).default([]),
});

export const goalStatusInput = z.object({ status: z.enum(['active', 'paused', 'abandoned', 'cancelled']) });

// ------------------------------------------------------------------ Estudos

export const areaInput = z.object({ name: title, description: text(2000).default(''), color: hexColor.default('#6b7fd7') });
export const subjectInput = z.object({
  name: title,
  description: text(2000).default(''),
  areaId: optionalId,
  color: hexColor.default('#6b7fd7'),
  prerequisiteIds: z.array(id).max(20).default([]),
});
export const resourceInput = z.object({
  subjectId: id,
  parentId: optionalId,
  kind: z.enum(['course', 'book', 'module', 'lesson', 'chapter', 'other']),
  title,
  url: z.url().max(1000).nullish(),
  totalUnits: z.number().int().min(1).max(10_000).default(1),
});
export const studySessionInput = z.object({
  subjectId: id,
  resourceId: optionalId,
  date: optionalDate,
  minutes: z.number().int().min(1).max(1440),
  activityType: z.enum(STUDY_ACTIVITY_TYPES).default('reading'),
  content: text(2000).default(''),
  result: optionalText(1000),
  notes: optionalText(2000),
  evidenceUrl: z.url().max(1000).nullish(),
  unitsCompleted: z.number().int().min(0).max(1000).default(0),
});
export const assessmentInput = z.object({
  subjectId: id,
  title,
  date: optionalDate,
  score: z.number().min(0).max(100_000),
  maxScore: z.number().positive().max(100_000),
  notes: optionalText(2000),
});
export const subjectMilestoneInput = z.object({
  subjectId: id,
  title,
  description: text(2000).default(''),
  evidenceUrl: z.url().max(1000).nullish(),
  achievedOn: optionalDate,
});

// ------------------------------------------------------------------ Treinos

export const activityTypeInput = z.object({
  name: title,
  category: z.enum(ACTIVITY_CATEGORIES),
  icon: text(40).default('activity'),
  skillId: optionalId,
  intensity: z.number().min(0.5).max(1.5).default(1),
  attributeWeights,
});
export const exerciseInput = z.object({ name: title, muscleGroup: text(40).default('geral') });
export const activityInput = z.object({
  typeId: id,
  title: optionalText(160),
  date: optionalDate,
  durationMin: z.number().int().min(1).max(1440),
  distanceKm: z.number().min(0).max(1000).nullish(),
  elevationM: z.number().int().min(0).max(20_000).nullish(),
  avgHeartRate: z.number().int().min(30).max(250).nullish(),
  perceivedEffort: z.number().int().min(1).max(10).nullish(),
  notes: optionalText(2000),
  sets: z
    .array(
      z.object({
        exerciseId: id,
        reps: z.number().int().min(0).max(1000),
        weightKg: z.number().min(0).max(1000).nullish(),
        rir: z.number().int().min(0).max(10).nullish(),
      }),
    )
    .max(200)
    .default([]),
});

export const quickLogInput = z.object({
  title,
  categoryId: optionalId,
  attributeCode: z.string().regex(ATTRIBUTE_CODE_RE).nullish(),
});

// ------------------------------------------------------------------ Loja, inventário, conquistas, temporadas

export const itemInput = z.object({
  name: title,
  description: text(2000).default(''),
  icon: text(40).default('gem'),
  category: text(60).default('Recompensas pessoais'),
  kind: z.enum(ITEM_KINDS),
  rarity: z.enum(RARITIES).default('common'),
  price: z.number().int().min(0).max(1_000_000).nullish(),
  active: z.boolean().default(true),
  availableFrom: z.iso.datetime({ offset: true }).nullish(),
  availableUntil: z.iso.datetime({ offset: true }).nullish(),
  minLevel: z.number().int().min(1).max(999).nullish(),
  requiredAchievementId: optionalId,
  purchaseLimit: z.number().int().min(1).max(10_000).nullish(),
  cooldownDays: z.number().int().min(1).max(365).nullish(),
  payload: z.record(z.string(), z.unknown()).default({}),
  sortOrder: z.number().int().default(0),
});
export const purchaseInput = z.object({ itemId: id, quantity: z.number().int().min(1).max(99).default(1) });
export const inventoryActionInput = z.object({
  action: z.enum(['equip', 'unequip', 'consume', 'redeem']),
  note: optionalText(500),
});

export const achievementInput = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,60}$/, 'Use letras minúsculas, números e _'),
  name: title,
  description: text(2000).default(''),
  category: text(60).default('Consistência'),
  icon: text(40).default('trophy'),
  rarity: z.enum(RARITIES).default('common'),
  criteria: achievementCriteriaSchema,
  secret: z.boolean().default(false),
  rewardXp: z.number().int().min(0).max(100_000).default(0),
  rewardCoins: z.number().int().min(0).max(100_000).default(0),
  rewardItemId: optionalId,
  sortOrder: z.number().int().default(0),
});

export const seasonInput = z.object({
  name: title,
  description: text(4000).default(''),
  theme: optionalText(60),
  startDate: localDate,
  endDate: localDate,
  rewards: z
    .array(z.object({ id: optionalId, title, thresholdXp: z.number().int().min(1), coins: z.number().int().min(0).default(0), itemId: optionalId }))
    .max(20)
    .default([]),
});

// ------------------------------------------------------------------ Correções e ajustes

export const reversalInput = z.object({ reason: z.string().trim().min(3, 'Informe o motivo').max(500) });

export const adjustmentInput = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo').max(500),
  xp: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  coins: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  attributeXp: z.record(z.string().regex(ATTRIBUTE_CODE_RE), z.number().int().min(-100_000).max(100_000)).default({}),
  skillXp: z.record(z.uuid(), z.number().int().min(-100_000).max(100_000)).default({}),
});

export const configUpdateInput = z.object({
  config: z.unknown(),
  note: z.string().trim().min(3, 'Descreva a mudança').max(500),
});

// Tipos inferidos das entradas (usados pela camada de aplicação).
export type RegisterInput = z.infer<typeof registerInput>;
export type LoginInput = z.infer<typeof loginInput>;
export type ChangePasswordInput = z.infer<typeof changePasswordInput>;
export type ProfileInput = z.infer<typeof profileInput>;
export type SettingsInput = z.infer<typeof settingsInput>;
export type CategoryInput = z.infer<typeof categoryInput>;
export type AttributeInput = z.infer<typeof attributeInput>;
export type SkillInput = z.infer<typeof skillInput>;
export type PenaltyRuleInput = z.infer<typeof penaltyRuleInput>;
export type ObjectiveInput = z.infer<typeof objectiveInput>;
export type MissionActionInput = z.infer<typeof missionActionInput>;
export type ObjectiveProgressInput = z.infer<typeof objectiveProgressInput>;
export type TemplateInput = z.infer<typeof templateInput>;
export type HabitInput = z.infer<typeof habitInput>;
export type HabitCheckinInput = z.infer<typeof habitCheckinInput>;
export type HabitStatusInput = z.infer<typeof habitStatusInput>;
export type UnavailabilityInput = z.infer<typeof unavailabilityInput>;
export type GoalInput = z.infer<typeof goalInput>;
export type GoalStatusInput = z.infer<typeof goalStatusInput>;
export type AreaInput = z.infer<typeof areaInput>;
export type SubjectInput = z.infer<typeof subjectInput>;
export type ResourceInput = z.infer<typeof resourceInput>;
export type StudySessionInput = z.infer<typeof studySessionInput>;
export type AssessmentInput = z.infer<typeof assessmentInput>;
export type SubjectMilestoneInput = z.infer<typeof subjectMilestoneInput>;
export type ActivityTypeInput = z.infer<typeof activityTypeInput>;
export type ExerciseInput = z.infer<typeof exerciseInput>;
export type ActivityInput = z.infer<typeof activityInput>;
export type QuickLogInput = z.infer<typeof quickLogInput>;
export type ItemInput = z.infer<typeof itemInput>;
export type PurchaseInput = z.infer<typeof purchaseInput>;
export type InventoryActionInput = z.infer<typeof inventoryActionInput>;
export type AchievementInput = z.infer<typeof achievementInput>;
export type SeasonInput = z.infer<typeof seasonInput>;
export type ReversalInput = z.infer<typeof reversalInput>;
export type AdjustmentInput = z.infer<typeof adjustmentInput>;
export type RankInput = z.infer<typeof rankInput>;
export type LevelRewardInput = z.infer<typeof levelRewardInput>;
export type ConfigUpdateInput = z.infer<typeof configUpdateInput>;
