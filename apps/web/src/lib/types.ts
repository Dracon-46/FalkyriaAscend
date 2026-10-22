import type { CheckinStatus, Difficulty, HabitFrequency, ItemKind, LevelState, MissionStatus, MissionType, PenaltyType, Rarity, XpSource } from '@rpg/engine';

/** Tipos das respostas da API usados pela interface. */

export type ThemeKey = 'medieval' | 'vampire' | 'angel' | 'system' | 'custom';

export interface Settings {
  userId: string;
  timezone: string;
  theme: ThemeKey;
  customTheme: { base: Exclude<ThemeKey, 'custom'>; accent: string; accent2: string; effects: number } | null;
  reducedMotion: 'system' | 'on' | 'off';
  dashboardWidgets: { widgets: Array<{ id: string; visible: boolean }>; periodDays: number } | null;
  notificationPrefs: { categories: Record<string, boolean>; quietStart?: string; quietEnd?: string } | null;
  penaltiesEnabled: boolean;
  penaltiesSuspendedUntil: string | null;
  recoveryModeUntil: string | null;
  allowSkillXpPenalty: boolean;
  lastEvaluatedDate: string | null;
}

export interface Rank {
  id?: string;
  minLevel: number;
  code: string;
  name: string;
  color?: string | null;
}

export interface CharacterSummary {
  name: string;
  characterClass: string | null;
  level: LevelState;
  rank: Rank | null;
  nextRank: Rank | null;
  coins: number;
  wallet: { balance: number; totalEarned: number; totalSpent: number; totalPenalties: number } | null;
  multiplier: { multiplier: number; completed: number; scheduled: number; dampening: number };
  equipped: { title: string | null; frame: { name: string; color: string | null } | null; effect: string | null; badge: { name: string; icon: string } | null };
  configVersion: number;
}

export interface Me {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: 'admin' | 'user';
    characterClass: string | null;
    bio: string | null;
    isDemo: boolean;
    createdAt: string;
  };
  settings: Settings;
  today: string;
  character: CharacterSummary;
  unreadNotifications: number;
}

export interface Objective {
  id: string;
  missionId: string;
  title: string;
  metric: string;
  metricRefId: string | null;
  target: number;
  current: number;
  unit: string | null;
  optional: boolean;
  sortOrder: number;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  type: MissionType;
  difficulty: Difficulty;
  status: MissionStatus;
  statusReason: string | null;
  categoryId: string | null;
  goalId: string | null;
  seasonId: string | null;
  parentId: string | null;
  templateId: string | null;
  startDate: string | null;
  dueDate: string | null;
  completionMode: 'manual' | 'auto';
  rewardXpOverride: number | null;
  rewardCoinsOverride: number | null;
  isSecret: boolean;
  evidenceRequired: boolean;
  evidence: string | null;
  priority: number;
  attributeWeights: Record<string, number>;
  completedAt: string | null;
  completedOn: string | null;
  source: string;
  createdAt: string;
  objectives: Objective[];
  hidden?: boolean;
}

export interface MissionDetail extends Mission {
  progress: { progress: number; requiredDone: number; requiredTotal: number; complete: boolean };
  events: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; actor: string; createdAt: string; data: unknown }>;
  penaltyRuleIds: string[];
  grants: Grant[];
  penalties: PenaltyApplication[];
}

export interface RewardOutcome {
  grantId: string;
  created: boolean;
  xp: number;
  coins: number;
  levelUps: number[];
  level: number;
  explanation?: string[];
}

export interface AfterAction {
  autoCompletedMissions: string[];
  unlockedAchievements: string[];
}

export interface Habit {
  id: string;
  title: string;
  description: string;
  categoryId: string | null;
  difficulty: Difficulty;
  frequency: HabitFrequency;
  weekdaysMask: number;
  timesPerWeek: number;
  timeOfDay: string | null;
  completionCriteria: string;
  startDate: string;
  endDate: string | null;
  tolerancePerWeek: number;
  status: 'active' | 'paused' | 'archived';
  pausedUntil: string | null;
  isBasicNeed: boolean;
  attributeWeights: Record<string, number>;
  notify: boolean;
  sortOrder: number;
  currentStreak: number;
  bestStreak: number;
  scheduledToday: boolean;
  todayStatus: CheckinStatus | null;
  weekDone: number;
  last14: Array<{ date: string; status: CheckinStatus | 'pending' | 'none' | 'off' }>;
  penaltyRuleIds?: string[];
}

export interface Grant {
  id: string;
  idempotencyKey: string;
  sourceType: string;
  sourceId: string | null;
  xpSource: XpSource;
  categoryId: string | null;
  title: string;
  xp: number;
  coins: number;
  localDate: string;
  configVersion: number;
  explanation: string[];
  reversalOf: string | null;
  reversedAt: string | null;
  createdAt: string;
  attributes?: Array<{ code: string; amount: number }>;
  skills?: Array<{ name: string; amount: number }>;
}

