import { DEFAULT_GAME_CONFIG, DEFAULT_RANKS, addDays, type AchievementCriteria } from '@rpg/engine';
import type { DbOrTx } from '../db/client';
import {
  achievements,
  activityTypes,
  attributes,
  categories,
  characterProgress,
  exercises,
  gameConfigs,
  items,
  knowledgeAreas,
  levelRewards,
  missionTemplates,
  penaltyRules,
  ranks,
  seasons,
  skills,
  studySubjects,
  userSettings,
  wallets,
} from '../db/schema';

export const DEFAULT_WIDGETS = [
  'character',
  'alerts',
  'today',
  'habits',
  'weekly',
  'radar',
  'xp_chart',
  'effort',
  'goals',
  'streaks',
  'season',
  'recent',
  'achievements',
  'records',
].map((id) => ({ id, visible: true }));

const ATTRIBUTES = [
  { code: 'FOR', name: 'Força', category: 'Físico', color: '#a33b3b', icon: 'dumbbell', description: 'Capacidade de gerar força. Evolui com treinos de musculação registrados.', progressionCriteria: 'Sessões de musculação (duração e intensidade).' },
  { code: 'RES', name: 'Resistência', category: 'Físico', color: '#3b6fa3', icon: 'footprints', description: 'Capacidade aeróbica e de sustentar esforço. Evolui com corrida, caminhada e ciclismo.', progressionCriteria: 'Duração e distância de atividades aeróbicas.' },
  { code: 'VIT', name: 'Vitalidade', category: 'Físico', color: '#3f8f5a', icon: 'heart-pulse', description: 'Saúde e recuperação: mobilidade, cuidados e hábitos de saúde.', progressionCriteria: 'Mobilidade, hábitos de saúde e caminhadas.' },
  { code: 'INT', name: 'Intelecto', category: 'Mental', color: '#6b5bd7', icon: 'brain', description: 'Aprendizado registrado. O domínio por disciplina fica na maestria, não neste atributo.', progressionCriteria: 'Sessões de estudo, conteúdos concluídos e avaliações.' },
  { code: 'DIS', name: 'Disciplina', category: 'Conduta', color: '#c9a84c', icon: 'flame', description: 'Cumprimento de hábitos e rotinas previamente definidos.', progressionCriteria: 'Hábitos cumpridos no dia programado.' },
  { code: 'ORG', name: 'Organização', category: 'Conduta', color: '#8a7f6a', icon: 'list-checks', description: 'Planejamento, revisão de metas e organização do ambiente e das finanças.', progressionCriteria: 'Hábitos e missões de planejamento e organização.' },
  { code: 'EXE', name: 'Execução', category: 'Realização', color: '#c06a2b', icon: 'hammer', description: 'Capacidade de entregar: missões, projetos e metas concluídos.', progressionCriteria: 'Missões e metas concluídas, ponderadas por dificuldade.' },
  { code: 'END', name: 'Fortaleza mental', category: 'Realização', color: '#7a2d4a', icon: 'skull', description: 'Persistência diante do difícil (o "END" do protótipo original).', progressionCriteria: 'Missões Difíceis ou superiores e treinos longos.' },
];

const CATEGORIES = [
  { name: 'Saúde e corpo', color: '#a33b3b', icon: 'heart-pulse' },
  { name: 'Estudos', color: '#6b5bd7', icon: 'book-open' },
  { name: 'Trabalho', color: '#c06a2b', icon: 'briefcase' },
  { name: 'Projetos', color: '#c9a84c', icon: 'hammer' },
  { name: 'Casa e organização', color: '#8a7f6a', icon: 'home' },
  { name: 'Finanças', color: '#3f8f5a', icon: 'wallet' },
  { name: 'Mente e espírito', color: '#7a2d4a', icon: 'sparkles' },
  { name: 'Social', color: '#3b6fa3', icon: 'users' },
  { name: 'Necessidades básicas', color: '#5f6b73', icon: 'bed', isBasicNeed: true, description: 'Sono, alimentação e descanso: podem ser registrados, mas nunca geram penalidade.' },
];

