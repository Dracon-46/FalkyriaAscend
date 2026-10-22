import type { AreaInput, AssessmentInput, ResourceInput, StudySessionInput, SubjectInput, SubjectMilestoneInput } from '@rpg/contracts';
import { levelFromXp } from '@rpg/engine';
import { studyOverviewRows } from '../../persistence/queries/study-overview';
import {
  countOwnedSubjects,
  listAssessments,
  listStudySessions,
  listSubjectMilestones,
  replacePrerequisites,
} from '../../persistence/repositories/study';
import { inTransaction, type Db, type DbOrTx } from '../../persistence/unit-of-work';
import { notFound } from '../../shared/errors';
import { getActiveConfig } from '../config';
import { crudService } from '../crud';
import { afterAction } from '../hooks';
import { todayFor } from '../time';
import { assertOwned } from '../validation';
import { deleteStudySession, ensureSubjectSkill, logAssessment, logStudySession, logSubjectMilestone } from '../study';

// ------------------------------------------------------------------ Cadastros

export const knowledgeAreasCrud = crudService<AreaInput>({ resource: 'knowledgeAreas', entity: 'knowledge_areas', label: 'Área de conhecimento', orderBy: [{ field: 'name' }] });

export const subjectsCrud = crudService<SubjectInput>({
  resource: 'studySubjects',
  entity: 'study_subjects',
  label: 'Disciplina',
  orderBy: [{ field: 'name' }],
  prepare: async (tx, userId, data, existing) => {
    await assertOwned(tx, 'knowledgeAreas', data.areaId, userId, 'Área');
    const { prerequisiteIds: _p, ...rest } = data;
    const skillId = existing?.skillId ?? (await ensureSubjectSkill(tx, userId, data.name));
    return { ...rest, skillId };
  },
  after: async (tx, userId, row, data) => {
    const ids = data.prerequisiteIds.filter((p) => p !== row.id);
    if (ids.length && (await countOwnedSubjects(tx, userId, ids)) !== new Set(ids).size) throw notFound('Pré-requisito');
    await replacePrerequisites(tx, userId, row.id, ids);
  },
});

export const studyResourcesCrud = crudService<ResourceInput>({
  resource: 'studyResources',
  entity: 'study_resources',
  label: 'Recurso de estudo',
  orderBy: [{ field: 'createdAt' }],
  prepare: async (tx, userId, data) => {
    await assertOwned(tx, 'studySubjects', data.subjectId, userId, 'Disciplina');
    await assertOwned(tx, 'studyResources', data.parentId, userId, 'Recurso-pai');
    return { ...data };
  },
});

// ------------------------------------------------------------------ Casos de uso

/** Visão por disciplina: tempo investido ≠ conteúdo concluído ≠ desempenho ≠ domínio demonstrado. */
export async function studyOverview(db: DbOrTx, userId: string) {
  const { config } = await getActiveConfig(db, userId);
  const r = await studyOverviewRows(db, userId);
  const view = r.subjects.map((s) => {
    const sk = r.skills.find((k) => k.id === s.skillId);
    const st = levelFromXp(sk?.xp ?? 0, config.curves.mastery);
    const time = r.time.find((t) => t.subjectId === s.id);
    const content = r.content.find((c) => c.subjectId === s.id);
    const perf = r.performance.find((p) => p.subjectId === s.id);
    return {
      ...s,
      minutes: time?.minutes ?? 0,
      sessions: time?.sessions ?? 0,
      lastSession: time?.last ?? null,
      contentTotal: content?.total ?? 0,
      contentDone: content?.done ?? 0,
      assessmentAvg: perf?.avg ?? null,
      assessmentCount: perf?.count ?? 0,
      milestones: r.milestones.find((m) => m.subjectId === s.id)?.n ?? 0,
      mastery: { level: st.level, xp: sk?.xp ?? 0, progress: st.progress },
      prerequisiteIds: r.prerequisites.filter((p) => p.subjectId === s.id).map((p) => p.prerequisiteId),
    };
  });
  return view.map((s) => ({
    ...s,
    // Pré-requisito "atendido" quando a disciplina exigida atingiu maestria nível 3.
    prerequisitesMet: s.prerequisiteIds.every((pid) => (view.find((v) => v.id === pid)?.mastery.level ?? 0) >= 3),
  }));
}

export function studySessionsOf(db: DbOrTx, userId: string, limit: number) {
  return listStudySessions(db, userId, limit);
}

export function assessmentsOf(db: DbOrTx, userId: string) {
  return listAssessments(db, userId);
}

export function subjectMilestonesOf(db: DbOrTx, userId: string) {
  return listSubjectMilestones(db, userId);
}

/** Executa um registro de estudo e reavalia o progresso, na mesma transação. */
async function recordAndReevaluate<T extends object>(db: Db, userId: string, now: Date, work: (tx: DbOrTx, today: string) => Promise<T>) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => {
    const out = await work(tx, today);
    return { ...out, after: await afterAction(tx, userId, today) };
  });
}

export const recordStudySession = (db: Db, userId: string, input: StudySessionInput, now: Date) =>
  recordAndReevaluate(db, userId, now, (tx, today) => logStudySession(tx, userId, input, today));

export const recordAssessment = (db: Db, userId: string, input: AssessmentInput, now: Date) =>
  recordAndReevaluate(db, userId, now, (tx, today) => logAssessment(tx, userId, input, today));

export const recordSubjectMilestone = (db: Db, userId: string, input: SubjectMilestoneInput, now: Date) =>
  recordAndReevaluate(db, userId, now, (tx, today) => logSubjectMilestone(tx, userId, input, today));

export async function removeStudySession(db: Db, userId: string, id: string, now: Date): Promise<void> {
  const today = await todayFor(db, userId, now);
  await inTransaction(db, async (tx) => {
    await deleteStudySession(tx, userId, id, userId);
    await afterAction(tx, userId, today);
  });
}
