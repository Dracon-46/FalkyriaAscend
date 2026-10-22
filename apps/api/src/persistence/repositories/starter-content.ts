/**
 * Gravação do conteúdo inicial editável de um usuário. O conteúdo é declarativo (definido na
 * aplicação) e referencia outros registros pelo nome; aqui as referências viram ids.
 */
import type { DbOrTx } from '../client';
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
} from '../schema';

type Insert<T extends { $inferInsert: unknown }> = Omit<T['$inferInsert'], 'userId' | 'id'>;

export interface StarterContent {
  dashboardWidgets: { widgets: Array<{ id: string; visible: boolean }>; periodDays: number };
  gameConfig: unknown;
  ranks: Array<Insert<typeof ranks>>;
  categories: Array<Insert<typeof categories>>;
  attributes: Array<Insert<typeof attributes>>;
  /** Ramos da árvore de habilidades: o atributo é indicado pelo código. */
  skillTree: Array<{ attributeCode: string; name: string; icon: string; children: string[] }>;
  knowledgeAreas: Array<Insert<typeof knowledgeAreas>>;
  /** Disciplinas: área e habilidade de maestria indicadas pelo nome. */
  subjects: Array<Omit<Insert<typeof studySubjects>, 'areaId' | 'skillId'> & { area: string; skill: string }>;
  /** Tipos de atividade: habilidade indicada pelo nome. */
  activityTypes: Array<Omit<Insert<typeof activityTypes>, 'skillId'> & { skill: string }>;
  exercises: Array<Insert<typeof exercises>>;
  penaltyRules: Array<Insert<typeof penaltyRules>>;
  shopItems: Array<Insert<typeof items>>;
  /** Títulos concedidos por marcos de nível (não vendidos na loja). */
  levelMilestones: Array<{ level: number; description: string; coins: number; title: Insert<typeof items> }>;
  achievements: Array<Insert<typeof achievements>>;
  /** Modelos de missão: categoria indicada pelo nome. */
  missionTemplates: Array<Omit<Insert<typeof missionTemplates>, 'categoryId'> & { category: string }>;
  season: Insert<typeof seasons>;
}

const byName =
  <T extends { name: string; id: string }>(rows: T[], what: string) =>
  (name: string) => {
    const row = rows.find((r) => r.name === name);
    if (!row) throw new Error(`Conteúdo inicial: ${what} "${name}" não encontrado(a)`);
    return row.id;
  };

export async function insertStarterContent(tx: DbOrTx, userId: string, c: StarterContent): Promise<void> {
  await tx.insert(userSettings).values({ userId, dashboardWidgets: c.dashboardWidgets }).onConflictDoNothing();
  await tx.insert(characterProgress).values({ userId }).onConflictDoNothing();
  await tx.insert(wallets).values({ userId }).onConflictDoNothing();
  await tx.insert(gameConfigs).values({ userId, version: 1, config: c.gameConfig, active: true, note: 'Configuração inicial calibrada' });
  await tx.insert(ranks).values(c.ranks.map((r) => ({ ...r, userId })));

  const cats = await tx
    .insert(categories)
    .values(c.categories.map((x) => ({ ...x, userId })))
    .returning();
  const categoryId = byName(cats, 'categoria');

  const attrs = await tx
    .insert(attributes)
    .values(c.attributes.map((x) => ({ ...x, userId })))
    .returning();
  const attributeId = (code: string) => attrs.find((a) => a.code === code)!.id;

  const skillRows: Array<{ id: string; name: string }> = [];
  for (const [i, branch] of c.skillTree.entries()) {
    const [root] = await tx
      .insert(skills)
      .values({ userId, attributeId: attributeId(branch.attributeCode), name: branch.name, icon: branch.icon, sortOrder: i })
      .returning();
    skillRows.push(root!);
    const children = await tx
      .insert(skills)
      .values(
        branch.children.map((name, j) => ({
          userId,
          attributeId: attributeId(branch.attributeCode),
          parentId: root!.id,
          name,
          icon: branch.icon,
          sortOrder: j,
        })),
      )
      .returning();
    skillRows.push(...children);
  }
  const skillId = byName(skillRows, 'habilidade');

  const areas = await tx
    .insert(knowledgeAreas)
    .values(c.knowledgeAreas.map((x) => ({ ...x, userId })))
    .returning();
  const areaId = byName(areas, 'área');
  await tx.insert(studySubjects).values(c.subjects.map(({ area, skill, ...x }) => ({ ...x, userId, areaId: areaId(area), skillId: skillId(skill) })));

  await tx.insert(activityTypes).values(c.activityTypes.map(({ skill, ...x }) => ({ ...x, userId, skillId: skillId(skill) })));
  await tx.insert(exercises).values(c.exercises.map((x) => ({ ...x, userId })));
  await tx.insert(penaltyRules).values(c.penaltyRules.map((x) => ({ ...x, userId })));
  await tx.insert(items).values(c.shopItems.map((x) => ({ ...x, userId })));

  const titles = await tx
    .insert(items)
    .values(c.levelMilestones.map((m) => ({ ...m.title, userId })))
    .returning();
  await tx
    .insert(levelRewards)
    .values(c.levelMilestones.map((m, i) => ({ userId, level: m.level, description: m.description, coins: m.coins, itemId: titles[i]!.id })));

  await tx.insert(achievements).values(c.achievements.map((x) => ({ ...x, userId })));
  await tx.insert(missionTemplates).values(c.missionTemplates.map(({ category, ...x }) => ({ ...x, userId, categoryId: categoryId(category) })));
  await tx.insert(seasons).values({ ...c.season, userId });
}
