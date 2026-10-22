/** Estudos: disciplinas, pré-requisitos, recursos, sessões, avaliações e marcos de domínio. */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { assessments, skills, studyResources, studySessions, studySubjects, subjectMilestones, subjectPrerequisites } from '../schema';

type RecordSource = (typeof studySessions.$inferSelect)['source'];

// ------------------------------------------------------------------ Disciplinas

export async function findSubject(db: DbOrTx, userId: string, id: string) {
  const [s] = await db
    .select()
    .from(studySubjects)
    .where(and(eq(studySubjects.id, id), eq(studySubjects.userId, userId)));
  return s ?? null;
}

export async function countOwnedSubjects(db: DbOrTx, userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .select({ id: studySubjects.id })
    .from(studySubjects)
    .where(and(eq(studySubjects.userId, userId), inArray(studySubjects.id, ids)));
  return rows.length;
}

export async function replacePrerequisites(tx: DbOrTx, userId: string, subjectId: string, prerequisiteIds: string[]): Promise<void> {
  await tx.delete(subjectPrerequisites).where(eq(subjectPrerequisites.subjectId, subjectId));
  if (prerequisiteIds.length) await tx.insert(subjectPrerequisites).values(prerequisiteIds.map((p) => ({ userId, subjectId, prerequisiteId: p })));
}

/** Habilidade com o nome dado (o ramo "Conhecimento" ou a maestria de uma disciplina). */
export async function findSkillByName(db: DbOrTx, userId: string, name: string) {
  const [s] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.name, name)));
  return s ?? null;
}

export async function insertSkill(tx: DbOrTx, values: typeof skills.$inferInsert) {
  const [s] = await tx.insert(skills).values(values).returning();
  return s!;
}

// ------------------------------------------------------------------ Recursos

export async function findResource(db: DbOrTx, userId: string, id: string) {
  const [r] = await db
    .select()
    .from(studyResources)
    .where(and(eq(studyResources.id, id), eq(studyResources.userId, userId)));
  return r ?? null;
}

/** Soma unidades concluídas ao recurso, sem passar do total, e atualiza o estado. */
export async function addCompletedUnits(tx: DbOrTx, resourceId: string, units: number): Promise<void> {
  await tx
    .update(studyResources)
    .set({
      completedUnits: sql`least(${studyResources.totalUnits}, ${studyResources.completedUnits} + ${units})`,
      status: sql`case when ${studyResources.completedUnits} + ${units} >= ${studyResources.totalUnits} then 'completed' else 'in_progress' end`,
      completedAt: sql`case when ${studyResources.completedUnits} + ${units} >= ${studyResources.totalUnits} then now() else null end`,
    })
    .where(eq(studyResources.id, resourceId));
}

// ------------------------------------------------------------------ Sessões

export async function findSessionByExternalId(db: DbOrTx, userId: string, source: RecordSource, externalId: string) {
  const [s] = await db
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.source, source), eq(studySessions.externalId, externalId)));
  return s ?? null;
}

/** Existe sessão manual equivalente (mesma data e disciplina, duração ±10% ou ±5 min)? */
export async function hasEquivalentManualSession(db: DbOrTx, userId: string, subjectId: string, date: string, minutes: number): Promise<boolean> {
  const [row] = await db
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.userId, userId),
        eq(studySessions.subjectId, subjectId),
        eq(studySessions.localDate, date),
        eq(studySessions.source, 'manual'),
        sql`abs(${studySessions.minutes} - ${minutes}) <= greatest(5, ${minutes} * 0.1)`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function insertStudySession(tx: DbOrTx, values: typeof studySessions.$inferInsert) {
  const [s] = await tx.insert(studySessions).values(values).returning();
  return s!;
}

export async function setSessionGrant(tx: DbOrTx, sessionId: string, grantId: string | null): Promise<void> {
  await tx.update(studySessions).set({ grantId }).where(eq(studySessions.id, sessionId));
}

export async function findStudySession(db: DbOrTx, userId: string, id: string) {
  const [s] = await db
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.id, id), eq(studySessions.userId, userId)));
  return s ?? null;
}

export async function deleteStudySessionRow(tx: DbOrTx, id: string): Promise<void> {
  await tx.delete(studySessions).where(eq(studySessions.id, id));
}

export async function listStudySessions(db: DbOrTx, userId: string, limit: number) {
  const rows = await db
    .select({ s: studySessions, subject: studySubjects.name })
    .from(studySessions)
    .innerJoin(studySubjects, eq(studySubjects.id, studySessions.subjectId))
    .where(eq(studySessions.userId, userId))
    .orderBy(desc(studySessions.localDate), desc(studySessions.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.s, subjectName: r.subject }));
}

// ------------------------------------------------------------------ Avaliações e marcos

export async function insertAssessment(tx: DbOrTx, values: typeof assessments.$inferInsert) {
  const [a] = await tx.insert(assessments).values(values).returning();
  return a!;
}

export async function setAssessmentGrant(tx: DbOrTx, id: string, grantId: string): Promise<void> {
  await tx.update(assessments).set({ grantId }).where(eq(assessments.id, id));
}

export function listAssessments(db: DbOrTx, userId: string) {
  return db.select().from(assessments).where(eq(assessments.userId, userId)).orderBy(desc(assessments.localDate));
}

export async function insertSubjectMilestone(tx: DbOrTx, values: typeof subjectMilestones.$inferInsert) {
  const [m] = await tx.insert(subjectMilestones).values(values).returning();
  return m!;
}

export async function setSubjectMilestoneGrant(tx: DbOrTx, id: string, grantId: string): Promise<void> {
  await tx.update(subjectMilestones).set({ grantId }).where(eq(subjectMilestones.id, id));
}

export function listSubjectMilestones(db: DbOrTx, userId: string) {
  return db.select().from(subjectMilestones).where(eq(subjectMilestones.userId, userId)).orderBy(desc(subjectMilestones.achievedOn));
}
