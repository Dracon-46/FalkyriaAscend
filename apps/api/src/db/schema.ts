import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ACTIVITY_CATEGORIES,
  CHECKIN_STATUSES,
  COIN_TX_KINDS,
  DIFFICULTIES,
  HABIT_FREQUENCIES,
  ITEM_KINDS,
  MISSION_STATUSES,
  MISSION_TYPES,
  PENALTY_TYPES,
  RARITIES,
  STUDY_ACTIVITY_TYPES,
  UNAVAILABILITY_REASONS,
  XP_SOURCES,
} from '@rpg/engine';

/*
 * Convenções:
 *  - Toda tabela de dados do usuário possui `user_id` (autorização uniforme e consultas simples).
 *  - Exclusão em cascata somente a partir de `users` (exclusão explícita da conta).
 *    Entre entidades, referências a históricos usam RESTRICT ou SET NULL.
 *  - Livro-razão (reward_grants, coin_transactions, penalty_applications) é imutável:
 *    correções são feitas por lançamentos de estorno.
 *  - Datas "locais" (fuso do usuário) usam o tipo DATE; instantes usam TIMESTAMPTZ.
 */

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const userRef = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const ROLES = ['admin', 'user'] as const;
export const THEMES = ['medieval', 'vampire', 'angel', 'system', 'custom'] as const;
export const GOAL_STATUSES = ['active', 'paused', 'completed', 'abandoned', 'cancelled'] as const;
export const GOAL_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const GOAL_MODES = ['milestones', 'missions', 'metric'] as const;
export const OBJECTIVE_METRICS = [
  'manual',
  'study_minutes',
  'study_sessions',
  'training_sessions',
  'training_minutes',
  'distance_km',
  'habit_checkins',
  'missions_completed',
] as const;
export const HABIT_STATUSES = ['active', 'paused', 'archived'] as const;
export const SEASON_STATUSES = ['planned', 'active', 'closed'] as const;
export const INVENTORY_STATES = ['owned', 'equipped', 'consumed', 'redeemed', 'revoked'] as const;
export const INVENTORY_SOURCES = ['purchase', 'achievement', 'level', 'season', 'streak', 'admin'] as const;
export const RECORD_SOURCES = ['manual', 'strava', 'lyfta', 'hevy', 'import', 'demo'] as const;
export const RESOURCE_KINDS = ['course', 'book', 'module', 'lesson', 'chapter', 'other'] as const;
export const RESOURCE_STATUSES = ['planned', 'in_progress', 'completed'] as const;
export const RECURRENCES = ['none', 'daily', 'weekly', 'monthly'] as const;
export const GRANT_SOURCES = [
  'mission',
  'habit',
  'study_session',
  'assessment',
  'study_unit',
  'subject_milestone',
  'activity',
  'quick',
  'goal',
  'achievement',
  'streak',
  'level',
  'season',
  'adjustment',
  'reversal',
] as const;

// ---------------------------------------------------------------- Identidade

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ROLES }).notNull().default('user'),
    displayName: text('display_name').notNull(),
    characterClass: text('character_class'),
    bio: text('bio'),
    isDemo: boolean('is_demo').notNull().default(false),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 do token; o token em si só existe no cookie do cliente. */
    id: text('id').primaryKey(),
    userId: userRef(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  theme: text('theme', { enum: THEMES }).notNull().default('medieval'),
  /** { base, accent, accent2, effects (0-1) } — preferência visual, validada por Zod. */
  customTheme: jsonb('custom_theme').$type<{ base: string; accent: string; accent2: string; effects: number }>(),
  reducedMotion: text('reduced_motion', { enum: ['system', 'on', 'off'] }).notNull().default('system'),
  /** Lista ordenada de widgets visíveis e período padrão — preferência de interface. */
  dashboardWidgets: jsonb('dashboard_widgets').$type<{ widgets: Array<{ id: string; visible: boolean }>; periodDays: number }>(),
  /** Preferências de notificação por categoria e horário silencioso. */
  notificationPrefs: jsonb('notification_prefs').$type<{ categories: Record<string, boolean>; quietStart?: string; quietEnd?: string }>(),
  penaltiesEnabled: boolean('penalties_enabled').notNull().default(true),
  penaltiesSuspendedUntil: date('penalties_suspended_until'),
  recoveryModeUntil: date('recovery_mode_until'),
  allowSkillXpPenalty: boolean('allow_skill_xp_penalty').notNull().default(false),
  lastEvaluatedDate: date('last_evaluated_date'),
  updatedAt: updatedAt(),
});

