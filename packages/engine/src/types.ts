/**
 * Tipos de domínio compartilhados pelo motor, pela API e pela interface.
 * Os valores são estáveis (persistidos no banco); os rótulos ficam em LABELS.
 */

export const DIFFICULTIES = ['routine', 'easy', 'moderate', 'hard', 'very_hard', 'epic', 'legendary'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  routine: 'Rotineira',
  easy: 'Fácil',
  moderate: 'Moderada',
  hard: 'Difícil',
  very_hard: 'Muito difícil',
  epic: 'Épica',
  legendary: 'Lendária',
};

export function difficultyRank(d: Difficulty): number {
  return DIFFICULTIES.indexOf(d);
}

export const MISSION_TYPES = [
  'daily',
  'weekly',
  'monthly',
  'one_time',
  'recurring',
  'long_term',
  'chain',
  'project',
  'season',
  'secret',
  'milestone',
  'special',
] as const;
export type MissionType = (typeof MISSION_TYPES)[number];

export const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal',
  one_time: 'Única',
  recurring: 'Recorrente',
  long_term: 'Longo prazo',
  chain: 'Sequência',
  project: 'Projeto',
  season: 'Temporada',
  secret: 'Secreta',
  milestone: 'Marco',
  special: 'Desafio especial',
};

export const MISSION_STATUSES = ['available', 'in_progress', 'completed', 'failed', 'cancelled', 'suspended', 'expired'] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  available: 'Disponível',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
  suspended: 'Suspensa',
  expired: 'Expirada',
};

/** Estados terminais: nenhuma transição posterior é permitida (exceto correção administrativa). */
export const TERMINAL_MISSION_STATUSES: readonly MissionStatus[] = ['completed', 'failed', 'cancelled', 'expired'];

