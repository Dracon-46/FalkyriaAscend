import type { FastifyInstance } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  attributeInput,
  categoryInput,
  penaltyRuleInput,
  skillInput,
  templateInput,
  unavailabilityInput,
} from '@rpg/contracts';
import { levelFromXp } from '@rpg/engine';
import { attributes, categories, items, levelRewards, missionTemplates, penaltyRules, ranks, skills, unavailability } from '../db/schema';
import { badRequest, unprocessable } from '../lib/errors';
import { requireUser } from '../lib/http';
import { getActiveConfig } from '../services/config';
import { assertOwned, validatePenaltyRules, validateWeights } from '../services/validation';
import { registerCrud } from './crud';
import type { AppContext } from '../context';

const rankInput = z.object({
  minLevel: z.number().int().min(1).max(999),
  code: z.string().trim().min(1).max(4),
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
});
const levelRewardInput = z.object({
  level: z.number().int().min(2).max(999),
  description: z.string().trim().min(1).max(200),
  itemId: z.uuid().nullish(),
  coins: z.number().int().min(0).max(100_000).default(0),
});

export async function registerDefinitionRoutes(app: FastifyInstance, ctx: AppContext) {
  registerCrud(app, ctx, {
    path: '/api/categories',
    table: categories,
    entity: 'categories',
    label: 'Categoria',
    input: categoryInput,
    orderBy: (t) => [asc(t.sortOrder), asc(t.name)],
  });

  registerCrud(app, ctx, {
    path: '/api/attributes',
    table: attributes,
    entity: 'attributes',
    label: 'Atributo',
    input: attributeInput,
    immutable: ['code'],
    orderBy: (t) => [asc(t.sortOrder)],
    // XP e nível são projeções do livro-razão: nunca editáveis por formulário.
    prepare: async (_tx, _u, data) => ({ ...data }),
    decorate: async (db, userId, rows) => {
      const { config } = await getActiveConfig(db, userId);
      return rows.map((a) => {
        const s = levelFromXp(a.xp, config.curves.attribute);
        return { ...a, progress: s.progress, xpToNext: s.xpToNextLevel, xpForNext: s.xpForNextLevel };
      });
    },
  });

  registerCrud(app, ctx, {
    path: '/api/skills',
    table: skills,
    entity: 'skills',
    label: 'Habilidade',
    input: skillInput,
    orderBy: (t) => [asc(t.sortOrder), asc(t.name)],
    prepare: async (tx, userId, data, existing) => {
      await assertOwned(tx, attributes, data.attributeId, userId, 'Atributo');
      await assertOwned(tx, skills, data.parentId, userId, 'Habilidade-mãe');
      if (existing && data.parentId === existing.id) throw badRequest('Uma habilidade não pode ser mãe de si mesma.');
      // Evita ciclos na árvore.
      let cursor = data.parentId ?? null;
      for (let i = 0; cursor && i < 50; i++) {
        if (existing && cursor === existing.id) throw badRequest('Ciclo na árvore de habilidades.');
        const [p] = await tx.select({ parentId: skills.parentId }).from(skills).where(eq(skills.id, cursor));
        cursor = p?.parentId ?? null;
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

  registerCrud(app, ctx, {
    path: '/api/ranks',
    table: ranks,
    entity: 'ranks',
    label: 'Rank',
    input: rankInput,
    adminWrite: true,
    orderBy: (t) => [asc(t.minLevel)],
  });

  registerCrud(app, ctx, {
    path: '/api/level-rewards',
    table: levelRewards,
    entity: 'level_rewards',
    label: 'Marco de nível',
    input: levelRewardInput,
    adminWrite: true,
    orderBy: (t) => [asc(t.level)],
    prepare: async (tx, userId, data) => {
      await assertOwned(tx, items, data.itemId, userId, 'Item');
      return { ...data };
    },
  });

  registerCrud(app, ctx, {
    path: '/api/penalty-rules',
    table: penaltyRules,
    entity: 'penalty_rules',
    label: 'Regra de penalidade',
    input: penaltyRuleInput,
    orderBy: (t) => [asc(t.name)],
    prepare: async (tx, userId, data) => {
      if (data.maxAmount < data.baseAmount) throw unprocessable('O teto deve ser maior ou igual ao valor base.');
      if (data.type === 'reward_lock' && !data.targetItemId) throw unprocessable('Selecione a recompensa a bloquear.');
      if (data.type === 'skill_xp_loss' && !data.targetSkillId) throw unprocessable('Selecione a habilidade afetada.');
      await assertOwned(tx, items, data.targetItemId, userId, 'Item');
      await assertOwned(tx, skills, data.targetSkillId, userId, 'Habilidade');
      return { ...data };
    },
  });

  registerCrud(app, ctx, {
    path: '/api/mission-templates',
    table: missionTemplates,
    entity: 'mission_templates',
    label: 'Modelo de missão',
    input: templateInput,
    orderBy: (t) => [asc(t.title)],
    prepare: async (tx, userId, data) => {
      await assertOwned(tx, categories, data.categoryId, userId, 'Categoria');
      const weights = await validateWeights(tx, userId, data.attributeWeights);
      await validatePenaltyRules(tx, userId, data.penaltyRuleIds);
      return { ...data, attributeWeights: weights };
    },
  });

  registerCrud(app, ctx, {
    path: '/api/unavailability',
    table: unavailability,
    entity: 'unavailability',
    label: 'Indisponibilidade',
    input: unavailabilityInput,
    orderBy: (t) => [asc(t.startDate)],
    prepare: async (tx, userId, data) => {
      if (data.endDate < data.startDate) throw badRequest('A data final deve ser posterior à inicial.');
      await assertOwned(tx, categories, data.categoryId, userId, 'Categoria');
      return { ...data };
    },
  });

  // Relações auxiliares para formulários (seletores).
  app.get('/api/lookups', async (req) => {
    const me = requireUser(req);
    const [cats, attrs, rules, sk] = await Promise.all([
      ctx.db.select({ id: categories.id, name: categories.name, color: categories.color, isBasicNeed: categories.isBasicNeed }).from(categories).where(eq(categories.userId, me.id)).orderBy(asc(categories.sortOrder)),
      ctx.db.select({ id: attributes.id, code: attributes.code, name: attributes.name, color: attributes.color }).from(attributes).where(eq(attributes.userId, me.id)).orderBy(asc(attributes.sortOrder)),
      ctx.db.select({ id: penaltyRules.id, name: penaltyRules.name, type: penaltyRules.type, active: penaltyRules.active }).from(penaltyRules).where(and(eq(penaltyRules.userId, me.id))),
      ctx.db.select({ id: skills.id, name: skills.name, parentId: skills.parentId }).from(skills).where(eq(skills.userId, me.id)),
    ]);
    return { categories: cats, attributes: attrs, penaltyRules: rules, skills: sk };
  });
}