/** Configuração versionada da economia/progressão (snapshot validado pelo motor). */
export const gameConfigs = pgTable(
  'game_configs',
  {
    id: id(),
    userId: userRef(),
    version: integer('version').notNull(),
    config: jsonb('config').notNull(),
    active: boolean('active').notNull().default(false),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('game_configs_version_uq').on(t.userId, t.version),
    uniqueIndex('game_configs_active_uq').on(t.userId).where(sql`${t.active}`),
  ],
);

// ---------------------------------------------------------------- Personagem

export const characterProgress = pgTable(
  'character_progress',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Projeção do XP vitalício (soma de reward_grants.xp). */
    lifetimeXp: bigint('lifetime_xp', { mode: 'number' }).notNull().default(0),
    level: integer('level').notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [check('character_xp_nonneg', sql`${t.lifetimeXp} >= 0`)],
);

export const levelHistory = pgTable(
  'level_history',
  {
    id: id(),
    userId: userRef(),
    level: integer('level').notNull(),
    reachedAt: timestamp('reached_at', { withTimezone: true }).notNull().defaultNow(),
    grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
    configVersion: integer('config_version').notNull(),
  },
  (t) => [uniqueIndex('level_history_uq').on(t.userId, t.level)],
);

export const ranks = pgTable(
  'ranks',
  {
    id: id(),
    userId: userRef(),
    minLevel: integer('min_level').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    color: text('color'),
  },
  (t) => [uniqueIndex('ranks_level_uq').on(t.userId, t.minLevel)],
);

/** Marcos de nível: títulos, itens e moedas concedidos ao atingir um nível. */
export const levelRewards = pgTable(
  'level_rewards',
  {
    id: id(),
    userId: userRef(),
    level: integer('level').notNull(),
    description: text('description').notNull(),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    coins: integer('coins').notNull().default(0),
  },
  (t) => [uniqueIndex('level_rewards_uq').on(t.userId, t.level), check('level_rewards_coins', sql`${t.coins} >= 0`)],
);

