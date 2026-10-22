import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { goalInput, goalStatusInput, habitCheckinInput, habitInput, habitStatusInput, localDate } from '@rpg/contracts';
import { computeStreak } from '@rpg/engine';
import { categories, goalDependencies, goalMilestones, goals, habitCheckins, habitPenaltyRules, habits, penaltyApplications } from '../../persistence/schema';
import { conflict, notFound } from '../../shared/errors';
import { idParam, noContent, parse, requireUser } from '../http';
import { audit } from '../../application/audit';
import { habitsForDay } from '../../application/dashboard';
import { assertNoDependencyCycle, computeGoalProgress, maybeCompleteGoal } from '../../application/goals';
import { checkin, getHabit, refreshStreak, streakEntries, undoCheckin } from '../../application/habits';
import { afterAction } from '../../application/hooks';
import { todayFor } from '../../application/time';
import { assertNotBasicNeed, assertOwned, validatePenaltyRules, validateWeights } from '../../application/validation';
import type { AppContext } from '../../context';

export async function registerHabitGoalRoutes(app: FastifyInstance, ctx: AppContext) {
  // ------------------------------------------------------------------ Hábitos

  app.get('/api/habits', async (req) => {
    const me = requireUser(req);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const list = await habitsForDay(ctx.db, me.id, today);
    const archived = await ctx.db.select().from(habits).where(and(eq(habits.userId, me.id), eq(habits.status, 'archived')));
    const rules = await ctx.db.select().from(habitPenaltyRules).where(eq(habitPenaltyRules.userId, me.id));
    return {
      today,
      habits: list.map((h) => ({ ...h, penaltyRuleIds: rules.filter((r) => r.habitId === h.id).map((r) => r.ruleId) })),
      archived,
    };
  });

  app.get('/api/habits/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const h = await getHabit(ctx.db, me.id, id);
    const history = await ctx.db.select().from(habitCheckins).where(eq(habitCheckins.habitId, id)).orderBy(desc(habitCheckins.localDate)).limit(400);
    const streak = computeStreak(await streakEntries(ctx.db, h, today));
    const rules = await ctx.db.select({ ruleId: habitPenaltyRules.ruleId }).from(habitPenaltyRules).where(eq(habitPenaltyRules.habitId, id));
    const penalties = await ctx.db.select().from(penaltyApplications).where(and(eq(penaltyApplications.userId, me.id), eq(penaltyApplications.sourceId, id))).orderBy(desc(penaltyApplications.localDate));
    return { ...h, history, streak, penaltyRuleIds: rules.map((r) => r.ruleId), penalties };
  });

  const saveHabit = async (userId: string, data: z.infer<typeof habitInput>, existingId: string | null) =>
    ctx.db.transaction(async (tx) => {
      await assertOwned(tx, categories, data.categoryId, userId, 'Categoria');
      await assertNotBasicNeed(tx, userId, data.categoryId, data.isBasicNeed, data.penaltyRuleIds);
      await validatePenaltyRules(tx, userId, data.penaltyRuleIds);
      const weights = await validateWeights(tx, userId, data.attributeWeights);
      const { penaltyRuleIds, ...rest } = data;
      const values = { ...rest, attributeWeights: weights, endDate: rest.endDate ?? null, timeOfDay: rest.timeOfDay ?? null, categoryId: rest.categoryId ?? null };
      let row;
      let before = null;
      if (existingId) {
        before = await getHabit(tx, userId, existingId, true);
        [row] = await tx.update(habits).set({ ...values, updatedAt: new Date() }).where(eq(habits.id, existingId)).returning();
      } else {
        [row] = await tx.insert(habits).values({ ...values, userId }).returning();
      }
      await tx.delete(habitPenaltyRules).where(eq(habitPenaltyRules.habitId, row!.id));
      if (penaltyRuleIds.length) await tx.insert(habitPenaltyRules).values(penaltyRuleIds.map((ruleId) => ({ userId, habitId: row!.id, ruleId })));
      await audit(tx, { actorId: userId, userId, action: existingId ? 'update' : 'create', entityType: 'habits', entityId: row!.id, before, after: { ...row, penaltyRuleIds } });
      return row!;
    });

  app.post('/api/habits', async (req, reply) => {
    const me = requireUser(req);
    return reply.status(201).send(await saveHabit(me.id, parse(habitInput, req.body), null));
  });
  app.put('/api/habits/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return saveHabit(me.id, parse(habitInput, req.body), id);
  });

  /** Pausar / retomar / arquivar. Pausa gera "dispensado" (não falha) na avaliação diária. */
  app.patch('/api/habits/:id/status', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const input = parse(habitStatusInput, req.body);
    return ctx.db.transaction(async (tx) => {
      const before = await getHabit(tx, me.id, id, true);
      const [u] = await tx
        .update(habits)
        .set({ status: input.status, pausedUntil: input.status === 'paused' ? (input.pausedUntil ?? null) : null, updatedAt: new Date() })
        .where(eq(habits.id, id))
        .returning();
      await audit(tx, { actorId: me.id, userId: me.id, action: `habit.${input.status}`, entityType: 'habits', entityId: id, before, after: u });
      return u;
    });
  });

  app.post('/api/habits/reorder', async (req, reply) => {
    const me = requireUser(req);
    const { ids } = parse(z.object({ ids: z.array(z.uuid()).max(200) }), req.body);
    await ctx.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) await tx.update(habits).set({ sortOrder: i }).where(and(eq(habits.id, id), eq(habits.userId, me.id)));
    });
    return noContent(reply);
  });

  app.delete('/api/habits/:id', async (req, reply) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const h = await getHabit(ctx.db, me.id, id);
    const [any] = await ctx.db.select({ id: habitCheckins.id }).from(habitCheckins).where(eq(habitCheckins.habitId, id)).limit(1);
    if (any) throw conflict('Este hábito possui histórico. Arquive-o para preservar sequências e recompensas.');
    await ctx.db.delete(habits).where(eq(habits.id, id));
    await audit(ctx.db, { actorId: me.id, userId: me.id, action: 'delete', entityType: 'habits', entityId: id, before: h });
    return noContent(reply);
  });

  app.post('/api/habits/:id/checkins', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const input = parse(habitCheckinInput, req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return ctx.db.transaction(async (tx) => {
      const r = await checkin(tx, me.id, id, input, today);
      const after = await afterAction(tx, me.id, today);
      return { ...r, after };
    });
  });

  app.delete('/api/habits/:id/checkins/:date', async (req, reply) => {
    const me = requireUser(req);
    const { id, date } = parse(z.object({ id: z.uuid(), date: localDate }), req.params);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    await ctx.db.transaction(async (tx) => {
      await undoCheckin(tx, me.id, id, date, today);
      await afterAction(tx, me.id, today);
    });
    return noContent(reply);
  });

  app.post('/api/habits/:id/recompute-streak', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return ctx.db.transaction(async (tx) => refreshStreak(tx, await getHabit(tx, me.id, id, true), today));
  });

  // ------------------------------------------------------------------ Metas

  app.get('/api/goals', async (req) => {
    const me = requireUser(req);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const rows = await ctx.db.select().from(goals).where(eq(goals.userId, me.id)).orderBy(asc(goals.deadline), desc(goals.createdAt));
    const deps = await ctx.db.select().from(goalDependencies).where(eq(goalDependencies.userId, me.id));
    return Promise.all(
      rows.map(async (g) => ({ ...g, ...(await computeGoalProgress(ctx.db, g, today)), dependsOn: deps.filter((d) => d.goalId === g.id).map((d) => d.dependsOnId) })),
    );
  });

  const saveGoal = (userId: string, data: z.infer<typeof goalInput>, existingId: string | null, today: string) =>
    ctx.db.transaction(async (tx) => {
      await assertOwned(tx, categories, data.categoryId, userId, 'Categoria');
      if (data.progressMode === 'metric' && (!data.metric || data.metricTarget == null)) throw conflict('Metas por métrica exigem métrica e alvo.');
      if (data.progressMode === 'milestones' && data.milestones.length === 0) throw conflict('Metas por etapas exigem ao menos uma etapa.');
      const { milestones, dependsOn, ...rest } = data;
      let row;
      let before = null;
      if (existingId) {
        [before] = await tx.select().from(goals).where(and(eq(goals.id, existingId), eq(goals.userId, userId))).for('update');
        if (!before) throw notFound('Meta');
        if (before.status === 'completed') throw conflict('Meta concluída não pode ser editada.');
        [row] = await tx.update(goals).set({ ...rest, updatedAt: new Date() }).where(eq(goals.id, existingId)).returning();
      } else {
        [row] = await tx.insert(goals).values({ ...rest, userId }).returning();
      }
      await assertNoDependencyCycle(tx, userId, row!.id, dependsOn);
      await tx.delete(goalDependencies).where(eq(goalDependencies.goalId, row!.id));
      if (dependsOn.length) await tx.insert(goalDependencies).values(dependsOn.map((d) => ({ userId, goalId: row!.id, dependsOnId: d })));
      const existing = await tx.select().from(goalMilestones).where(eq(goalMilestones.goalId, row!.id));
      const keep = new Set(milestones.map((m) => m.id).filter(Boolean) as string[]);
      const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (remove.length) await tx.delete(goalMilestones).where(inArray(goalMilestones.id, remove));
      for (const [i, m] of milestones.entries()) {
        const prev = existing.find((e) => e.id === m.id);
        const values = { title: m.title, weight: m.weight, dueDate: m.dueDate ?? null, sortOrder: i, doneAt: m.done ? (prev?.doneAt ?? new Date()) : null };
        if (prev) await tx.update(goalMilestones).set(values).where(eq(goalMilestones.id, prev.id));
        else await tx.insert(goalMilestones).values({ ...values, userId, goalId: row!.id });
      }
      await audit(tx, { actorId: userId, userId, action: existingId ? 'update' : 'create', entityType: 'goals', entityId: row!.id, before, after: { ...row, milestones, dependsOn } });
      await maybeCompleteGoal(tx, userId, row!.id, today);
      await afterAction(tx, userId, today);
      return row!;
    });

  app.post('/api/goals', async (req, reply) => {
    const me = requireUser(req);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return reply.status(201).send(await saveGoal(me.id, parse(goalInput, req.body), null, today));
  });
  app.put('/api/goals/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return saveGoal(me.id, parse(goalInput, req.body), id, today);
  });

  app.post('/api/goals/:id/milestones/:milestoneId/toggle', async (req) => {
    const me = requireUser(req);
    const { id, milestoneId } = parse(z.object({ id: z.uuid(), milestoneId: z.uuid() }), req.params);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return ctx.db.transaction(async (tx) => {
      const [g] = await tx.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, me.id)));
      if (!g) throw notFound('Meta');
      if (g.status !== 'active') throw conflict('A meta não está ativa.');
      const [m] = await tx.select().from(goalMilestones).where(and(eq(goalMilestones.id, milestoneId), eq(goalMilestones.goalId, id)));
      if (!m) throw notFound('Etapa');
      await tx.update(goalMilestones).set({ doneAt: m.doneAt ? null : new Date() }).where(eq(goalMilestones.id, milestoneId));
      const grant = await maybeCompleteGoal(tx, me.id, id, today);
      await afterAction(tx, me.id, today);
      const [fresh] = await tx.select().from(goals).where(eq(goals.id, id));
      return { goal: fresh, ...(await computeGoalProgress(tx, fresh!, today)), completedReward: grant };
    });
  });

  app.patch('/api/goals/:id/status', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const { status } = parse(goalStatusInput, req.body);
    return ctx.db.transaction(async (tx) => {
      const [before] = await tx.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, me.id))).for('update');
      if (!before) throw notFound('Meta');
      if (before.status === 'completed') throw conflict('Meta concluída não muda de estado.');
      const [u] = await tx.update(goals).set({ status, updatedAt: new Date() }).where(eq(goals.id, id)).returning();
      await audit(tx, { actorId: me.id, userId: me.id, action: `goal.${status}`, entityType: 'goals', entityId: id, before, after: u });
      return u;
    });
  });

  app.delete('/api/goals/:id', async (req, reply) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const [g] = await ctx.db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, me.id)));
    if (!g) throw notFound('Meta');
    if (g.grantId) throw conflict('Meta concluída e recompensada não pode ser excluída.');
    await ctx.db.delete(goals).where(eq(goals.id, id));
    await audit(ctx.db, { actorId: me.id, userId: me.id, action: 'delete', entityType: 'goals', entityId: id, before: g });
    return noContent(reply);
  });
}