const SKILL_TREE: Array<{ attr: string; name: string; icon: string; children: string[] }> = [
  { attr: 'FOR', name: 'Treinamento de força', icon: 'dumbbell', children: ['Força máxima', 'Técnica', 'Resistência muscular'] },
  { attr: 'RES', name: 'Condicionamento', icon: 'footprints', children: ['Corrida', 'Capacidade aeróbica', 'Ciclismo'] },
  { attr: 'VIT', name: 'Recuperação', icon: 'heart-pulse', children: ['Mobilidade', 'Cuidados com a saúde'] },
  { attr: 'INT', name: 'Conhecimento', icon: 'book-open', children: ['Economia', 'História', 'Tecnologia'] },
  { attr: 'DIS', name: 'Autodomínio', icon: 'flame', children: ['Hábitos', 'Rotina'] },
  { attr: 'ORG', name: 'Planejamento', icon: 'list-checks', children: ['Organização pessoal', 'Finanças pessoais'] },
  { attr: 'EXE', name: 'Projetos', icon: 'hammer', children: ['Planejamento de projetos', 'Desenvolvimento', 'Conclusão'] },
  { attr: 'END', name: 'Superação', icon: 'skull', children: ['Desafios difíceis', 'Provas de resistência'] },
];

const ach = (
  key: string,
  name: string,
  description: string,
  category: string,
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic',
  criteria: AchievementCriteria['all'],
  rewardXp: number,
  rewardCoins: number,
  icon = 'trophy',
  secret = false,
) => ({ key, name, description, category, rarity, criteria: { all: criteria }, rewardXp, rewardCoins, icon, secret });