export interface PenaltyApplication {
  id: string;
  ruleId: string | null;
  ruleSnapshot: Record<string, unknown>;
  sourceType: 'habit' | 'mission';
  sourceId: string;
  sourceTitle: string;
  localDate: string;
  type: PenaltyType;
  step: number;
  amount: number;
  durationDays: number | null;
  reductionPct: number | null;
  expiresOn: string | null;
  explanation: string[];
  status: 'applied' | 'reversed';
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
}

export interface Attribute {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  color: string;
  icon: string;
  progressionCriteria: string;
  sortOrder: number;
  xp: number;
  level: number;
  progress: number;
  xpToNext: number;
  xpForNext: number;
  archivedAt: string | null;
}

export interface Skill {
  id: string;
  attributeId: string | null;
  parentId: string | null;
  name: string;
  description: string;
  icon: string;
  unlockLevel: number;
  sortOrder: number;
  xp: number;
  level: number;
  progress: number;
  xpToNext: number;
  archivedAt: string | null;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  isBasicNeed: boolean;
  sortOrder: number;
  archivedAt: string | null;
}

export interface PenaltyRule {
  id: string;
  name: string;
  description: string;
  type: PenaltyType;
  baseAmount: number;
  escalationStep: number;
  maxAmount: number;
  durationDays: number | null;
  reductionPct: number | null;
  targetItemId: string | null;
  targetSkillId: string | null;
  active: boolean;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  kind: ItemKind;
  rarity: Rarity;
  price: number | null;
  active: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  minLevel: number | null;
  requiredAchievementId: string | null;
  purchaseLimit: number | null;
  cooldownDays: number | null;
  payload: Record<string, unknown>;
  sortOrder: number;
  archivedAt: string | null;
}

export interface ShopItem extends Item {
  availability: { canBuy: boolean; blockers: string[]; owned: number; purchased: number };
}

export interface InventoryEntry {
  id: string;
  itemId: string;
  purchaseId: string | null;
  source: string;
  slot: string | null;
  state: 'owned' | 'equipped' | 'consumed' | 'redeemed' | 'revoked';
  acquiredAt: string;
  usedAt: string | null;
  note: string | null;
  item: Item;
}

export interface AchievementView {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  rarity: Rarity;
  secret: boolean;
  hidden: boolean;
  rewardXp: number;
  rewardCoins: number;
  unlockedAt: string | null;
  progress: number;
  conditions: Array<{ metric: string; current: number; target: number; met: boolean }>;
}

export interface Lookups {
  categories: Array<{ id: string; name: string; color: string; isBasicNeed: boolean }>;
  attributes: Array<{ id: string; code: string; name: string; color: string }>;
  penaltyRules: Array<{ id: string; name: string; type: PenaltyType; active: boolean }>;
  skills: Array<{ id: string; name: string; parentId: string | null }>;
}

export interface SeriesPoint {
  period: string;
  [k: string]: number | string | null;
}

export interface RadarData {
  compareDate: string;
  attributes: Array<{
    id: string;
    code: string;
    name: string;
    color: string;
    xp: number;
    level: number;
    progress: number;
    xpToNext: number;
    previousXp: number;
    previousLevel: number;
  }>;
}

export interface Dashboard {
  today: string;
  periodDays: number;
  widgets: Array<{ id: string; visible: boolean }> | null;
  character: CharacterSummary;
  todayTotals: { xp: number; coins: number };
  todayMissions: Mission[];
  weeklyMissions: Mission[];
  alerts: Array<{ kind: string; title: string; link: string; date?: string | null }>;
  priorityGoals: Array<{ id: string; title: string; priority: string; deadline: string | null; progress: number; blocked: boolean }>;
  habitsToday: Habit[];
  streaks: Array<{ id: string; title: string; current: number; best: number; frequency: string }>;
  recent: Grant[];
  nextAchievements: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    rarity: Rarity;
    progress: number;
    conditions: AchievementView['conditions'];
  }>;
  weeklyXp: SeriesPoint[];
  dailySeries: SeriesPoint[];
  projection: { assumption: string; daysToNextLevel: number | null };
  effort: Array<{ label: string; color: string | null; xp: number }>;
  radar: RadarData;
  season: (Season & { stats: SeasonStats; rewards: SeasonReward[]; daysLeft: number }) | null;
  records: Array<{ id: string; kind: string; value: number; unit: string; achievedOn: string }>;
}

export interface SeasonStats {
  seasonXp: number;
  seasonCoins: number;
  missionsCompleted: number;
  habitsDone: number;
  bySource: Array<{ source: string; xp: number }>;
}
export interface SeasonReward {
  id: string;
  seasonId: string;
  title: string;
  thresholdXp: number;
  coins: number;
  itemId: string | null;
  claimedAt: string | null;
}
export interface Season {
  id: string;
  name: string;
  description: string;
  theme: string | null;
  startDate: string;
  endDate: string;
  status: 'planned' | 'active' | 'closed';
  summary: SeasonStats | null;
  closedAt: string | null;
}