export const categories = pgTable(
  'categories',
  {
    id: id(),
    userId: userRef(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#c9a84c'),
    icon: text('icon').notNull().default('circle'),
    /** Necessidades básicas (sono, alimentação, descanso) nunca recebem penalidades. */
    isBasicNeed: boolean('is_basic_need').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('categories_name_uq').on(t.userId, t.name)],
);

export const attributes = pgTable(
  'attributes',
  {
    id: id(),
    userId: userRef(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull().default('geral'),
    color: text('color').notNull().default('#c9a84c'),
    icon: text('icon').notNull().default('shield'),
    /** Critérios de progressão descritos ao usuário. */
    progressionCriteria: text('progression_criteria').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Projeções (derivadas de grant_attribute_xp). */
    xp: integer('xp').notNull().default(0),
    level: integer('level').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('attributes_code_uq').on(t.userId, t.code), check('attributes_xp_nonneg', sql`${t.xp} >= 0`)],
);

/** Árvore de habilidades/maestria. Uma disciplina de estudo ou tipo de atividade aponta para uma habilidade. */
export const skills = pgTable(
  'skills',
  {
    id: id(),
    userId: userRef(),
    attributeId: uuid('attribute_id').references(() => attributes.id, { onDelete: 'set null' }),
    parentId: uuid('parent_id').references((): any => skills.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon').notNull().default('sparkles'),
    /** Nível de personagem necessário para "desbloquear" o ramo (apenas visual/organizacional). */
    unlockLevel: integer('unlock_level').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    xp: integer('xp').notNull().default(0),
    level: integer('level').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('skills_user_idx').on(t.userId), check('skills_xp_nonneg', sql`${t.xp} >= 0`)],
);

// ---------------------------------------------------------------- Livro-razão de recompensas

export const rewardGrants = pgTable(
  'reward_grants',
  {
    id: id(),
    userId: userRef(),
    /** Chave determinística por origem (ex.: habit:<id>:2026-10-21). Garante idempotência. */
    idempotencyKey: text('idempotency_key').notNull(),
    sourceType: text('source_type', { enum: GRANT_SOURCES }).notNull(),
    sourceId: uuid('source_id'),
    xpSource: text('xp_source', { enum: XP_SOURCES }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    xp: integer('xp').notNull(),
    coins: integer('coins').notNull(),
    localDate: date('local_date').notNull(),
    configVersion: integer('config_version').notNull(),
    /** Passos do cálculo exibidos ao usuário ("por que recebi isto"). */
    explanation: jsonb('explanation').$type<string[]>().notNull().default([]),
    reversalOf: uuid('reversal_of').references((): any => rewardGrants.id, { onDelete: 'restrict' }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('reward_grants_idem_uq').on(t.userId, t.idempotencyKey),
    uniqueIndex('reward_grants_reversal_uq').on(t.reversalOf),
    index('reward_grants_user_date_idx').on(t.userId, t.localDate),
    index('reward_grants_source_idx').on(t.userId, t.sourceType, t.sourceId),
  ],
);

export const grantAttributeXp = pgTable(
  'grant_attribute_xp',
  {
    grantId: uuid('grant_id')
      .notNull()
      .references(() => rewardGrants.id, { onDelete: 'restrict' }),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id, { onDelete: 'restrict' }),
    userId: userRef(),
    amount: integer('amount').notNull(),
  },
  (t) => [primaryKey({ columns: [t.grantId, t.attributeId] }), index('gax_user_idx').on(t.userId, t.attributeId)],
);

export const grantSkillXp = pgTable(
  'grant_skill_xp',
  {
    grantId: uuid('grant_id')
      .notNull()
      .references(() => rewardGrants.id, { onDelete: 'restrict' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    userId: userRef(),
    amount: integer('amount').notNull(),
  },
  (t) => [primaryKey({ columns: [t.grantId, t.skillId] }), index('gsx_user_idx').on(t.userId, t.skillId)],
);

export const wallets = pgTable(
  'wallets',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    balance: integer('balance').notNull().default(0),
    totalEarned: integer('total_earned').notNull().default(0),
    totalSpent: integer('total_spent').notNull().default(0),
    totalPenalties: integer('total_penalties').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [check('wallet_balance_nonneg', sql`${t.balance} >= 0`)],
);

export const coinTransactions = pgTable(
  'coin_transactions',
  {
    id: id(),
    userId: userRef(),
    amount: integer('amount').notNull(),
    kind: text('kind', { enum: COIN_TX_KINDS }).notNull(),
    /** Categoria de origem (missões, hábitos, loja, penalidades, administração...). */
    category: text('category').notNull(),
    reason: text('reason').notNull(),
    grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'restrict' }),
    purchaseId: uuid('purchase_id').references((): any => purchases.id, { onDelete: 'restrict' }),
    penaltyId: uuid('penalty_id').references((): any => penaltyApplications.id, { onDelete: 'restrict' }),
    reversalOf: uuid('reversal_of').references((): any => coinTransactions.id, { onDelete: 'restrict' }),
    balanceAfter: integer('balance_after').notNull(),
    localDate: date('local_date').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('coin_tx_user_created_idx').on(t.userId, t.createdAt),
    uniqueIndex('coin_tx_reversal_uq').on(t.reversalOf),
    check('coin_tx_balance_nonneg', sql`${t.balanceAfter} >= 0`),
    check('coin_tx_nonzero', sql`${t.amount} <> 0`),
  ],
);

// ---------------------------------------------------------------- Penalidades

export const penaltyRules = pgTable('penalty_rules', {
  id: id(),
  userId: userRef(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  type: text('type', { enum: PENALTY_TYPES }).notNull(),
  baseAmount: integer('base_amount').notNull().default(0),
  escalationStep: integer('escalation_step').notNull().default(0),
  maxAmount: integer('max_amount').notNull().default(0),
  durationDays: integer('duration_days'),
  reductionPct: real('reduction_pct'),
  targetItemId: uuid('target_item_id').references(() => items.id, { onDelete: 'set null' }),
  targetSkillId: uuid('target_skill_id').references(() => skills.id, { onDelete: 'set null' }),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const penaltyApplications = pgTable(
  'penalty_applications',
  {
    id: id(),
    userId: userRef(),
    ruleId: uuid('rule_id').references(() => penaltyRules.id, { onDelete: 'set null' }),
    /** Configuração da regra no momento da aplicação (auditoria). */
    ruleSnapshot: jsonb('rule_snapshot').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    sourceType: text('source_type', { enum: ['habit', 'mission'] }).notNull(),
    sourceId: uuid('source_id').notNull(),
    sourceTitle: text('source_title').notNull(),
    localDate: date('local_date').notNull(),
    type: text('type', { enum: PENALTY_TYPES }).notNull(),
    step: integer('step').notNull(),
    amount: integer('amount').notNull().default(0),
    durationDays: integer('duration_days'),
    reductionPct: real('reduction_pct'),
    /** Último dia em que efeitos temporários (multiplicador/bloqueio) valem. */
    expiresOn: date('expires_on'),
    targetItemId: uuid('target_item_id').references(() => items.id, { onDelete: 'set null' }),
    targetSkillId: uuid('target_skill_id').references(() => skills.id, { onDelete: 'set null' }),
    explanation: jsonb('explanation').$type<string[]>().notNull().default([]),
    status: text('status', { enum: ['applied', 'reversed'] }).notNull().default('applied'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversalReason: text('reversal_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('penalty_idem_uq').on(t.userId, t.idempotencyKey),
    index('penalty_user_date_idx').on(t.userId, t.localDate),
  ],
);

export const unavailability = pgTable(
  'unavailability',
  {
    id: id(),
    userId: userRef(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    reason: text('reason', { enum: UNAVAILABILITY_REASONS }).notNull(),
    note: text('note'),
    /** Nulo = vale para tudo; caso contrário apenas para a categoria. */
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [check('unavailability_range', sql`${t.endDate} >= ${t.startDate}`)],
);

// ---------------------------------------------------------------- Metas

export const goals = pgTable('goals', {
  id: id(),
  userId: userRef(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  priority: text('priority', { enum: GOAL_PRIORITIES }).notNull().default('medium'),
  difficulty: text('difficulty', { enum: DIFFICULTIES }).notNull().default('hard'),
  status: text('status', { enum: GOAL_STATUSES }).notNull().default('active'),
  startDate: date('start_date'),
  deadline: date('deadline'),
  progressMode: text('progress_mode', { enum: GOAL_MODES }).notNull().default('milestones'),
  metric: text('metric', { enum: OBJECTIVE_METRICS }),
  metricRefId: uuid('metric_ref_id'),
  metricStart: numeric('metric_start', { mode: 'number' }),
  metricTarget: numeric('metric_target', { mode: 'number' }),
  metricCurrent: numeric('metric_current', { mode: 'number' }),
  unit: text('unit'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const goalMilestones = pgTable('goal_milestones', {
  id: id(),
  userId: userRef(),
  goalId: uuid('goal_id')
    .notNull()
    .references(() => goals.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  weight: integer('weight').notNull().default(1),
  dueDate: date('due_date'),
  doneAt: timestamp('done_at', { withTimezone: true }),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const goalDependencies = pgTable(
  'goal_dependencies',
  {
    userId: userRef(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    dependsOnId: uuid('depends_on_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.dependsOnId] }), check('goal_dep_self', sql`${t.goalId} <> ${t.dependsOnId}`)],
);

// ---------------------------------------------------------------- Temporadas

export const seasons = pgTable(
  'seasons',
  {
    id: id(),
    userId: userRef(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    theme: text('theme'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: text('status', { enum: SEASON_STATUSES }).notNull().default('planned'),
    /** Resumo final calculado no encerramento (snapshot). */
    summary: jsonb('summary'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check('season_range', sql`${t.endDate} >= ${t.startDate}`)],
);

export const seasonRewards = pgTable('season_rewards', {
  id: id(),
  userId: userRef(),
  seasonId: uuid('season_id')
    .notNull()
    .references(() => seasons.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  thresholdXp: integer('threshold_xp').notNull(),
  coins: integer('coins').notNull().default(0),
  itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
});

// ---------------------------------------------------------------- Missões

export const missionTemplates = pgTable('mission_templates', {
  id: id(),
  userId: userRef(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  type: text('type', { enum: MISSION_TYPES }).notNull(),
  difficulty: text('difficulty', { enum: DIFFICULTIES }).notNull(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  recurrence: text('recurrence', { enum: RECURRENCES }).notNull().default('none'),
  weekdaysMask: integer('weekdays_mask').notNull().default(127),
  durationDays: integer('duration_days').notNull().default(1),
  /** Pesos de atributos por código (blueprint copiado para cada instância). */
  attributeWeights: jsonb('attribute_weights').$type<Record<string, number>>().notNull().default({}),
  /** Objetivos-modelo (blueprint validado por Zod, copiado para cada instância). */
  objectives: jsonb('objectives')
    .$type<Array<{ title: string; metric: string; target: number; unit?: string; optional?: boolean }>>()
    .notNull()
    .default([]),
  penaltyRuleIds: jsonb('penalty_rule_ids').$type<string[]>().notNull().default([]),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const missions = pgTable(
  'missions',
  {
    id: id(),
    userId: userRef(),
    templateId: uuid('template_id').references(() => missionTemplates.id, { onDelete: 'set null' }),
    periodKey: text('period_key'),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    seasonId: uuid('season_id').references(() => seasons.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    parentId: uuid('parent_id').references((): any => missions.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    type: text('type', { enum: MISSION_TYPES }).notNull(),
    difficulty: text('difficulty', { enum: DIFFICULTIES }).notNull(),
    status: text('status', { enum: MISSION_STATUSES }).notNull().default('available'),
    statusReason: text('status_reason'),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    completionMode: text('completion_mode', { enum: ['manual', 'auto'] }).notNull().default('manual'),
    rewardXpOverride: integer('reward_xp_override'),
    rewardCoinsOverride: integer('reward_coins_override'),
    isSecret: boolean('is_secret').notNull().default(false),
    evidenceRequired: boolean('evidence_required').notNull().default(false),
    evidence: text('evidence'),
    source: text('source', { enum: ['manual', 'template', 'suggestion', 'season', 'demo'] }).notNull().default('manual'),
    priority: integer('priority').notNull().default(0),
    /** Pesos de atributos por código (códigos são imutáveis). */
    attributeWeights: jsonb('attribute_weights').$type<Record<string, number>>().notNull().default({}),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Data local de conclusão (fuso do usuário). */
    completedOn: date('completed_on'),
    grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('missions_user_status_idx').on(t.userId, t.status),
    uniqueIndex('missions_template_period_uq').on(t.templateId, t.periodKey),
  ],
);

export const missionObjectives = pgTable('mission_objectives', {
  id: id(),
  userId: userRef(),
  missionId: uuid('mission_id')
    .notNull()
    .references(() => missions.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  metric: text('metric', { enum: OBJECTIVE_METRICS }).notNull().default('manual'),
  /** Disciplina, tipo de atividade, hábito ou categoria usada como filtro da métrica. */
  metricRefId: uuid('metric_ref_id'),
  target: numeric('target', { mode: 'number' }).notNull(),
  current: numeric('current', { mode: 'number' }).notNull().default(0),
  unit: text('unit'),
  optional: boolean('optional').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const missionPenaltyRules = pgTable(
  'mission_penalty_rules',
  {
    userId: userRef(),
    missionId: uuid('mission_id')
      .notNull()
      .references(() => missions.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => penaltyRules.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.missionId, t.ruleId] })],
);

/** Histórico de transições de estado (tentativas, reagendamentos, suspensões). */
export const missionEvents = pgTable(
  'mission_events',
  {
    id: id(),
    userId: userRef(),
    missionId: uuid('mission_id')
      .notNull()
      .references(() => missions.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    reason: text('reason'),
    data: jsonb('data'),
    actor: text('actor', { enum: ['user', 'system', 'admin'] }).notNull().default('user'),
    createdAt: createdAt(),
  },
  (t) => [index('mission_events_mission_idx').on(t.missionId)],
);

// ---------------------------------------------------------------- Hábitos

export const habits = pgTable('habits', {
  id: id(),
  userId: userRef(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  difficulty: text('difficulty', { enum: DIFFICULTIES }).notNull().default('routine'),
  frequency: text('frequency', { enum: HABIT_FREQUENCIES }).notNull().default('daily'),
  weekdaysMask: integer('weekdays_mask').notNull().default(127),
  timesPerWeek: integer('times_per_week').notNull().default(3),
  timeOfDay: text('time_of_day'),
  completionCriteria: text('completion_criteria').notNull().default(''),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  tolerancePerWeek: integer('tolerance_per_week').notNull().default(1),
  status: text('status', { enum: HABIT_STATUSES }).notNull().default('active'),
  pausedUntil: date('paused_until'),
  isBasicNeed: boolean('is_basic_need').notNull().default(false),
  /** Pesos de atributos por código (códigos são imutáveis). */
  attributeWeights: jsonb('attribute_weights').$type<Record<string, number>>().notNull().default({}),
  notify: boolean('notify').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  currentStreak: integer('current_streak').notNull().default(0),
  bestStreak: integer('best_streak').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const habitPenaltyRules = pgTable(
  'habit_penalty_rules',
  {
    userId: userRef(),
    habitId: uuid('habit_id')
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => penaltyRules.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.habitId, t.ruleId] })],
);

export const habitCheckins = pgTable(
  'habit_checkins',
  {
    id: id(),
    userId: userRef(),
    habitId: uuid('habit_id')
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    localDate: date('local_date').notNull(),
    status: text('status', { enum: CHECKIN_STATUSES }).notNull(),
    note: text('note'),
    source: text('source', { enum: ['user', 'evaluation', 'admin', 'demo'] }).notNull().default('user'),
    grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('habit_checkins_uq').on(t.habitId, t.localDate),
    index('habit_checkins_user_date_idx').on(t.userId, t.localDate),
  ],
);

// ---------------------------------------------------------------- Estudos

export const knowledgeAreas = pgTable('knowledge_areas', {
  id: id(),
  userId: userRef(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull().default('#6b7fd7'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const studySubjects = pgTable('study_subjects', {
  id: id(),
  userId: userRef(),
  areaId: uuid('area_id').references(() => knowledgeAreas.id, { onDelete: 'set null' }),
  skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull().default('#6b7fd7'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const subjectPrerequisites = pgTable(
  'subject_prerequisites',
  {
    userId: userRef(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => studySubjects.id, { onDelete: 'cascade' }),
    prerequisiteId: uuid('prerequisite_id')
      .notNull()
      .references(() => studySubjects.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.subjectId, t.prerequisiteId] }), check('subject_prereq_self', sql`${t.subjectId} <> ${t.prerequisiteId}`)],
);

export const studyResources = pgTable('study_resources', {
  id: id(),
  userId: userRef(),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => studySubjects.id, { onDelete: 'restrict' }),
  parentId: uuid('parent_id').references((): any => studyResources.id, { onDelete: 'set null' }),
  kind: text('kind', { enum: RESOURCE_KINDS }).notNull(),
  title: text('title').notNull(),
  url: text('url'),
  totalUnits: integer('total_units').notNull().default(1),
  completedUnits: integer('completed_units').notNull().default(0),
  status: text('status', { enum: RESOURCE_STATUSES }).notNull().default('planned'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const studySessions = pgTable(
  'study_sessions',
  {
    id: id(),
    userId: userRef(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => studySubjects.id, { onDelete: 'restrict' }),
    resourceId: uuid('resource_id').references(() => studyResources.id, { onDelete: 'set null' }),
    localDate: date('local_date').notNull(),
    minutes: integer('minutes').notNull(),
    activityType: text('activity_type', { enum: STUDY_ACTIVITY_TYPES }).notNull().default('reading'),
    content: text('content').notNull().default(''),
    result: text('result'),
    notes: text('notes'),
    evidenceUrl: text('evidence_url'),
    unitsCompleted: integer('units_completed').notNull().default(0),
    source: text('source', { enum: RECORD_SOURCES }).notNull().default('manual'),
    externalId: text('external_id'),
    grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('study_sessions_user_date_idx').on(t.userId, t.localDate),
    uniqueIndex('study_sessions_ext_uq').on(t.userId, t.source, t.externalId).where(sql`${t.externalId} is not null`),
    check('study_minutes_range', sql`${t.minutes} > 0 and ${t.minutes} <= 1440`),
  ],
);

export const assessments = pgTable('assessments', {
  id: id(),
  userId: userRef(),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => studySubjects.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  localDate: date('local_date').notNull(),
  score: numeric('score', { mode: 'number' }).notNull(),
  maxScore: numeric('max_score', { mode: 'number' }).notNull(),
  notes: text('notes'),
  grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

/** Marcos de domínio demonstrado (ex.: projeto entregue, certificação). */
export const subjectMilestones = pgTable('subject_milestones', {
  id: id(),
  userId: userRef(),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => studySubjects.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  evidenceUrl: text('evidence_url'),
  achievedOn: date('achieved_on').notNull(),
  grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- Treinos

export const activityTypes = pgTable('activity_types', {
  id: id(),
  userId: userRef(),
  name: text('name').notNull(),
  category: text('category', { enum: ACTIVITY_CATEGORIES }).notNull(),
  icon: text('icon').notNull().default('activity'),
  skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
  /** Fator de intensidade aplicado ao XP por minuto (0,5 – 1,5). */
  intensity: real('intensity').notNull().default(1),
  /** Pesos de atributos por código. */
  attributeWeights: jsonb('attribute_weights').$type<Record<string, number>>().notNull().default({}),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const activities = pgTable(
  'activities',
  {
    id: id(),
    userId: userRef(),
    typeId: uuid('type_id')
      .notNull()
      .references(() => activityTypes.id, { onDelete: 'restrict' }),
    title: text('title'),
    localDate: date('local_date').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    durationMin: integer('duration_min').notNull(),
    distanceKm: numeric('distance_km', { mode: 'number' }),
    elevationM: integer('elevation_m'),
    avgHeartRate: integer('avg_heart_rate'),
    perceivedEffort: integer('perceived_effort'),
    notes: text('notes'),
    source: text('source', { enum: RECORD_SOURCES }).notNull().default('manual'),
    externalId: text('external_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('activities_user_date_idx').on(t.userId, t.localDate),
    uniqueIndex('activities_ext_uq').on(t.userId, t.source, t.externalId).where(sql`${t.externalId} is not null`),
    check('activity_duration_range', sql`${t.durationMin} > 0 and ${t.durationMin} <= 1440`),
    check('activity_effort_range', sql`${t.perceivedEffort} is null or (${t.perceivedEffort} between 1 and 10)`),
  ],
);

export const exercises = pgTable('exercises', {
  id: id(),
  userId: userRef(),
  name: text('name').notNull(),
  muscleGroup: text('muscle_group').notNull().default('geral'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const activitySets = pgTable('activity_sets', {
  id: id(),
  userId: userRef(),
  activityId: uuid('activity_id')
    .notNull()
    .references(() => activities.id, { onDelete: 'cascade' }),
  exerciseId: uuid('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'restrict' }),
  setIndex: integer('set_index').notNull(),
  reps: integer('reps').notNull(),
  weightKg: numeric('weight_kg', { mode: 'number' }),
  rir: integer('rir'),
});

export const personalRecords = pgTable(
  'personal_records',
  {
    id: id(),
    userId: userRef(),
    /** longest_run_km | fastest_pace_5k | heaviest_set | estimated_1rm */
    kind: text('kind').notNull(),
    exerciseId: uuid('exercise_id').references(() => exercises.id, { onDelete: 'cascade' }),
    value: numeric('value', { mode: 'number' }).notNull(),
    unit: text('unit').notNull(),
    activityId: uuid('activity_id').references(() => activities.id, { onDelete: 'set null' }),
    achievedOn: date('achieved_on').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('pr_user_kind_idx').on(t.userId, t.kind)],
);

// ---------------------------------------------------------------- Registros rápidos

export const quickLogs = pgTable(
  'quick_logs',
  {
    id: id(),
    userId: userRef(),
    title: text('title').notNull(),
    normalizedKey: text('normalized_key').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    attributeId: uuid('attribute_id').references(() => attributes.id, { onDelete: 'set null' }),
    localDate: date('local_date').notNull(),
    grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('quick_logs_user_date_idx').on(t.userId, t.localDate, t.normalizedKey)],
);

// ---------------------------------------------------------------- Loja, inventário e conquistas

export const items = pgTable(
  'items',
  {
    id: id(),
    userId: userRef(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon').notNull().default('gem'),
    category: text('category').notNull().default('Recompensas pessoais'),
    kind: text('kind', { enum: ITEM_KINDS }).notNull(),
    rarity: text('rarity', { enum: RARITIES }).notNull().default('common'),
    /** Preço em moedas; nulo = não vendido na loja (obtido por conquistas/níveis). */
    price: integer('price'),
    active: boolean('active').notNull().default(true),
    availableFrom: timestamp('available_from', { withTimezone: true }),
    availableUntil: timestamp('available_until', { withTimezone: true }),
    minLevel: integer('min_level'),
    requiredAchievementId: uuid('required_achievement_id').references((): any => achievements.id, { onDelete: 'set null' }),
    purchaseLimit: integer('purchase_limit'),
    cooldownDays: integer('cooldown_days'),
    /** Dados específicos do tipo (ex.: chave do tema). */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check('items_price_nonneg', sql`${t.price} is null or ${t.price} >= 0`)],
);

export const purchases = pgTable(
  'purchases',
  {
    id: id(),
    userId: userRef(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: integer('unit_price').notNull(),
    total: integer('total').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status', { enum: ['completed', 'refunded'] }).notNull().default('completed'),
    itemSnapshot: jsonb('item_snapshot').notNull(),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    refundReason: text('refund_reason'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('purchases_idem_uq').on(t.userId, t.idempotencyKey), check('purchase_qty', sql`${t.quantity} >= 1`)],
);

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: id(),
    userId: userRef(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    purchaseId: uuid('purchase_id').references(() => purchases.id, { onDelete: 'set null' }),
    source: text('source', { enum: INVENTORY_SOURCES }).notNull(),
    /** Slot de equipamento (tipo do item) para itens equipáveis. */
    slot: text('slot'),
    state: text('state', { enum: INVENTORY_STATES }).notNull().default('owned'),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    note: text('note'),
  },
  (t) => [
    index('inventory_user_idx').on(t.userId),
    uniqueIndex('inventory_equipped_slot_uq').on(t.userId, t.slot).where(sql`${t.state} = 'equipped'`),
  ],
);

export const achievements = pgTable(
  'achievements',
  {
    id: id(),
    userId: userRef(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull().default('Consistência'),
    icon: text('icon').notNull().default('trophy'),
    rarity: text('rarity', { enum: RARITIES }).notNull().default('common'),
    /** DSL de critérios validada por Zod (achievementCriteriaSchema). */
    criteria: jsonb('criteria').notNull(),
    secret: boolean('secret').notNull().default(false),
    rewardXp: integer('reward_xp').notNull().default(0),
    rewardCoins: integer('reward_coins').notNull().default(0),
    rewardItemId: uuid('reward_item_id').references((): any => items.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('achievements_key_uq').on(t.userId, t.key)],
);

export const userAchievements = pgTable(
  'user_achievements',
  {
    id: id(),
    userId: userRef(),
    achievementId: uuid('achievement_id')
      .notNull()
      .references(() => achievements.id, { onDelete: 'restrict' }),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
    grantId: uuid('grant_id').references(() => rewardGrants.id, { onDelete: 'set null' }),
    snapshot: jsonb('snapshot'),
  },
  (t) => [uniqueIndex('user_achievements_uq').on(t.userId, t.achievementId)],
);

export const pageVisits = pgTable(
  'page_visits',
  {
    userId: userRef(),
    page: text('page').notNull(),
    firstVisitAt: timestamp('first_visit_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.page] })],
);

// ---------------------------------------------------------------- Notificações, integrações, auditoria

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: userRef(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    link: text('link'),
    dedupeKey: text('dedupe_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('notifications_dedupe_uq').on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: id(),
    userId: userRef(),
    provider: text('provider', { enum: ['strava', 'lyfta', 'hevy'] }).notNull(),
    status: text('status', { enum: ['pending', 'connected', 'error', 'revoked'] }).notNull().default('pending'),
    externalAccountId: text('external_account_id'),
    scopes: text('scopes'),
    /** Credenciais cifradas com AES-256-GCM (chave em INTEGRATION_ENCRYPTION_KEY). */
    accessTokenEnc: text('access_token_enc'),
    refreshTokenEnc: text('refresh_token_enc'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('integration_conn_uq').on(t.userId, t.provider)],
);

export const integrationEvents = pgTable(
  'integration_events',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(),
    externalId: text('external_id').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    payload: jsonb('payload'),
    status: text('status', { enum: ['received', 'processed', 'ignored', 'error'] }).notNull().default('received'),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('integration_events_dedupe_uq').on(t.provider, t.dedupeKey)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    meta: jsonb('meta'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_user_created_idx').on(t.userId, t.createdAt)],
);