const ACHIEVEMENTS = [
  ach('first_mission', 'Primeiro passo', 'Conclua sua primeira missão.', 'Projetos', 'common', [{ metric: 'missions_completed', gte: 1 }], 20, 10, 'flag'),
  ach('missions_25', 'Aventureiro', 'Conclua 25 missões.', 'Projetos', 'uncommon', [{ metric: 'missions_completed', gte: 25 }], 100, 40, 'map'),
  ach('missions_100', 'Veterano das missões', 'Conclua 100 missões.', 'Projetos', 'rare', [{ metric: 'missions_completed', gte: 100 }], 300, 100, 'map'),
  ach('missions_500', 'Lenda da guilda', 'Conclua 500 missões.', 'Projetos', 'legendary', [{ metric: 'missions_completed', gte: 500 }], 1500, 400, 'crown'),
  ach('hard_10', 'Forjado no difícil', 'Conclua 10 missões Difíceis ou superiores.', 'Desafios épicos', 'rare', [{ metric: 'missions_completed_hard_plus', gte: 10 }], 250, 80, 'swords'),
  ach('epic_1', 'Feito épico', 'Conclua uma missão Épica ou Lendária.', 'Desafios épicos', 'epic', [{ metric: 'missions_completed_epic_plus', gte: 1 }], 400, 120, 'swords'),
  ach('streak_7', 'Primeira semana consistente', 'Mantenha um hábito por 7 ocorrências seguidas.', 'Consistência', 'common', [{ metric: 'best_habit_streak', gte: 7 }], 50, 20, 'flame'),
  ach('streak_30', 'Chama constante', 'Mantenha um hábito por 30 ocorrências seguidas.', 'Consistência', 'rare', [{ metric: 'best_habit_streak', gte: 30 }], 200, 70, 'flame'),
  ach('streak_100', 'Inabalável', 'Mantenha um hábito por 100 ocorrências seguidas.', 'Consistência', 'epic', [{ metric: 'best_habit_streak', gte: 100 }], 700, 200, 'flame'),
  ach('habits_100', 'Cem rituais', 'Cumpra 100 hábitos.', 'Consistência', 'uncommon', [{ metric: 'habit_checkins', gte: 100 }], 120, 40, 'check-circle'),
  ach('habits_1000', 'Mil rituais', 'Cumpra 1.000 hábitos.', 'Consistência', 'legendary', [{ metric: 'habit_checkins', gte: 1000 }], 1200, 300, 'check-circle'),
  ach('perfect_week', 'Semana perfeita', 'Cumpra todos os hábitos programados de uma semana.', 'Consistência', 'uncommon', [{ metric: 'perfect_weeks', gte: 1 }], 100, 30, 'calendar-check'),
  ach('perfect_weeks_10', 'Ordem absoluta', 'Complete 10 semanas perfeitas.', 'Organização', 'epic', [{ metric: 'perfect_weeks', gte: 10 }], 600, 150, 'calendar-check'),
  ach('study_first', 'Primeiro pergaminho', 'Registre sua primeira sessão de estudo.', 'Estudos', 'common', [{ metric: 'study_sessions', gte: 1 }], 20, 10, 'scroll'),
  ach('study_100', 'Cem sessões de estudo', 'Registre 100 sessões de estudo.', 'Estudos', 'rare', [{ metric: 'study_sessions', gte: 100 }], 300, 100, 'library'),
  ach('study_100h', 'Cem horas de estudo', 'Acumule 6.000 minutos de estudo.', 'Conhecimento', 'epic', [{ metric: 'study_minutes', gte: 6000 }], 500, 150, 'hourglass'),
  ach('assessments_5', 'Conhecimento demonstrado', 'Seja aprovado (≥ 70%) em 5 avaliações.', 'Conhecimento', 'rare', [{ metric: 'assessments_passed', gte: 5 }], 250, 80, 'graduation-cap'),
  ach('training_first', 'Primeiro treino', 'Registre seu primeiro treino.', 'Força', 'common', [{ metric: 'training_sessions', gte: 1 }], 20, 10, 'dumbbell'),
  ach('strength_50', 'Ferro e disciplina', 'Registre 50 sessões de musculação.', 'Força', 'rare', [{ metric: 'strength_sessions', gte: 50 }], 300, 100, 'dumbbell'),
  ach('training_200', 'Corpo forjado', 'Registre 200 treinos.', 'Força', 'epic', [{ metric: 'training_sessions', gte: 200 }], 700, 200, 'shield'),
  ach('run_half', 'Meia maratona', 'Complete uma corrida de 21,1 km.', 'Resistência', 'epic', [{ metric: 'longest_run_km', gte: 21.1 }], 500, 150, 'footprints'),
  ach('run_marathon', 'Operação 42K', 'Complete uma maratona (42,2 km).', 'Resistência', 'legendary', [{ metric: 'longest_run_km', gte: 42.2 }], 1500, 400, 'medal'),
  ach('run_500', 'Quinhentos quilômetros', 'Acumule 500 km de corrida.', 'Resistência', 'rare', [{ metric: 'run_distance_km', gte: 500 }], 400, 120, 'route'),
  ach('run_1250', 'O chefe caiu', 'Acumule 1.250 km de corrida (o "HP do Boss" do protótipo).', 'Resistência', 'legendary', [{ metric: 'run_distance_km', gte: 1250 }], 1200, 350, 'skull'),
  ach('prs_10', 'Superando a si mesmo', 'Estabeleça 10 recordes pessoais.', 'Força', 'uncommon', [{ metric: 'personal_records', gte: 10 }], 150, 50, 'trending-up'),
  ach('level_10', 'Soldado', 'Alcance o nível 10.', 'Marcos de nível', 'uncommon', [{ metric: 'character_level', gte: 10 }], 0, 50, 'chevrons-up'),
  ach('level_30', 'Veterano', 'Alcance o nível 30.', 'Marcos de nível', 'rare', [{ metric: 'character_level', gte: 30 }], 0, 200, 'chevrons-up'),
  ach('level_60', 'Mestre', 'Alcance o nível 60.', 'Marcos de nível', 'epic', [{ metric: 'character_level', gte: 60 }], 0, 500, 'crown'),
  ach('level_100', 'Além dos Mortais', 'Alcance o nível 100. Exige anos de consistência.', 'Marcos de nível', 'mythic', [{ metric: 'character_level', gte: 100 }], 0, 2000, 'crown'),
  ach('attr_15', 'Especialista', 'Leve um atributo ao nível 15.', 'Marcos de nível', 'rare', [{ metric: 'attribute_max_level', gte: 15 }], 200, 60, 'star'),
  ach('skills_3x5', 'Versátil', 'Leve 3 habilidades ao nível 5.', 'Conhecimento', 'rare', [{ metric: 'skills_level5', gte: 3 }], 250, 80, 'git-branch'),
  ach('goal_first', 'Objetivo cumprido', 'Conclua sua primeira meta.', 'Projetos', 'uncommon', [{ metric: 'goals_completed', gte: 1 }], 100, 40, 'target'),
  ach('goals_10', 'Arquiteto do destino', 'Conclua 10 metas.', 'Projetos', 'epic', [{ metric: 'goals_completed', gte: 10 }], 600, 180, 'target'),
  ach('coins_1000', 'Tesoureiro', 'Receba 1.000 moedas no total.', 'Economia virtual', 'uncommon', [{ metric: 'coins_earned', gte: 1000 }], 80, 0, 'coins'),
  ach('first_purchase', 'Primeira recompensa', 'Compre seu primeiro item na loja.', 'Economia virtual', 'common', [{ metric: 'purchases', gte: 1 }], 20, 0, 'shopping-bag'),
  ach('season_first', 'Fim de uma era', 'Conclua sua primeira temporada.', 'Desafios épicos', 'rare', [{ metric: 'seasons_completed', gte: 1 }], 300, 100, 'hourglass'),
  ach('explorer', 'Explorador do reino', 'Visite 10 áreas diferentes do aplicativo.', 'Exploração do aplicativo', 'common', [{ metric: 'distinct_pages_visited', gte: 10 }], 30, 15, 'compass', true),
];

