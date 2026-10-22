import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { missionActionInput, missionInput, objectiveProgressInput } from '@rpg/contracts';
import { MISSION_TYPES } from '@rpg/engine';
import { idParam, parse, requireUser } from '../http';
import {
  createMissionFor,
  listMissionsView,
  missionDetail,
  missionSuggestionsFor,
  runMissionAction,
  setObjectiveProgress,
  updateMissionFor,
} from '../../application/use-cases/missions';
import type { AppContext } from '../../context';

const listQuery = z.object({
  status: z.string().optional(),
  type: z.enum(MISSION_TYPES).optional(),
  goalId: z.uuid().optional(),
  q: z.string().max(100).optional(),
});

export async function registerMissionRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/missions', async (req) => {
    const me = requireUser(req);
    return listMissionsView(ctx.db, me.id, parse(listQuery, req.query));
  });

  /**
   * Sugestões (nunca criadas automaticamente e sem penalidades): áreas negligenciadas,
   * metas sem missões ativas, hábitos com baixa adesão e estudo abaixo do ritmo recente.
   */
  app.get('/api/missions/suggestions', async (req) => missionSuggestionsFor(ctx.db, requireUser(req).id, ctx.now()));

  app.get('/api/missions/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return missionDetail(ctx.db, me.id, id, ctx.now());
  });

  app.post('/api/missions', async (req, reply) => {
    const me = requireUser(req);
    return reply.status(201).send(await createMissionFor(ctx.db, me.id, parse(missionInput, req.body)));
  });

  app.put('/api/missions/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const input = parse(missionInput, req.body);
    const actor = me.role === 'admin' && (req.query as { admin?: string }).admin === '1' ? 'admin' : 'user';
    return updateMissionFor(ctx.db, me.id, id, input, ctx.now(), actor);
  });

  app.post('/api/missions/:id/action', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return runMissionAction(ctx.db, me.id, id, parse(missionActionInput, req.body), ctx.now());
  });

  app.patch('/api/missions/:id/objectives/:objectiveId', async (req) => {
    const me = requireUser(req);
    const { id, objectiveId } = parse(z.object({ id: z.uuid(), objectiveId: z.uuid() }), req.params);
    const { current } = parse(objectiveProgressInput, req.body);
    return setObjectiveProgress(ctx.db, me.id, id, objectiveId, current, ctx.now());
  });
}
