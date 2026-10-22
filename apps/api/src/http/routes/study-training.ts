import type { FastifyInstance } from 'fastify';
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
import { idParam, noContent, parse, requireUser } from '../http';
import { activitiesView, activityTypesCrud, exercisesCrud, personalRecordsOf, quickLogsOf, recordManualActivity, recordQuickLog, removeActivity } from '../../application/use-cases/activities';
import { assessmentsOf, knowledgeAreasCrud, recordAssessment, recordStudySession, recordSubjectMilestone, removeStudySession, studyOverview, studyResourcesCrud, studySessionsOf, subjectMilestonesOf, subjectsCrud } from '../../application/use-cases/study';
import { registerCrud } from '../crud';
import type { AppContext } from '../../context';

const pageQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

export async function registerStudyTrainingRoutes(app: FastifyInstance, ctx: AppContext) {
  // ------------------------------------------------------------------ Estudos

  registerCrud(app, ctx, { path: '/api/knowledge-areas', input: areaInput, service: knowledgeAreasCrud });
  registerCrud(app, ctx, { path: '/api/subjects', input: subjectInput, service: subjectsCrud });
  registerCrud(app, ctx, { path: '/api/study-resources', input: resourceInput, service: studyResourcesCrud });

  /** Visão por disciplina: tempo investido ≠ conteúdo concluído ≠ desempenho ≠ domínio demonstrado. */
  app.get('/api/study/overview', async (req) => studyOverview(ctx.db, requireUser(req).id));

  app.get('/api/study/sessions', async (req) => {
    const me = requireUser(req);
    return studySessionsOf(ctx.db, me.id, parse(pageQuery, req.query).limit);
  });

  app.post('/api/study/sessions', async (req, reply) => {
    const me = requireUser(req);
    return reply.status(201).send(await recordStudySession(ctx.db, me.id, parse(studySessionInput, req.body), ctx.now()));
  });

  app.delete('/api/study/sessions/:id', async (req, reply) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    await removeStudySession(ctx.db, me.id, id, ctx.now());
    return noContent(reply);
  });

  app.get('/api/study/assessments', async (req) => assessmentsOf(ctx.db, requireUser(req).id));
  app.post('/api/study/assessments', async (req, reply) => {
    const me = requireUser(req);
    return reply.status(201).send(await recordAssessment(ctx.db, me.id, parse(assessmentInput, req.body), ctx.now()));
  });

  app.get('/api/study/milestones', async (req) => subjectMilestonesOf(ctx.db, requireUser(req).id));
  app.post('/api/study/milestones', async (req, reply) => {
    const me = requireUser(req);
    return reply.status(201).send(await recordSubjectMilestone(ctx.db, me.id, parse(subjectMilestoneInput, req.body), ctx.now()));
  });

  // ------------------------------------------------------------------ Treinos

  registerCrud(app, ctx, { path: '/api/activity-types', input: activityTypeInput, service: activityTypesCrud });
  registerCrud(app, ctx, { path: '/api/exercises', input: exerciseInput, service: exercisesCrud });

  app.get('/api/activities', async (req) => {
    const me = requireUser(req);
    return activitiesView(ctx.db, me.id, parse(pageQuery, req.query).limit);
  });

  app.post('/api/activities', async (req, reply) => {
    const me = requireUser(req);
    return reply.status(201).send(await recordManualActivity(ctx.db, me.id, parse(activityInput, req.body), ctx.now()));
  });

  app.delete('/api/activities/:id', async (req, reply) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    await removeActivity(ctx.db, me.id, id, ctx.now());
    return noContent(reply);
  });

  app.get('/api/records', async (req) => personalRecordsOf(ctx.db, requireUser(req).id));

  // ------------------------------------------------------------------ Registro rápido

  app.post('/api/quick-log', async (req, reply) => {
    const me = requireUser(req);
    return reply.status(201).send(await recordQuickLog(ctx.db, me.id, parse(quickLogInput, req.body), ctx.now()));
  });
  app.get('/api/quick-log', async (req) => quickLogsOf(ctx.db, requireUser(req).id));
}
