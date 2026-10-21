import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { missionActionInput, missionInput, objectiveProgressInput, type MissionInput } from '@rpg/contracts';
import { addDays, MISSION_STATUSES, MISSION_TYPES } from '@rpg/engine';
import {
  categories,
  goals,
  habitCheckins,
  habits,
  missionEvents,
  missionObjectives,
  missionPenaltyRules,
  missions,
  penaltyApplications,
  rewardGrants,
  studySessions,
} from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { idParam, parse, requireUser } from '../lib/http';
import { afterAction } from '../services/hooks';
import { completeMission, createMission, failMission, refreshObjectives, transitionMission, updateMission } from '../services/missions';
import { todayFor } from '../services/time';
import type { AppContext } from '../context';

const listQuery = z.object({
  status: z.string().optional(),
  type: z.enum(MISSION_TYPES).optional(),
  goalId: z.uuid().optional(),
  q: z.string().max(100).optional(),
});

export async function registerMissionRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/missions', async (req) => {
    const me = requireUser(req);
    const q = parse(listQuery, req.query);
    const conds: SQL[] = [eq(missions.userId, me.id)];
    if (q.status) {
      const statuses = q.status.split(',').filter((s): s is (typeof MISSION_STATUSES)[number] => (MISSION_STATUSES as readonly string[]).includes(s));
      if (statuses.length) conds.push(inArray(missions.status, statuses));
    }
    if (q.type) conds.push(eq(missions.type, q.type));
    if (q.goalId) conds.push(eq(missions.goalId, q.goalId));
    if (q.q) conds.push(sql`${missions.title} ilike ${'%' + q.q + '%'}`);
    const rows = await ctx.db.select().from(missions).where(and(...conds)).orderBy(desc(missions.priority), asc(missions.dueDate), desc(missions.createdAt)).limit(300);
    const objs = rows.length
      ? await ctx.db.select().from(missionObjectives).where(inArray(missionObjectives.missionId, rows.map((r) => r.id))).orderBy(asc(missionObjectives.sortOrder))
      : [];
    return rows.map((m) => {
      const objectives = objs.filter((o) => o.missionId === m.id);
      // Missões secretas ativas aparecem ocultas até serem concluídas.
      if (m.isSecret && m.status !== 'completed') return { ...m, title: 'Missão secreta', description: 'Revelada ao ser concluída.', objectives: objectives.map((o) => ({ ...o, title: '???' })), hidden: true };
      return { ...m, objectives, hidden: false };
    });
  });

  app.get('/api/missions/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const [m] = await ctx.db.select().from(missions).where(and(eq(missions.id, id), eq(missions.userId, me.id)));
    if (!m) throw notFound('Missão');
    const { objectives, progress } = await ctx.db.transaction((tx) => refreshObjectives(tx, m, today));
    const events = await ctx.db.select().from(missionEvents).where(eq(missionEvents.missionId, id)).orderBy(asc(missionEvents.createdAt));
    const rules = await ctx.db.select({ ruleId: missionPenaltyRules.ruleId }).from(missionPenaltyRules).where(eq(missionPenaltyRules.missionId, id));
    const grants = await ctx.db.select().from(rewardGrants).where(and(eq(rewardGrants.userId, me.id), eq(rewardGrants.sourceId, id))).orderBy(asc(rewardGrants.createdAt));
    const penalties = await ctx.db.select().from(penaltyApplications).where(and(eq(penaltyApplications.userId, me.id), eq(penaltyApplications.sourceId, id)));
    return { ...m, objectives, progress, events, penaltyRuleIds: rules.map((r) => r.ruleId), grants, penalties };
  });

  app.post('/api/missions', async (req, reply) => {
    const me = requireUser(req);
    const input = parse(missionInput, req.body);
    const m = await ctx.db.transaction((tx) => createMission(tx, me.id, input));
    return reply.status(201).send(m);
  });

  app.put('/api/missions/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const input = parse(missionInput, req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return ctx.db.transaction((tx) => updateMission(tx, me.id, id, input, today, me.role === 'admin' && (req.query as { admin?: string }).admin === '1' ? 'admin' : 'user'));
  });

  app.post('/api/missions/:id/action', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const input = parse(missionActionInput, req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return ctx.db.transaction(async (tx) => {
      if (input.action === 'complete') {
        const r = await completeMission(tx, me.id, id, today, { evidence: input.evidence });
        const after = await afterAction(tx, me.id, today);
        return { ...r, after };
      }
      if (input.action === 'fail') {
        const mission = await failMission(tx, me.id, id, today, { actor: 'user', reason: input.reason ?? 'Falha declarada pelo usuário' });
        return { mission };
      }
      const mission = await transitionMission(tx, me.id, id, input.action, today, { reason: input.reason, dueDate: input.dueDate });
      return { mission };
    });
  });

  app.patch('/api/missions/:id/objectives/:objectiveId', async (req) => {
    const me = requireUser(req);
    const { id, objectiveId } = parse(z.object({ id: z.uuid(), objectiveId: z.uuid() }), req.params);
    const input = parse(objectiveProgressInput, req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return ctx.db.transaction(async (tx) => {
      const [m] = await tx.select().from(missions).where(and(eq(missions.id, id), eq(missions.userId, me.id))).for('update');
      if (!m) throw notFound('Missão');
      if (!['available', 'in_progress'].includes(m.status)) throw conflict('A missão não está ativa.');
      const [o] = await tx.select().from(missionObjectives).where(and(eq(missionObjectives.id, objectiveId), eq(missionObjectives.missionId, id)));
      if (!o) throw notFound('Objetivo');
      if (o.metric !== 'manual') throw conflict('Objetivos automáticos são calculados a partir dos registros.');
      await tx.update(missionObjectives).set({ current: input.current }).where(eq(missionObjectives.id, objectiveId));
      if (m.status === 'available') await tx.update(missions).set({ status: 'in_progress' }).where(eq(missions.id, id));
      await afterAction(tx, me.id, today);
      const [fresh] = await tx.select().from(missions).where(eq(missions.id, id));
      return refreshObjectives(tx, fresh!, today).then((r) => ({ ...r, status: fresh!.status }));
    });
  });

  /**
   * Sugestões (nunca criadas automaticamente e sem penalidades): áreas negligenciadas,
   * metas sem missões ativas, hábitos com baixa adesão e estudo abaixo do ritmo recente.
   */
  app.get('/api/missions/suggestions', async (req) => {
    const me = requireUser(req);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const since = addDays(today, -14);
    const suggestions: Array<{ reason: string; mission: MissionInput }> = [];
    const base = (over: Partial<MissionInput>): MissionInput => ({
      title: '',
      description: '',
      type: 'one_time',
      difficulty: 'moderate',
      categoryId: null,
      goalId: null,
      seasonId: null,
      parentId: null,
      startDate: today,
      dueDate: addDays(today, 7),
      completionMode: 'manual',
      rewardXpOverride: null,
      rewardCoinsOverride: null,
      isSecret: false,
      evidenceRequired: false,
      priority: 0,
      attributeWeights: {},
      objectives: [],
      penaltyRuleIds: [],
      ...over,
    });

    const cats = await ctx.db.select().from(categories).where(and(eq(categories.userId, me.id), isNull(categories.archivedAt), eq(categories.isBasicNeed, false)));
    const active = await ctx.db
      .select({ categoryId: rewardGrants.categoryId })
      .from(rewardGrants)
      .where(and(eq(rewardGrants.userId, me.id), gte(rewardGrants.localDate, since)))
      .groupBy(rewardGrants.categoryId);
    const activeSet = new Set(active.map((a) => a.categoryId));
    for (const c of cats.filter((c) => !activeSet.has(c.id)).slice(0, 2)) {
      suggestions.push({
        reason: `Nenhuma atividade em "${c.name}" nos últimos 14 dias.`,
        mission: base({ title: `Retomar ${c.name.toLowerCase()}`, description: `Dedique uma sessão a ${c.name.toLowerCase()} nesta semana.`, categoryId: c.id, difficulty: 'easy' }),
      });
    }

    const goalRows = await ctx.db.select().from(goals).where(and(eq(goals.userId, me.id), eq(goals.status, 'active')));
    const goalMissions = await ctx.db
      .select({ goalId: missions.goalId })
      .from(missions)
      .where(and(eq(missions.userId, me.id), inArray(missions.status, ['available', 'in_progress'])));
    const covered = new Set(goalMissions.map((g) => g.goalId));
    for (const g of goalRows.filter((g) => !covered.has(g.id)).slice(0, 2)) {
      suggestions.push({
        reason: `A meta "${g.title}" não tem missões ativas.`,
        mission: base({ title: `Avançar em: ${g.title}`, goalId: g.id, categoryId: g.categoryId, attributeWeights: { EXE: 1 } }),
      });
    }

    const habitRates = await ctx.db
      .select({
        id: habits.id,
        title: habits.title,
        done: sql<number>`count(*) filter (where ${habitCheckins.status} = 'done')::int`,
        evaluated: sql<number>`count(*) filter (where ${habitCheckins.status} in ('done','missed','tolerated'))::int`,
      })
      .from(habits)
      .leftJoin(habitCheckins, and(eq(habitCheckins.habitId, habits.id), gte(habitCheckins.localDate, since)))
      .where(and(eq(habits.userId, me.id), eq(habits.status, 'active')))
      .groupBy(habits.id, habits.title);
    for (const h of habitRates.filter((h) => h.evaluated >= 4 && h.done / h.evaluated < 0.5).slice(0, 2)) {
      suggestions.push({
        reason: `"${h.title}" foi cumprido em ${Math.round((h.done / h.evaluated) * 100)}% das vezes nas últimas 2 semanas. Sugestão leve, sem penalidade.`,
        mission: base({
          title: `Reconstruir: ${h.title}`,
          type: 'weekly',
          difficulty: 'easy',
          completionMode: 'auto',
          attributeWeights: { DIS: 1 },
          objectives: [{ id: null, title: `Cumprir "${h.title}" 3 vezes`, metric: 'habit_checkins', metricRefId: h.id, target: 3, unit: 'vezes', optional: false }],
        }),
      });
    }

    const [study] = await ctx.db
      .select({ minutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int` })
      .from(studySessions)
      .where(and(eq(studySessions.userId, me.id), gte(studySessions.localDate, addDays(today, -7))));
    if ((study?.minutes ?? 0) < 120) {
      suggestions.push({
        reason: `Apenas ${study?.minutes ?? 0} minutos de estudo nos últimos 7 dias.`,
        mission: base({
          title: 'Duas horas de estudo nesta semana',
          type: 'weekly',
          completionMode: 'auto',
          attributeWeights: { INT: 0.8, DIS: 0.2 },
          objectives: [{ id: null, title: 'Estudar 120 minutos', metric: 'study_minutes', metricRefId: null, target: 120, unit: 'min', optional: false }],
        }),
      });
    }
    return suggestions;
  });
}
