import type { FastifyInstance } from 'fastify';
import { attributeInput, categoryInput, levelRewardInput, penaltyRuleInput, rankInput, skillInput, templateInput, unavailabilityInput } from '@rpg/contracts';
import { requireUser } from '../http';
import {
  attributesCrud,
  categoriesCrud,
  levelRewardsCrud,
  lookups,
  missionTemplatesCrud,
  penaltyRulesCrud,
  ranksCrud,
  skillsCrud,
  unavailabilityCrud,
} from '../../application/use-cases/catalog';
import { registerCrud } from '../crud';
import type { AppContext } from '../../context';

export async function registerDefinitionRoutes(app: FastifyInstance, ctx: AppContext) {
  registerCrud(app, ctx, { path: '/api/categories', input: categoryInput, service: categoriesCrud });
  registerCrud(app, ctx, { path: '/api/attributes', input: attributeInput, service: attributesCrud });
  registerCrud(app, ctx, { path: '/api/skills', input: skillInput, service: skillsCrud });
  registerCrud(app, ctx, { path: '/api/ranks', input: rankInput, service: ranksCrud, adminWrite: true });
  registerCrud(app, ctx, { path: '/api/level-rewards', input: levelRewardInput, service: levelRewardsCrud, adminWrite: true });
  registerCrud(app, ctx, { path: '/api/penalty-rules', input: penaltyRuleInput, service: penaltyRulesCrud });
  registerCrud(app, ctx, { path: '/api/mission-templates', input: templateInput, service: missionTemplatesCrud });
  registerCrud(app, ctx, { path: '/api/unavailability', input: unavailabilityInput, service: unavailabilityCrud });

  app.get('/api/lookups', async (req) => {
    const me = requireUser(req);
    return lookups(ctx.db, me.id);
  });
}
