/**
 * Cadastros de definição do jogo (todos editáveis pelo usuário): categorias, atributos,
 * habilidades, ranks, marcos de nível, regras de penalidade, modelos de missão e indisponibilidade.
 */
import type {
  AttributeInput,
  CategoryInput,
  LevelRewardInput,
  PenaltyRuleInput,
  RankInput,
  SkillInput,
  TemplateInput,
  UnavailabilityInput,
} from '@rpg/contracts';
import { levelFromXp } from '@rpg/engine';
import { formLookups } from '../../persistence/queries/lookups';
import { findSkill } from '../../persistence/repositories/progression';
import type { DbOrTx } from '../../persistence/unit-of-work';
import { badRequest, unprocessable } from '../../shared/errors';
import { getActiveConfig } from '../config';
import { crudService } from '../crud';
import { assertOwned, validatePenaltyRules, validateWeights } from '../validation';

export const categoriesCrud = crudService<CategoryInput>({
  resource: 'categories',
  entity: 'categories',
  label: 'Categoria',
  orderBy: [{ field: 'sortOrder' }, { field: 'name' }],
});

export const attributesCrud = crudService<AttributeInput>({
  resource: 'attributes',
  entity: 'attributes',
  label: 'Atributo',
  immutable: ['code'],
  orderBy: [{ field: 'sortOrder' }],
  // XP e nível são projeções do livro-razão: nunca editáveis por formulário.
  prepare: async (_tx, _userId, data) => ({ ...data }),
  decorate: async (db, userId, rows) => {
    const { config } = await getActiveConfig(db, userId);
    return rows.map((a) => {
      const s = levelFromXp(a.xp, config.curves.attribute);
      return { ...a, progress: s.progress, xpToNext: s.xpToNextLevel, xpForNext: s.xpForNextLevel };
    });
  },
});

export const skillsCrud = crudService<SkillInput>({
  resource: 'skills',
  entity: 'skills',
  label: 'Habilidade',
  orderBy: [{ field: 'sortOrder' }, { field: 'name' }],
  prepare: async (tx, userId, data, existing) => {
    await assertOwned(tx, 'attributes', data.attributeId, userId, 'Atributo');
    await assertOwned(tx, 'skills', data.parentId, userId, 'Habilidade-mãe');
    if (existing && data.parentId === existing.id) throw badRequest('Uma habilidade não pode ser mãe de si mesma.');
    // Evita ciclos na árvore.
    let cursor = data.parentId ?? null;
    for (let i = 0; cursor && i < 50; i++) {
      if (existing && cursor === existing.id) throw badRequest('Ciclo na árvore de habilidades.');
      cursor = (await findSkill(tx, cursor))?.parentId ?? null;
    }
    return { ...data };
  },
  decorate: async (db, userId, rows) => {
    const { config } = await getActiveConfig(db, userId);
    return rows.map((s) => {
      const st = levelFromXp(s.xp, config.curves.mastery);
      return { ...s, progress: st.progress, xpToNext: st.xpToNextLevel };
    });
  },
});

export const ranksCrud = crudService<RankInput>({
  resource: 'ranks',
  entity: 'ranks',
  label: 'Rank',
  orderBy: [{ field: 'minLevel' }],
});

export const levelRewardsCrud = crudService<LevelRewardInput>({
  resource: 'levelRewards',
  entity: 'level_rewards',
  label: 'Marco de nível',
  orderBy: [{ field: 'level' }],
  prepare: async (tx, userId, data) => {
    await assertOwned(tx, 'items', data.itemId, userId, 'Item');
    return { ...data };
  },
});

export const penaltyRulesCrud = crudService<PenaltyRuleInput>({
  resource: 'penaltyRules',
  entity: 'penalty_rules',
  label: 'Regra de penalidade',
  orderBy: [{ field: 'name' }],
  prepare: async (tx, userId, data) => {
    if (data.maxAmount < data.baseAmount) throw unprocessable('O teto deve ser maior ou igual ao valor base.');
    if (data.type === 'reward_lock' && !data.targetItemId) throw unprocessable('Selecione a recompensa a bloquear.');
    if (data.type === 'skill_xp_loss' && !data.targetSkillId) throw unprocessable('Selecione a habilidade afetada.');
    await assertOwned(tx, 'items', data.targetItemId, userId, 'Item');
    await assertOwned(tx, 'skills', data.targetSkillId, userId, 'Habilidade');
    return { ...data };
  },
});

export const missionTemplatesCrud = crudService<TemplateInput>({
  resource: 'missionTemplates',
  entity: 'mission_templates',
  label: 'Modelo de missão',
  orderBy: [{ field: 'title' }],
  prepare: async (tx, userId, data) => {
    await assertOwned(tx, 'categories', data.categoryId, userId, 'Categoria');
    const weights = await validateWeights(tx, userId, data.attributeWeights);
    await validatePenaltyRules(tx, userId, data.penaltyRuleIds);
    return { ...data, attributeWeights: weights };
  },
});

export const unavailabilityCrud = crudService<UnavailabilityInput>({
  resource: 'unavailability',
  entity: 'unavailability',
  label: 'Indisponibilidade',
  orderBy: [{ field: 'startDate' }],
  prepare: async (tx, userId, data) => {
    if (data.endDate < data.startDate) throw badRequest('A data final deve ser posterior à inicial.');
    await assertOwned(tx, 'categories', data.categoryId, userId, 'Categoria');
    return { ...data };
  },
});

/** Relações auxiliares para formulários (seletores). */
export function lookups(db: DbOrTx, userId: string) {
  return formLookups(db, userId);
}
