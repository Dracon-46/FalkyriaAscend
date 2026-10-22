import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { goalInput, goalStatusInput, habitCheckinInput, habitInput, habitStatusInput, localDate } from '@rpg/contracts';
import { idParam, noContent, parse, requireUser } from '../http';
import { deleteGoal, listGoalsView, saveGoal, setGoalStatus, toggleMilestone } from '../../application/use-cases/goals';
import { deleteHabit, habitDetail, listHabitsView, recomputeStreak, recordCheckin, reorderHabits, saveHabit, setHabitStatus, undoCheckinFor } from '../../application/use-cases/habits';
import type { AppContext } from '../../context';

export async function registerHabitGoalRoutes(app: FastifyInstance, ctx: AppContext) {
  // ------------------------------------------------------------------ Hábitos

  app.get('/api/habits', async (req) => listHabitsView(ctx.db, requireUser(req).id, ctx.now()));

  app.get('/api/habits/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return habitDetail(ctx.db, me.id, id, ctx.now());
  });

  app.post('/api/habits', async (req, reply) => {
    const me = requireUser(req);
    return reply.status(201).send(await saveHabit(ctx.db, me.id, parse(habitInput, req.body), null));
  });
  app.put('/api/habits/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return saveHabit(ctx.db, me.id, parse(habitInput, req.body), id);
  });

  /** Pausar / retomar / arquivar. Pausa gera "dispensado" (não falha) na avaliação diária. */
  app.patch('/api/habits/:id/status', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return setHabitStatus(ctx.db, me.id, id, parse(habitStatusInput, req.body));
  });

  app.post('/api/habits/reorder', async (req, reply) => {
    const me = requireUser(req);
    const { ids } = parse(z.object({ ids: z.array(z.uuid()).max(200) }), req.body);
    await reorderHabits(ctx.db, me.id, ids);
    return noContent(reply);
  });

  app.delete('/api/habits/:id', async (req, reply) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    await deleteHabit(ctx.db, me.id, id);
    return noContent(reply);
  });

  app.post('/api/habits/:id/checkins', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return recordCheckin(ctx.db, me.id, id, parse(habitCheckinInput, req.body), ctx.now());
  });

  app.delete('/api/habits/:id/checkins/:date', async (req, reply) => {
    const me = requireUser(req);
    const { id, date } = parse(z.object({ id: z.uuid(), date: localDate }), req.params);
    await undoCheckinFor(ctx.db, me.id, id, date, ctx.now());
    return noContent(reply);
  });

  app.post('/api/habits/:id/recompute-streak', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return recomputeStreak(ctx.db, me.id, id, ctx.now());
  });

  // ------------------------------------------------------------------ Metas

  app.get('/api/goals', async (req) => listGoalsView(ctx.db, requireUser(req).id, ctx.now()));

  app.post('/api/goals', async (req, reply) => {
    const me = requireUser(req);
    return reply.status(201).send(await saveGoal(ctx.db, me.id, parse(goalInput, req.body), null, ctx.now()));
  });
  app.put('/api/goals/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return saveGoal(ctx.db, me.id, parse(goalInput, req.body), id, ctx.now());
  });

  app.post('/api/goals/:id/milestones/:milestoneId/toggle', async (req) => {
    const me = requireUser(req);
    const { id, milestoneId } = parse(z.object({ id: z.uuid(), milestoneId: z.uuid() }), req.params);
    return toggleMilestone(ctx.db, me.id, id, milestoneId, ctx.now());
  });

  app.patch('/api/goals/:id/status', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return setGoalStatus(ctx.db, me.id, id, parse(goalStatusInput, req.body).status);
  });

  app.delete('/api/goals/:id', async (req, reply) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    await deleteGoal(ctx.db, me.id, id);
    return noContent(reply);
  });
}
