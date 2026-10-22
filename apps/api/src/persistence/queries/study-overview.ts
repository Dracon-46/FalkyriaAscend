/** Read model da visão por disciplina: tempo, conteúdo, desempenho, marcos e pré-requisitos. */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { assessments, skills, studyResources, studySessions, studySubjects, subjectMilestones, subjectPrerequisites } from '../schema';

export async function studyOverviewRows(db: DbOrTx, userId: string) {
  const subjects = await db
    .select()
    .from(studySubjects)
    .where(and(eq(studySubjects.userId, userId), isNull(studySubjects.archivedAt)))
    .orderBy(asc(studySubjects.name));
  const time = await db
    .select({
      subjectId: studySessions.subjectId,
      minutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int`,
      sessions: sql<number>`count(*)::int`,
      last: sql<string>`max(${studySessions.localDate})`,
    })
    .from(studySessions)
    .where(eq(studySessions.userId, userId))
    .groupBy(studySessions.subjectId);
  const content = await db
    .select({
      subjectId: studyResources.subjectId,
      total: sql<number>`coalesce(sum(${studyResources.totalUnits}),0)::int`,
      done: sql<number>`coalesce(sum(${studyResources.completedUnits}),0)::int`,
    })
    .from(studyResources)
    .where(eq(studyResources.userId, userId))
    .groupBy(studyResources.subjectId);
  const performance = await db
    .select({
      subjectId: assessments.subjectId,
      avg: sql<number>`avg(${assessments.score} / nullif(${assessments.maxScore},0))::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(assessments)
    .where(eq(assessments.userId, userId))
    .groupBy(assessments.subjectId);
  const milestones = await db
    .select({ subjectId: subjectMilestones.subjectId, n: sql<number>`count(*)::int` })
    .from(subjectMilestones)
    .where(eq(subjectMilestones.userId, userId))
    .groupBy(subjectMilestones.subjectId);
  const prerequisites = await db.select().from(subjectPrerequisites).where(eq(subjectPrerequisites.userId, userId));
  const skillRows = await db.select().from(skills).where(eq(skills.userId, userId));
  return { subjects, time, content, performance, milestones, prerequisites, skills: skillRows };
}