/**
 * Cria o conteúdo inicial editável de um usuário: configuração, atributos, árvore de habilidades,
 * categorias, regras de penalidade, loja, conquistas, ranks, marcos de nível e uma temporada.
 * Nada aqui é "dado de atividade": não há XP, missões concluídas ou histórico falso.
 */
export async function seedUserDefaults(tx: DbOrTx, userId: string, today: string): Promise<void> {
  await tx.insert(userSettings).values({ userId, dashboardWidgets: { widgets: DEFAULT_WIDGETS, periodDays: 30 } }).onConflictDoNothing();
  await tx.insert(characterProgress).values({ userId }).onConflictDoNothing();
  await tx.insert(wallets).values({ userId }).onConflictDoNothing();
  await tx.insert(gameConfigs).values({ userId, version: 1, config: DEFAULT_GAME_CONFIG, active: true, note: 'Configuração inicial calibrada' });
  await tx.insert(ranks).values(DEFAULT_RANKS.map((r) => ({ ...r, userId })));

  const cats = await tx
    .insert(categories)
    .values(CATEGORIES.map((c, i) => ({ userId, sortOrder: i, isBasicNeed: false, ...c })))
    .returning();
  const catId = (name: string) => cats.find((c) => c.name === name)!.id;

  const attrs = await tx
    .insert(attributes)
    .values(ATTRIBUTES.map((a, i) => ({ ...a, userId, sortOrder: i })))
    .returning();
  const attrId = (code: string) => attrs.find((a) => a.code === code)!.id;

  const skillIds: Record<string, string> = {};
  for (const [i, branch] of SKILL_TREE.entries()) {
    const [root] = await tx
      .insert(skills)
      .values({ userId, attributeId: attrId(branch.attr), name: branch.name, icon: branch.icon, sortOrder: i })
      .returning();
    skillIds[branch.name] = root!.id;
    const children = await tx
      .insert(skills)
      .values(branch.children.map((name, j) => ({ userId, attributeId: attrId(branch.attr), parentId: root!.id, name, icon: branch.icon, sortOrder: j })))
      .returning();
    for (const c of children) skillIds[c.name] = c.id;
  }

  const [social, tech] = await tx
    .insert(knowledgeAreas)
    .values([
      { userId, name: 'Ciências sociais', description: 'Economia, História e áreas afins.', color: '#c9a84c' },
      { userId, name: 'Tecnologia', description: 'Programação, sistemas e computação.', color: '#3b6fa3' },
    ])
    .returning();
  await tx.insert(studySubjects).values([
    { userId, areaId: social!.id, skillId: skillIds['Economia']!, name: 'Economia', color: '#c9a84c' },
    { userId, areaId: social!.id, skillId: skillIds['História']!, name: 'História', color: '#a37b3b' },
    { userId, areaId: tech!.id, skillId: skillIds['Tecnologia']!, name: 'Tecnologia', color: '#3b6fa3' },
  ]);

  await tx.insert(activityTypes).values([
    { userId, name: 'Musculação', category: 'strength', icon: 'dumbbell', skillId: skillIds['Técnica']!, intensity: 1, attributeWeights: { FOR: 0.7, DIS: 0.15, END: 0.15 } },
    { userId, name: 'Corrida', category: 'run', icon: 'footprints', skillId: skillIds['Corrida']!, intensity: 1.1, attributeWeights: { RES: 0.7, VIT: 0.1, END: 0.2 } },
    { userId, name: 'Caminhada', category: 'walk', icon: 'footprints', skillId: skillIds['Capacidade aeróbica']!, intensity: 0.7, attributeWeights: { RES: 0.5, VIT: 0.5 } },
    { userId, name: 'Ciclismo', category: 'cycle', icon: 'bike', skillId: skillIds['Ciclismo']!, intensity: 1, attributeWeights: { RES: 0.7, VIT: 0.3 } },
    { userId, name: 'Mobilidade', category: 'mobility', icon: 'stretch-horizontal', skillId: skillIds['Mobilidade']!, intensity: 0.6, attributeWeights: { VIT: 1 } },
  ]);
  await tx.insert(exercises).values(
    [
      ['Supino reto', 'Peito'],
      ['Agachamento livre', 'Pernas'],
      ['Levantamento terra', 'Posterior'],
      ['Barra fixa', 'Costas'],
      ['Desenvolvimento', 'Ombros'],
      ['Remada curvada', 'Costas'],
    ].map(([name, muscleGroup]) => ({ userId, name: name!, muscleGroup: muscleGroup! })),
  );

  await tx.insert(penaltyRules).values([
    { userId, name: 'Registro de falha', type: 'failure_record', description: 'Apenas registra a falha no histórico. Recomendado como padrão.' },
    { userId, name: 'Multa leve', type: 'coin_loss', baseAmount: 5, escalationStep: 5, maxAmount: 20, description: '5 moedas na 1ª falha, +5 por falha consecutiva, no máximo 20.' },
    { userId, name: 'Multa de missão crítica', type: 'coin_loss', baseAmount: 15, escalationStep: 10, maxAmount: 40, description: 'Para missões com prazo crítico.' },
    { userId, name: 'Freio de consistência', type: 'multiplier_reduction', reductionPct: 0.05, durationDays: 3, baseAmount: 3, maxAmount: 3, description: 'Reduz o multiplicador de consistência em 5% por 3 dias.' },
    { userId, name: 'Sem tolerância', type: 'streak_reset', description: 'A falha quebra a sequência mesmo havendo tolerância.' },
  ]);

  const shop = await tx
    .insert(items)
    .values([
      { userId, name: '1 hora de lazer livre', kind: 'real_reward', category: 'Lazer', price: 60, icon: 'gamepad-2', description: 'Uma hora reservada para lazer sem culpa.' },
      { userId, name: 'Episódio de série', kind: 'real_reward', category: 'Lazer', price: 40, icon: 'tv' },
      { userId, name: 'Sessão de cinema em casa', kind: 'real_reward', category: 'Lazer', price: 250, icon: 'clapperboard', cooldownDays: 3 },
      { userId, name: 'Refeição especial', kind: 'real_reward', category: 'Recompensas pessoais', price: 300, icon: 'utensils', cooldownDays: 7 },
      { userId, name: 'Compra planejada (pequena)', kind: 'real_reward', category: 'Recompensas especiais', price: 1000, icon: 'shopping-bag', rarity: 'rare', cooldownDays: 14 },
      { userId, name: 'Experiência especial', kind: 'real_reward', category: 'Recompensas especiais', price: 3000, icon: 'tent', rarity: 'epic', minLevel: 10 },
      { userId, name: 'Item físico desejado', kind: 'real_reward', category: 'Recompensas especiais', price: 5000, icon: 'gift', rarity: 'legendary', minLevel: 15 },
      { userId, name: 'Fragmento rúnico', kind: 'collectible', category: 'Itens colecionáveis', price: 150, icon: 'gem', rarity: 'uncommon', purchaseLimit: 12 },
      { userId, name: 'Moldura de bronze', kind: 'frame', category: 'Molduras', price: 300, icon: 'square', rarity: 'uncommon', payload: { color: '#b87333' } },
      { userId, name: 'Moldura de prata', kind: 'frame', category: 'Molduras', price: 900, icon: 'square', rarity: 'rare', minLevel: 15, payload: { color: '#c0c0c0' } },
      { userId, name: 'Aura dourada', kind: 'effect', category: 'Efeitos visuais', price: 600, icon: 'sun', rarity: 'rare', minLevel: 10, payload: { effect: 'aura-gold' } },
      { userId, name: 'Título: O Persistente', kind: 'title', category: 'Títulos', price: 400, icon: 'scroll', rarity: 'uncommon', minLevel: 5, payload: { title: 'O Persistente' } },
      { userId, name: 'Insígnia do Corredor', kind: 'badge', category: 'Insígnias', price: 500, icon: 'footprints', rarity: 'rare', payload: { badge: 'runner' } },
    ])
    .returning();
  void shop;

  const rankTitles = await tx
    .insert(items)
    .values(
      DEFAULT_RANKS.filter((r) => r.minLevel > 1).map((r, i) => ({
        userId,
        name: `Título: ${r.name}`,
        kind: 'title' as const,
        category: 'Títulos',
        price: null,
        icon: 'crown',
        rarity: (['common', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'legendary', 'mythic'] as const)[i] ?? 'rare',
        description: `Concedido ao alcançar o rank ${r.code} (nível ${r.minLevel}).`,
        payload: { title: r.name, rank: r.code },
      })),
    )
    .returning();
  await tx.insert(levelRewards).values(
    DEFAULT_RANKS.filter((r) => r.minLevel > 1).map((r, i) => ({
      userId,
      level: r.minLevel,
      description: `Rank ${r.code} — ${r.name}`,
      itemId: rankTitles[i]!.id,
      coins: r.minLevel * 10,
    })),
  );

  await tx.insert(achievements).values(ACHIEVEMENTS.map((a, i) => ({ ...a, userId, sortOrder: i })));

  await tx.insert(missionTemplates).values([
    {
      userId,
      title: 'Semana de desenvolvimento',
      description: 'Missão composta semanal: estudos, treinos e hábitos essenciais. Conclui automaticamente.',
      type: 'weekly',
      difficulty: 'hard',
      categoryId: catId('Projetos'),
      recurrence: 'weekly',
      durationDays: 7,
      attributeWeights: { DIS: 0.4, EXE: 0.3, END: 0.3 },
      objectives: [
        { title: 'Estudar 5 horas', metric: 'study_minutes', target: 300, unit: 'min' },
        { title: 'Treinar 3 vezes', metric: 'training_sessions', target: 3, unit: 'sessões' },
        { title: 'Cumprir 20 hábitos', metric: 'habit_checkins', target: 20, unit: 'hábitos' },
      ],
      active: true,
    },
    {
      userId,
      title: 'Revisão semanal',
      description: 'Revisar metas, agenda e prioridades da próxima semana.',
      type: 'weekly',
      difficulty: 'easy',
      categoryId: catId('Casa e organização'),
      recurrence: 'weekly',
      durationDays: 7,
      attributeWeights: { ORG: 1 },
      active: false,
    },
    {
      userId,
      title: 'Revisão mensal de metas',
      description: 'Avaliar progresso das metas de longo prazo e ajustar o plano.',
      type: 'monthly',
      difficulty: 'moderate',
      categoryId: catId('Projetos'),
      recurrence: 'monthly',
      durationDays: 30,
      attributeWeights: { ORG: 0.6, EXE: 0.4 },
      active: false,
    },
  ]);

  await tx.insert(seasons).values({
    userId,
    name: 'Temporada I — O Despertar',
    description: 'Primeira temporada: estabeleça a fundação de hábitos, estudos e treinos.',
    theme: 'medieval',
    startDate: today,
    endDate: addDays(today, 89),
    status: 'active',
  });
}
