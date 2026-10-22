/**
 * Tipos de linha (row models) e enumerações do banco, expostos à aplicação
 * sem acoplá-la ao ORM. Novas tabelas em schema.ts devem ganhar seu tipo aqui.
 */
import type * as s from './schema';

export {
  ROLES,
  THEMES,
  GOAL_STATUSES,
  GOAL_PRIORITIES,
  GOAL_MODES,
  OBJECTIVE_METRICS,
  HABIT_STATUSES,
  SEASON_STATUSES,
  INVENTORY_STATES,
  INVENTORY_SOURCES,
  RECORD_SOURCES,
  RESOURCE_KINDS,
  RESOURCE_STATUSES,
  RECURRENCES,
  GRANT_SOURCES,
} from './schema';

export type User = typeof s.users.$inferSelect;
export type Session = typeof s.sessions.$inferSelect;
export type UserSettings = typeof s.userSettings.$inferSelect;
export type GameConfigRow = typeof s.gameConfigs.$inferSelect;
export type CharacterProgress = typeof s.characterProgress.$inferSelect;
export type LevelHistoryRow = typeof s.levelHistory.$inferSelect;
export type Rank = typeof s.ranks.$inferSelect;
export type LevelReward = typeof s.levelRewards.$inferSelect;
export type Category = typeof s.categories.$inferSelect;
export type Attribute = typeof s.attributes.$inferSelect;
export type Skill = typeof s.skills.$inferSelect;
export type RewardGrant = typeof s.rewardGrants.$inferSelect;
export type GrantAttributeXp = typeof s.grantAttributeXp.$inferSelect;
export type GrantSkillXp = typeof s.grantSkillXp.$inferSelect;
export type Wallet = typeof s.wallets.$inferSelect;
export type CoinTransaction = typeof s.coinTransactions.$inferSelect;
export type PenaltyRule = typeof s.penaltyRules.$inferSelect;
export type PenaltyApplication = typeof s.penaltyApplications.$inferSelect;
export type Unavailability = typeof s.unavailability.$inferSelect;
export type Goal = typeof s.goals.$inferSelect;
export type GoalMilestone = typeof s.goalMilestones.$inferSelect;
export type GoalDependency = typeof s.goalDependencies.$inferSelect;
export type Season = typeof s.seasons.$inferSelect;
export type SeasonReward = typeof s.seasonRewards.$inferSelect;
export type MissionTemplate = typeof s.missionTemplates.$inferSelect;
export type Mission = typeof s.missions.$inferSelect;
export type MissionObjective = typeof s.missionObjectives.$inferSelect;
export type MissionPenaltyRule = typeof s.missionPenaltyRules.$inferSelect;
export type MissionEvent = typeof s.missionEvents.$inferSelect;
export type Habit = typeof s.habits.$inferSelect;
export type HabitPenaltyRule = typeof s.habitPenaltyRules.$inferSelect;
export type HabitCheckin = typeof s.habitCheckins.$inferSelect;
export type KnowledgeArea = typeof s.knowledgeAreas.$inferSelect;
export type StudySubject = typeof s.studySubjects.$inferSelect;
export type SubjectPrerequisite = typeof s.subjectPrerequisites.$inferSelect;
export type StudyResource = typeof s.studyResources.$inferSelect;
export type StudySession = typeof s.studySessions.$inferSelect;
export type Assessment = typeof s.assessments.$inferSelect;
export type SubjectMilestone = typeof s.subjectMilestones.$inferSelect;
export type ActivityType = typeof s.activityTypes.$inferSelect;
export type Activity = typeof s.activities.$inferSelect;
export type Exercise = typeof s.exercises.$inferSelect;
export type ActivitySet = typeof s.activitySets.$inferSelect;
export type PersonalRecord = typeof s.personalRecords.$inferSelect;
export type QuickLog = typeof s.quickLogs.$inferSelect;
export type Item = typeof s.items.$inferSelect;
export type Purchase = typeof s.purchases.$inferSelect;
export type InventoryItem = typeof s.inventoryItems.$inferSelect;
export type Achievement = typeof s.achievements.$inferSelect;
export type UserAchievement = typeof s.userAchievements.$inferSelect;
export type PageVisit = typeof s.pageVisits.$inferSelect;
export type Notification = typeof s.notifications.$inferSelect;
export type IntegrationConnection = typeof s.integrationConnections.$inferSelect;
export type IntegrationEvent = typeof s.integrationEvents.$inferSelect;
export type AuditLogRow = typeof s.auditLog.$inferSelect;
