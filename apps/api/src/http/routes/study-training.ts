import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  activityInput,
  activityTypeInput,
  areaInput,
  assessmentInput,
  exerciseInput,
  quickLogInput,
  resourceInput,
  studySessionInput,
  subjectInput,
  subjectMilestoneInput,
} from '@rpg/contracts';
import { levelFromXp } from '@rpg/engine';
import {
  activities,
  activitySets,
  activityTypes,
  assessments,
  exercises,
  knowledgeAreas,
  personalRecords,
  quickLogs,
  skills,
  studyResources,
  studySessions,
  studySubjects,
  subjectMilestones,
  subjectPrerequisites,
} from '../../persistence/schema';
import { notFound } from '../../shared/errors';
import { idParam, noContent, parse, requireUser } from '../http';
import { deleteActivity, quickLog, recordActivity, toNormalized } from '../../application/activities';
import { getActiveConfig } from '../../application/config';
import { afterAction } from '../../application/hooks';
import { deleteStudySession, ensureSubjectSkill, logAssessment, logStudySession, logSubjectMilestone } from '../../application/study';
import { todayFor } from '../../application/time';
import { assertOwned, validateWeights } from '../../application/validation';
import { registerCrud } from '../crud';
import type { AppContext } from '../../context';

const pageQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

