import { getTableColumns, getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as s from './schema';

export type FieldType = 'uuid' | 'ref' | 'text' | 'longtext' | 'enum' | 'int' | 'number' | 'boolean' | 'date' | 'datetime' | 'json';

export interface FieldMeta {
  key: string;
  column: string;
  type: FieldType;
  required: boolean;
  readonly: boolean;
  enumValues?: string[];
  /** Recurso referenciado (para seletores). */
  ref?: string;
  label: string;
}

export type ResourceMode = 'crud' | 'readonly';

export interface ResourceDef {
  key: string;
  label: string;
  group: string;
  table: PgTable;
  mode: ResourceMode;
  /** Campo exibido como título em listas e seletores. */
  display: string;
  /** Campos adicionais somente leitura (projeções, vínculos com o livro-razão). */
  readonly?: string[];
  refs?: Record<string, string>;
  hidden?: string[];
  /** Aviso exibido no formulário. */
  note?: string;
  /** Recurso sem coluna `id` (chave composta): somente leitura. */
  composite?: boolean;
  /** Tabela sem `user_id` (ex.: users). */
  global?: boolean;
}

const LEDGER_NOTE = 'Livro-razão imutável: corrija por estorno, ajuste, reembolso ou reversão — nunca por edição direta.';
const PROJECTION_NOTE = 'Projeção derivada do livro-razão. Use "Integridade → Recalcular projeções" ou um ajuste auditado.';
const DIRECT_EDIT_NOTE = 'Edição direta altera os dados brutos (com auditoria), mas não concede nem estorna recompensas. Para efeitos de jogo, use as ações das telas.';

const GENERAL_READONLY = ['id', 'userId', 'createdAt', 'updatedAt'];

export const RESOURCES: ResourceDef[] = [
  // Identidade
  { key: 'users', label: 'Usuários', group: 'Identidade', table: s.users, mode: 'crud', display: 'email', hidden: ['passwordHash'], global: true, note: 'Senhas são redefinidas pela ação "Redefinir senha". O e-mail deve ser único.' },
  { key: 'user_settings', label: 'Configurações do usuário', group: 'Identidade', table: s.userSettings, mode: 'readonly', display: 'timezone', note: 'Edite pela tela de Configurações (validação de fuso e temas).' },
  { key: 'game_configs', label: 'Versões da configuração do jogo', group: 'Identidade', table: s.gameConfigs, mode: 'readonly', display: 'version', note: 'Publique novas versões em Configurações → Progressão.' },
  { key: 'sessions', label: 'Sessões', group: 'Identidade', table: s.sessions, mode: 'readonly', display: 'userAgent', hidden: ['id'] },

  // Personagem
  { key: 'character_progress', label: 'Progresso do personagem', group: 'Personagem', table: s.characterProgress, mode: 'readonly', display: 'level', note: PROJECTION_NOTE },
  { key: 'level_history', label: 'Histórico de níveis', group: 'Personagem', table: s.levelHistory, mode: 'readonly', display: 'level', note: LEDGER_NOTE },
  { key: 'ranks', label: 'Ranks', group: 'Personagem', table: s.ranks, mode: 'crud', display: 'name' },
  { key: 'level_rewards', label: 'Marcos de nível', group: 'Personagem', table: s.levelRewards, mode: 'crud', display: 'description', refs: { itemId: 'items' } },
  { key: 'attributes', label: 'Atributos', group: 'Personagem', table: s.attributes, mode: 'crud', display: 'name', readonly: ['xp', 'level', 'code'], note: 'O código é um identificador imutável (usado nos pesos). XP/nível são projeções.' },
  { key: 'skills', label: 'Habilidades', group: 'Personagem', table: s.skills, mode: 'crud', display: 'name', readonly: ['xp', 'level'], refs: { attributeId: 'attributes', parentId: 'skills' } },
  { key: 'categories', label: 'Categorias (áreas da vida)', group: 'Personagem', table: s.categories, mode: 'crud', display: 'name' },

  // Missões e metas
  { key: 'missions', label: 'Missões', group: 'Missões e metas', table: s.missions, mode: 'crud', display: 'title', readonly: ['grantId', 'completedAt', 'completedOn', 'templateId', 'periodKey'], refs: { goalId: 'goals', seasonId: 'seasons', categoryId: 'categories', parentId: 'missions', templateId: 'mission_templates' }, note: DIRECT_EDIT_NOTE },
  { key: 'mission_objectives', label: 'Objetivos de missões', group: 'Missões e metas', table: s.missionObjectives, mode: 'crud', display: 'title', refs: { missionId: 'missions' } },
  { key: 'mission_templates', label: 'Modelos de missão', group: 'Missões e metas', table: s.missionTemplates, mode: 'crud', display: 'title', refs: { categoryId: 'categories' } },
  { key: 'mission_events', label: 'Eventos de missões', group: 'Missões e metas', table: s.missionEvents, mode: 'readonly', display: 'toStatus', refs: { missionId: 'missions' } },
  { key: 'mission_penalty_rules', label: 'Penalidades das missões', group: 'Missões e metas', table: s.missionPenaltyRules, mode: 'readonly', display: 'ruleId', composite: true },
  { key: 'goals', label: 'Metas', group: 'Missões e metas', table: s.goals, mode: 'crud', display: 'title', readonly: ['grantId', 'completedAt'], refs: { categoryId: 'categories' }, note: DIRECT_EDIT_NOTE },
  { key: 'goal_milestones', label: 'Etapas de metas', group: 'Missões e metas', table: s.goalMilestones, mode: 'crud', display: 'title', refs: { goalId: 'goals' } },
  { key: 'goal_dependencies', label: 'Dependências entre metas', group: 'Missões e metas', table: s.goalDependencies, mode: 'readonly', display: 'goalId', composite: true },

  // Hábitos e penalidades
  { key: 'habits', label: 'Hábitos', group: 'Hábitos e penalidades', table: s.habits, mode: 'crud', display: 'title', readonly: ['currentStreak', 'bestStreak'], refs: { categoryId: 'categories' } },
  { key: 'habit_checkins', label: 'Registros de hábitos', group: 'Hábitos e penalidades', table: s.habitCheckins, mode: 'crud', display: 'localDate', readonly: ['grantId'], refs: { habitId: 'habits' }, note: `${DIRECT_EDIT_NOTE} Após editar, recalcule a sequência do hábito.` },
  { key: 'habit_penalty_rules', label: 'Penalidades dos hábitos', group: 'Hábitos e penalidades', table: s.habitPenaltyRules, mode: 'readonly', display: 'ruleId', composite: true },
  { key: 'penalty_rules', label: 'Regras de penalidade', group: 'Hábitos e penalidades', table: s.penaltyRules, mode: 'crud', display: 'name', refs: { targetItemId: 'items', targetSkillId: 'skills' } },
  { key: 'penalty_applications', label: 'Penalidades aplicadas', group: 'Hábitos e penalidades', table: s.penaltyApplications, mode: 'readonly', display: 'sourceTitle', note: LEDGER_NOTE },
  { key: 'unavailability', label: 'Indisponibilidades', group: 'Hábitos e penalidades', table: s.unavailability, mode: 'crud', display: 'reason', refs: { categoryId: 'categories' } },

  // Estudos
  { key: 'knowledge_areas', label: 'Áreas de conhecimento', group: 'Estudos', table: s.knowledgeAreas, mode: 'crud', display: 'name' },
  { key: 'study_subjects', label: 'Disciplinas', group: 'Estudos', table: s.studySubjects, mode: 'crud', display: 'name', refs: { areaId: 'knowledge_areas', skillId: 'skills' } },
  { key: 'subject_prerequisites', label: 'Pré-requisitos', group: 'Estudos', table: s.subjectPrerequisites, mode: 'readonly', display: 'subjectId', composite: true },
  { key: 'study_resources', label: 'Recursos de estudo', group: 'Estudos', table: s.studyResources, mode: 'crud', display: 'title', refs: { subjectId: 'study_subjects', parentId: 'study_resources' } },
  { key: 'study_sessions', label: 'Sessões de estudo', group: 'Estudos', table: s.studySessions, mode: 'crud', display: 'content', readonly: ['grantId', 'source', 'externalId'], refs: { subjectId: 'study_subjects', resourceId: 'study_resources' }, note: DIRECT_EDIT_NOTE },
  { key: 'assessments', label: 'Avaliações', group: 'Estudos', table: s.assessments, mode: 'crud', display: 'title', readonly: ['grantId'], refs: { subjectId: 'study_subjects' }, note: DIRECT_EDIT_NOTE },
  { key: 'subject_milestones', label: 'Marcos de domínio', group: 'Estudos', table: s.subjectMilestones, mode: 'crud', display: 'title', readonly: ['grantId'], refs: { subjectId: 'study_subjects' } },

  // Treinos
  { key: 'activity_types', label: 'Tipos de atividade', group: 'Treinos', table: s.activityTypes, mode: 'crud', display: 'name', refs: { skillId: 'skills' } },
  { key: 'activities', label: 'Atividades', group: 'Treinos', table: s.activities, mode: 'crud', display: 'title', readonly: ['grantId', 'source', 'externalId'], refs: { typeId: 'activity_types' }, note: DIRECT_EDIT_NOTE },
  { key: 'activity_sets', label: 'Séries', group: 'Treinos', table: s.activitySets, mode: 'crud', display: 'setIndex', refs: { activityId: 'activities', exerciseId: 'exercises' } },
  { key: 'exercises', label: 'Exercícios', group: 'Treinos', table: s.exercises, mode: 'crud', display: 'name' },
  { key: 'personal_records', label: 'Recordes pessoais', group: 'Treinos', table: s.personalRecords, mode: 'crud', display: 'kind', refs: { exerciseId: 'exercises', activityId: 'activities' } },
  { key: 'quick_logs', label: 'Registros rápidos', group: 'Treinos', table: s.quickLogs, mode: 'readonly', display: 'title' },

  // Economia
  { key: 'reward_grants', label: 'Recompensas (XP/moedas)', group: 'Economia', table: s.rewardGrants, mode: 'readonly', display: 'title', note: LEDGER_NOTE },
  { key: 'grant_attribute_xp', label: 'XP de atributos (lançamentos)', group: 'Economia', table: s.grantAttributeXp, mode: 'readonly', display: 'amount', composite: true },
  { key: 'grant_skill_xp', label: 'XP de habilidades (lançamentos)', group: 'Economia', table: s.grantSkillXp, mode: 'readonly', display: 'amount', composite: true },
  { key: 'wallets', label: 'Carteiras', group: 'Economia', table: s.wallets, mode: 'readonly', display: 'balance', note: PROJECTION_NOTE },
  { key: 'coin_transactions', label: 'Transações de moedas', group: 'Economia', table: s.coinTransactions, mode: 'readonly', display: 'reason', note: LEDGER_NOTE },
  { key: 'items', label: 'Itens e loja', group: 'Economia', table: s.items, mode: 'crud', display: 'name', refs: { requiredAchievementId: 'achievements' }, note: 'Mudar o preço não altera compras anteriores (o preço pago fica gravado na compra).' },
  { key: 'purchases', label: 'Compras', group: 'Economia', table: s.purchases, mode: 'readonly', display: 'id', note: LEDGER_NOTE },
  { key: 'inventory_items', label: 'Inventário', group: 'Economia', table: s.inventoryItems, mode: 'crud', display: 'state', readonly: ['purchaseId'], refs: { itemId: 'items' } },

  // Coleções
  { key: 'achievements', label: 'Conquistas (definições)', group: 'Coleções', table: s.achievements, mode: 'crud', display: 'name', readonly: ['key'], refs: { rewardItemId: 'items' }, note: 'Critérios: {"all":[{"metric":"study_sessions","gte":100}]}. A chave é imutável.' },
  { key: 'user_achievements', label: 'Conquistas desbloqueadas', group: 'Coleções', table: s.userAchievements, mode: 'readonly', display: 'unlockedAt', note: 'Use a ação "Revogar" (estorna a recompensa).' },
  { key: 'seasons', label: 'Temporadas', group: 'Coleções', table: s.seasons, mode: 'crud', display: 'name' },
  { key: 'season_rewards', label: 'Recompensas sazonais', group: 'Coleções', table: s.seasonRewards, mode: 'crud', display: 'title', readonly: ['claimedAt', 'grantId'], refs: { seasonId: 'seasons', itemId: 'items' } },

  // Sistema
  { key: 'notifications', label: 'Notificações', group: 'Sistema', table: s.notifications, mode: 'crud', display: 'title' },
  { key: 'page_visits', label: 'Áreas visitadas', group: 'Sistema', table: s.pageVisits, mode: 'readonly', display: 'page', composite: true },
  { key: 'integration_connections', label: 'Conexões de integração', group: 'Sistema', table: s.integrationConnections, mode: 'readonly', display: 'provider', hidden: ['accessTokenEnc', 'refreshTokenEnc'] },
  { key: 'integration_events', label: 'Eventos de integração', group: 'Sistema', table: s.integrationEvents, mode: 'readonly', display: 'eventType' },
  { key: 'audit_log', label: 'Auditoria', group: 'Sistema', table: s.auditLog, mode: 'readonly', display: 'action' },
];

export function getResource(key: string): ResourceDef | undefined {
  return RESOURCES.find((r) => r.key === key);
}

const LABELS: Record<string, string> = {
  id: 'ID', userId: 'Usuário', createdAt: 'Criado em', updatedAt: 'Atualizado em', title: 'Título', name: 'Nome',
  description: 'Descrição', status: 'Estado', type: 'Tipo', difficulty: 'Dificuldade', categoryId: 'Categoria',
  startDate: 'Início', dueDate: 'Prazo', endDate: 'Fim', price: 'Preço', kind: 'Tipo', rarity: 'Raridade',
  xp: 'XP', level: 'Nível', coins: 'Moedas', amount: 'Valor', reason: 'Motivo', localDate: 'Data local',
  archivedAt: 'Arquivado em', sortOrder: 'Ordem', color: 'Cor', icon: 'Ícone', email: 'E-mail', role: 'Papel',
};

function humanize(key: string) {
  return LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/** Metadados dos campos derivados das colunas do Drizzle (uma única fonte: o schema). */
export function fieldsOf(def: ResourceDef): FieldMeta[] {
  const cols = getTableColumns(def.table) as Record<string, any>;
  const out: FieldMeta[] = [];
  for (const [key, col] of Object.entries(cols)) {
    if (def.hidden?.includes(key)) continue;
    const ct: string = col.columnType;
    let type: FieldType = 'text';
    if (ct === 'PgUUID') type = def.refs?.[key] ? 'ref' : 'uuid';
    else if (ct === 'PgText') type = col.enumValues?.length ? 'enum' : /description|notes|content|body|bio|criteria/i.test(key) ? 'longtext' : 'text';
    else if (ct === 'PgInteger' || ct === 'PgBigInt53') type = 'int';
    else if (ct === 'PgNumeric' || ct === 'PgReal' || ct === 'PgDoublePrecision') type = 'number';
    else if (ct === 'PgBoolean') type = 'boolean';
    else if (ct === 'PgDateString' || ct === 'PgDate') type = 'date';
    else if (ct === 'PgTimestamp' || ct === 'PgTimestampString') type = 'datetime';
    else if (ct === 'PgJsonb' || ct === 'PgJson') type = 'json';
    const readonly = def.mode === 'readonly' || GENERAL_READONLY.includes(key) || (def.readonly ?? []).includes(key);
    out.push({
      key,
      column: col.name,
      type,
      required: col.notNull && !col.hasDefault && !readonly,
      readonly,
      enumValues: col.enumValues?.length ? col.enumValues : undefined,
      ref: def.refs?.[key],
      label: humanize(key),
    });
  }
  return out;
}

export function tableName(def: ResourceDef) {
  return getTableName(def.table);
}