/** Transições de estado permitidas para missões. */
export const MISSION_TRANSITIONS: Record<MissionStatus, readonly MissionStatus[]> = {
  available: ['in_progress', 'completed', 'failed', 'cancelled', 'suspended', 'expired'],
  in_progress: ['completed', 'failed', 'cancelled', 'suspended', 'expired'],
  suspended: ['available', 'in_progress', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function canTransitionMission(from: MissionStatus, to: MissionStatus): boolean {
  return MISSION_TRANSITIONS[from].includes(to);
}

/** Categorias de origem de XP geral, usadas para limites diários. */
export const XP_SOURCES = ['mission', 'habit', 'study', 'training', 'quick', 'goal', 'achievement', 'streak', 'season', 'adjustment'] as const;
export type XpSource = (typeof XP_SOURCES)[number];

export const XP_SOURCE_LABELS: Record<XpSource, string> = {
  mission: 'Missões',
  habit: 'Hábitos',
  study: 'Estudos',
  training: 'Treinos',
  quick: 'Registros rápidos',
  goal: 'Metas',
  achievement: 'Conquistas',
  streak: 'Sequências',
  season: 'Temporadas',
  adjustment: 'Ajustes',
};

export const COIN_TX_KINDS = ['earn', 'spend', 'penalty', 'refund', 'reversal', 'adjustment'] as const;
export type CoinTxKind = (typeof COIN_TX_KINDS)[number];

export const COIN_TX_KIND_LABELS: Record<CoinTxKind, string> = {
  earn: 'Ganho',
  spend: 'Gasto',
  penalty: 'Penalidade',
  refund: 'Reembolso',
  reversal: 'Estorno',
  adjustment: 'Ajuste',
};

export const PENALTY_TYPES = [
  'failure_record',
  'coin_loss',
  'forfeit_reward',
  'mission_progress',
  'streak_reset',
  'multiplier_reduction',
  'reward_lock',
  'skill_xp_loss',
] as const;
export type PenaltyType = (typeof PENALTY_TYPES)[number];

export const PENALTY_TYPE_LABELS: Record<PenaltyType, string> = {
  failure_record: 'Registro de falha',
  coin_loss: 'Perda de moedas',
  forfeit_reward: 'Perda da recompensa potencial',
  mission_progress: 'Redução de progresso de missão',
  streak_reset: 'Perda de sequência (sem tolerância)',
  multiplier_reduction: 'Redução temporária do multiplicador de consistência',
  reward_lock: 'Bloqueio temporário de recompensa',
  skill_xp_loss: 'Perda de XP de habilidade (opcional)',
};

export const HABIT_FREQUENCIES = ['daily', 'weekdays', 'times_per_week'] as const;
export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number];

export const CHECKIN_STATUSES = ['done', 'missed', 'tolerated', 'excused', 'rest', 'skipped'] as const;
export type CheckinStatus = (typeof CHECKIN_STATUSES)[number];

export const CHECKIN_STATUS_LABELS: Record<CheckinStatus, string> = {
  done: 'Cumprido',
  missed: 'Falhou',
  tolerated: 'Falha tolerada',
  excused: 'Dispensado',
  rest: 'Descanso',
  skipped: 'Não programado',
};

export const ITEM_KINDS = ['real_reward', 'consumable', 'cosmetic', 'title', 'badge', 'frame', 'theme', 'effect', 'collectible', 'challenge_unlock'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  real_reward: 'Recompensa real',
  consumable: 'Consumível',
  cosmetic: 'Cosmético',
  title: 'Título',
  badge: 'Insígnia',
  frame: 'Moldura',
  theme: 'Tema',
  effect: 'Efeito visual',
  collectible: 'Colecionável',
  challenge_unlock: 'Desbloqueio de desafio',
};

/** Itens que podem ser equipados ocupam um "slot" único por tipo. */
export const EQUIPPABLE_KINDS: readonly ItemKind[] = ['title', 'badge', 'frame', 'theme', 'effect'];
/** Itens que são usados uma vez (consumir / resgatar). */
export const SINGLE_USE_KINDS: readonly ItemKind[] = ['real_reward', 'consumable'];

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Comum',
  uncommon: 'Incomum',
  rare: 'Rara',
  epic: 'Épica',
  legendary: 'Lendária',
  mythic: 'Mítica',
};

export const ACTIVITY_CATEGORIES = ['strength', 'run', 'walk', 'cycle', 'swim', 'mobility', 'sport', 'other'] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  strength: 'Musculação',
  run: 'Corrida',
  walk: 'Caminhada',
  cycle: 'Ciclismo',
  swim: 'Natação',
  mobility: 'Mobilidade',
  sport: 'Esporte',
  other: 'Outra',
};

export const STUDY_ACTIVITY_TYPES = ['reading', 'lesson', 'exercises', 'review', 'project', 'assessment', 'writing'] as const;
export type StudyActivityType = (typeof STUDY_ACTIVITY_TYPES)[number];
export const STUDY_ACTIVITY_LABELS: Record<StudyActivityType, string> = {
  reading: 'Leitura',
  lesson: 'Aula',
  exercises: 'Exercícios',
  review: 'Revisão',
  project: 'Projeto',
  assessment: 'Avaliação',
  writing: 'Escrita',
};

export const UNAVAILABILITY_REASONS = ['illness', 'injury', 'emergency', 'travel', 'planned_rest', 'commitment', 'other'] as const;
export type UnavailabilityReason = (typeof UNAVAILABILITY_REASONS)[number];
export const UNAVAILABILITY_REASON_LABELS: Record<UnavailabilityReason, string> = {
  illness: 'Doença',
  injury: 'Lesão',
  emergency: 'Emergência',
  travel: 'Viagem',
  planned_rest: 'Descanso planejado',
  commitment: 'Compromisso imprevisto',
  other: 'Outro',
};

/** Mapa de pesos (código do atributo → peso). Os pesos são normalizados pelo motor. */
export type AttributeWeights = Record<string, number>;