export async function registerStudyTrainingRoutes(app: FastifyInstance, ctx: AppContext) {
  // ------------------------------------------------------------------ Estudos

  registerCrud(app, ctx, { path: '/api/knowledge-areas', table: knowledgeAreas, entity: 'knowledge_areas', label: 'Área de conhecimento', input: areaInput, orderBy: (t) => [asc(t.name)] });

  registerCrud(app, ctx, {
    path: '/api/subjects',
    table: studySubjects,
    entity: 'study_subjects',
    label: 'Disciplina',
    input: subjectInput,
    orderBy: (t) => [asc(t.name)],
    prepare: async (tx, userId, data, existing) => {
      await assertOwned(tx, knowledgeAreas, data.areaId, userId, 'Área');
      const { prerequisiteIds: _p, ...rest } = data;
      const skillId = existing?.skillId ?? (await ensureSubjectSkill(tx, userId, data.name));
      return { ...rest, skillId };
    },
    after: async (tx, userId, row, data) => {
      const ids = data.prerequisiteIds.filter((p) => p !== row.id);
      if (ids.length) {
        const owned = await tx.select({ id: studySubjects.id }).from(studySubjects).where(and(eq(studySubjects.userId, userId), inArray(studySubjects.id, ids)));
        if (owned.length !== new Set(ids).size) throw notFound('Pré-requisito');
      }
      await tx.delete(subjectPrerequisites).where(eq(subjectPrerequisites.subjectId, row.id));
      if (ids.length) await tx.insert(subjectPrerequisites).values(ids.map((p) => ({ userId, subjectId: row.id, prerequisiteId: p })));
    },
  });

  registerCrud(app, ctx, {
    path: '/api/study-resources',
    table: studyResources,
    entity: 'study_resources',
    label: 'Recurso de estudo',
    input: resourceInput,
    orderBy: (t) => [asc(t.createdAt)],
    prepare: async (tx, userId, data) => {
      await assertOwned(tx, studySubjects, data.subjectId, userId, 'Disciplina');
      await assertOwned(tx, studyResources, data.parentId, userId, 'Recurso-pai');
      return { ...data };
    },
  });

  /** Visão por disciplina: tempo investido ≠ conteúdo concluído ≠ desempenho ≠ domínio demonstrado. */
  app.get('/api/study/overview', async (req) => {
    const me = requireUser(req);
    const { config } = await getActiveConfig(ctx.db, me.id);
    const subjects = await ctx.db.select().from(studySubjects).where(and(eq(studySubjects.userId, me.id), isNull(studySubjects.archivedAt))).orderBy(asc(studySubjects.name));
    const time = await ctx.db
      .select({ subjectId: studySessions.subjectId, minutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int`, sessions: sql<number>`count(*)::int`, last: sql<string>`max(${studySessions.localDate})` })
      .from(studySessions)
      .where(eq(studySessions.userId, me.id))
      .groupBy(studySessions.subjectId);
    const content = await ctx.db
      .select({ subjectId: studyResources.subjectId, total: sql<number>`coalesce(sum(${studyResources.totalUnits}),0)::int`, done: sql<number>`coalesce(sum(${studyResources.completedUnits}),0)::int` })
      .from(studyResources)
      .where(eq(studyResources.userId, me.id))
      .groupBy(studyResources.subjectId);
    const perf = await ctx.db
      .select({ subjectId: assessments.subjectId, avg: sql<number>`avg(${assessments.score} / nullif(${assessments.maxScore},0))::float`, count: sql<number>`count(*)::int` })
      .from(assessments)
      .where(eq(assessments.userId, me.id))
      .groupBy(assessments.subjectId);
    const ms = await ctx.db.select({ subjectId: subjectMilestones.subjectId, n: sql<number>`count(*)::int` }).from(subjectMilestones).where(eq(subjectMilestones.userId, me.id)).groupBy(subjectMilestones.subjectId);
    const prereqs = await ctx.db.select().from(subjectPrerequisites).where(eq(subjectPrerequisites.userId, me.id));
    const skillRows = await ctx.db.select().from(skills).where(eq(skills.userId, me.id));
    const view = subjects.map((s) => {
      const sk = skillRows.find((k) => k.id === s.skillId);
      const st = levelFromXp(sk?.xp ?? 0, config.curves.mastery);
      return {
        ...s,
        minutes: time.find((t) => t.subjectId === s.id)?.minutes ?? 0,
        sessions: time.find((t) => t.subjectId === s.id)?.sessions ?? 0,
        lastSession: time.find((t) => t.subjectId === s.id)?.last ?? null,
        contentTotal: content.find((c) => c.subjectId === s.id)?.total ?? 0,
        contentDone: content.find((c) => c.subjectId === s.id)?.done ?? 0,
        assessmentAvg: perf.find((p) => p.subjectId === s.id)?.avg ?? null,
        assessmentCount: perf.find((p) => p.subjectId === s.id)?.count ?? 0,
        milestones: ms.find((m) => m.subjectId === s.id)?.n ?? 0,
        mastery: { level: st.level, xp: sk?.xp ?? 0, progress: st.progress },
        prerequisiteIds: prereqs.filter((p) => p.subjectId === s.id).map((p) => p.prerequisiteId),
      };
    });
    return view.map((s) => ({
      ...s,
      // Pré-requisito "atendido" quando a disciplina exigida atingiu maestria nível 3.
      prerequisitesMet: s.prerequisiteIds.every((pid) => (view.find((v) => v.id === pid)?.mastery.level ?? 0) >= 3),
    }));
  });

  app.get('/api/study/sessions', async (req) => {
    const me = requireUser(req);
    const { limit } = parse(pageQuery, req.query);
    return ctx.db
      .select({ s: studySessions, subject: studySubjects.name })
      .from(studySessions)
      .innerJoin(studySubjects, eq(studySubjects.id, studySessions.subjectId))
      .where(eq(studySessions.userId, me.id))
      .orderBy(desc(studySessions.localDate), desc(studySessions.createdAt))
      .limit(limit)
      .then((rows) => rows.map((r) => ({ ...r.s, subjectName: r.subject })));
  });

  app.post('/api/study/sessions', async (req, reply) => {
    const me = requireUser(req);
    const input = parse(studySessionInput, req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const r = await ctx.db.transaction(async (tx) => {
      const out = await logStudySession(tx, me.id, input, today);
      return { ...out, after: await afterAction(tx, me.id, today) };
    });
    return reply.status(201).send(r);
  });

  app.delete('/api/study/sessions/:id', async (req, reply) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    await ctx.db.transaction(async (tx) => {
      await deleteStudySession(tx, me.id, id, me.id);
      await afterAction(tx, me.id, today);
    });
    return noContent(reply);
  });

  app.get('/api/study/assessments', async (req) => {
    const me = requireUser(req);
    return ctx.db.select().from(assessments).where(eq(assessments.userId, me.id)).orderBy(desc(assessments.localDate));
  });
  app.post('/api/study/assessments', async (req, reply) => {
    const me = requireUser(req);
    const input = parse(assessmentInput, req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const r = await ctx.db.transaction(async (tx) => ({ ...(await logAssessment(tx, me.id, input, today)), after: await afterAction(tx, me.id, today) }));
    return reply.status(201).send(r);
  });
  app.get('/api/study/milestones', async (req) => {
    const me = requireUser(req);
    return ctx.db.select().from(subjectMilestones).where(eq(subjectMilestones.userId, me.id)).orderBy(desc(subjectMilestones.achievedOn));
  });
  app.post('/api/study/milestones', async (req, reply) => {
    const me = requireUser(req);
    const input = parse(subjectMilestoneInput, req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const r = await ctx.db.transaction(async (tx) => ({ ...(await logSubjectMilestone(tx, me.id, input, today)), after: await afterAction(tx, me.id, today) }));
    return reply.status(201).send(r);
  });

  // ------------------------------------------------------------------ Treinos

  registerCrud(app, ctx, {
    path: '/api/activity-types',
    table: activityTypes,
    entity: 'activity_types',
    label: 'Tipo de atividade',
    input: activityTypeInput,
    orderBy: (t) => [asc(t.name)],
    prepare: async (tx, userId, data) => {
      await assertOwned(tx, skills, data.skillId, userId, 'Habilidade');
      return { ...data, attributeWeights: await validateWeights(tx, userId, data.attributeWeights) };
    },
  });
  registerCrud(app, ctx, { path: '/api/exercises', table: exercises, entity: 'exercises', label: 'Exercício', input: exerciseInput, orderBy: (t) => [asc(t.name)] });

  app.get('/api/activities', async (req) => {
    const me = requireUser(req);
    const { limit } = parse(pageQuery, req.query);
    const rows = await ctx.db
      .select({ a: activities, typeName: activityTypes.name, category: activityTypes.category })
      .from(activities)
      .innerJoin(activityTypes, eq(activityTypes.id, activities.typeId))
      .where(and(eq(activities.userId, me.id), isNull(activities.deletedAt)))
      .orderBy(desc(activities.localDate), desc(activities.createdAt))
      .limit(limit);
    const sets = rows.length
      ? await ctx.db
          .select({ s: activitySets, exercise: exercises.name })
          .from(activitySets)
          .innerJoin(exercises, eq(exercises.id, activitySets.exerciseId))
          .where(inArray(activitySets.activityId, rows.map((r) => r.a.id)))
          .orderBy(asc(activitySets.setIndex))
      : [];
    return rows.map((r) => ({
      ...r.a,
      typeName: r.typeName,
      category: r.category,
      pace: r.a.distanceKm && Number(r.a.distanceKm) > 0 ? Math.round((r.a.durationMin / Number(r.a.distanceKm)) * 100) / 100 : null,
      volumeKg: sets.filter((s) => s.s.activityId === r.a.id).reduce((acc, s) => acc + s.s.reps * Number(s.s.weightKg ?? 0), 0),
      sets: sets.filter((s) => s.s.activityId === r.a.id).map((s) => ({ ...s.s, exerciseName: s.exercise })),
    }));
  });

  app.post('/api/activities', async (req, reply) => {
    const me = requireUser(req);
    const input = parse(activityInput, req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const r = await ctx.db.transaction(async (tx) => {
      const out = await recordActivity(tx, me.id, toNormalized(input, today), today);
      return { ...out, after: await afterAction(tx, me.id, today) };
    });
    return reply.status(201).send(r);
  });

  app.delete('/api/activities/:id', async (req, reply) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    await ctx.db.transaction(async (tx) => {
      await deleteActivity(tx, me.id, id, 'Atividade excluída pelo usuário', me.id);
      await afterAction(tx, me.id, today);
    });
    return noContent(reply);
  });

  app.get('/api/records', async (req) => {
    const me = requireUser(req);
    const rows = await ctx.db
      .select({ r: personalRecords, exercise: exercises.name })
      .from(personalRecords)
      .leftJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
      .where(eq(personalRecords.userId, me.id))
      .orderBy(desc(personalRecords.achievedOn));
    return rows.map((x) => ({ ...x.r, exerciseName: x.exercise }));
  });

  // ------------------------------------------------------------------ Registro rápido

  app.post('/api/quick-log', async (req, reply) => {
    const me = requireUser(req);
    const input = parse(quickLogInput, req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const r = await ctx.db.transaction(async (tx) => ({ ...(await quickLog(tx, me.id, input, today)), after: await afterAction(tx, me.id, today) }));
    return reply.status(201).send(r);
  });
  app.get('/api/quick-log', async (req) => {
    const me = requireUser(req);
    return ctx.db.select().from(quickLogs).where(eq(quickLogs.userId, me.id)).orderBy(desc(quickLogs.createdAt)).limit(50);
  });
}
