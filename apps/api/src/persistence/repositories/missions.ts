/** Missões: agregado com objetivos, regras de penalidade vinculadas, eventos e modelos recorrentes. */
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { missionEvents, missionObjectives, missionPenaltyRules, missions, missionTemplates } from '../schema';

export type NewMission = typeof missions.$inferInsert;
export type MissionPatch = Partial<Omit<NewMission, 'id' | 'userId'>>;
export type NewObjective = typeof missionObjectives.$inferInsert;
export type ObjectivePatch = Partial<Omit<NewObjective, 'id' | 'userId' | 'missionId'>>;
type MissionStatus = (typeof missions.$inferSelect)['status'];
type MissionType = (typeof missions.$inferSelect)['type'];

const OPEN: MissionStatus[] = ['available', 'in_progress'];

export interface MissionFilter {
  statuses?: MissionStatus[];
  type?: MissionType;
  goalId?: string;
  titleContains?: string;
}

// ------------------------------------------------------------------ Leitura

export async function findMission(db: DbOrTx, userId: string, id: string) {
  const [m] = await db
    .select()
    .from(missions)
    .where(and(eq(missions.id, id), eq(missions.userId, userId)));
  return m ?? null;
}

export async function lockMission(tx: DbOrTx, userId: string, id: string) {
  const [m] = await tx
    .select()
    .from(missions)
    .where(and(eq(missions.id, id), eq(missions.userId, userId)))
    .for('update');
  return m ?? null;
}

export function listMissions(db: DbOrTx, userId: string, f: MissionFilter, limit = 300) {
  const conds: SQL[] = [eq(missions.userId, userId)];
  if (f.statuses?.length) conds.push(inArray(missions.status, f.statuses));
  if (f.type) conds.push(eq(missions.type, f.type));
  if (f.goalId) conds.push(eq(missions.goalId, f.goalId));
  if (f.titleContains) conds.push(sql`${missions.title} ilike ${'%' + f.titleContains + '%'}`);
  return db
    .select()
    .from(missions)
    .where(and(...conds))
    .orderBy(desc(missions.priority), asc(missions.dueDate), desc(missions.createdAt))
    .limit(limit);
}

/** Missões disponíveis ou em andamento. */
export function listOpenMissions(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(missions)
    .where(and(eq(missions.userId, userId), inArray(missions.status, OPEN)));
}

/** Missões abertas ainda não concluídas (para avisos de prazo). */
export function listOpenUncompletedMissions(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(missions)
    .where(and(eq(missions.userId, userId), inArray(missions.status, OPEN), isNull(missions.completedAt)));
}

export function listOpenMissionsDueOn(db: DbOrTx, userId: string, date: string) {
  return db
    .select()
    .from(missions)
    .where(and(eq(missions.userId, userId), inArray(missions.status, OPEN), eq(missions.dueDate, date)));
}

export async function activeMissionIdsInCategory(db: DbOrTx, userId: string, categoryId: string): Promise<string[]> {
  const rows = await db
    .select({ id: missions.id })
    .from(missions)
    .where(and(eq(missions.userId, userId), eq(missions.categoryId, categoryId), inArray(missions.status, OPEN)));
  return rows.map((r) => r.id);
}

export function listMissionsOfGoal(db: DbOrTx, goalId: string) {
  return db.select({ id: missions.id, title: missions.title, status: missions.status }).from(missions).where(eq(missions.goalId, goalId));
}

/** Últimos desfechos (concluída/falha/expirada) de uma série recorrente, do mais recente ao mais antigo. */
export function recentOutcomesOfSeries(db: DbOrTx, templateId: string, limit = 10) {
  return db
    .select({ status: missions.status })
    .from(missions)
    .where(and(eq(missions.templateId, templateId), inArray(missions.status, ['completed', 'failed', 'expired'])))
    .orderBy(desc(missions.dueDate))
    .limit(limit);
}

// ------------------------------------------------------------------ Escrita

/** Insere a missão; retorna `null` se a instância recorrente do período já existir. */
export async function insertMissionIfNew(tx: DbOrTx, values: NewMission) {
  const rows = await tx.insert(missions).values(values).onConflictDoNothing().returning();
  return rows[0] ?? null;
}

export async function updateMissionRow(tx: DbOrTx, id: string, patch: MissionPatch) {
  const [u] = await tx
    .update(missions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(missions.id, id))
    .returning();
  return u!;
}

// ------------------------------------------------------------------ Objetivos

export function listObjectives(db: DbOrTx, missionId: string) {
  return db.select().from(missionObjectives).where(eq(missionObjectives.missionId, missionId)).orderBy(asc(missionObjectives.sortOrder));
}

export async function listObjectivesOf(db: DbOrTx, missionIds: string[]) {
  if (missionIds.length === 0) return [];
  return db.select().from(missionObjectives).where(inArray(missionObjectives.missionId, missionIds)).orderBy(asc(missionObjectives.sortOrder));
}

export async function findObjective(db: DbOrTx, missionId: string, objectiveId: string) {
  const [o] = await db
    .select()
    .from(missionObjectives)
    .where(and(eq(missionObjectives.id, objectiveId), eq(missionObjectives.missionId, missionId)));
  return o ?? null;
}

export async function insertObjectives(tx: DbOrTx, rows: NewObjective[]): Promise<void> {
  if (rows.length) await tx.insert(missionObjectives).values(rows);
}

export async function updateObjective(tx: DbOrTx, objectiveId: string, patch: ObjectivePatch): Promise<void> {
  await tx.update(missionObjectives).set(patch).where(eq(missionObjectives.id, objectiveId));
}

export async function deleteObjectives(tx: DbOrTx, ids: string[]): Promise<void> {
  if (ids.length) await tx.delete(missionObjectives).where(inArray(missionObjectives.id, ids));
}

// ------------------------------------------------------------------ Regras de penalidade e eventos

export async function ruleIdsOfMission(db: DbOrTx, missionId: string): Promise<string[]> {
  const rows = await db.select({ ruleId: missionPenaltyRules.ruleId }).from(missionPenaltyRules).where(eq(missionPenaltyRules.missionId, missionId));
  return rows.map((r) => r.ruleId);
}

export async function missionHasPenaltyRules(db: DbOrTx, missionId: string): Promise<boolean> {
  const rows = await db.select({ id: missionPenaltyRules.ruleId }).from(missionPenaltyRules).where(eq(missionPenaltyRules.missionId, missionId)).limit(1);
  return rows.length > 0;
}

/** Substitui as regras vinculadas à missão. */
export async function replaceMissionRules(tx: DbOrTx, userId: string, missionId: string, ruleIds: string[]): Promise<void> {
  await tx.delete(missionPenaltyRules).where(eq(missionPenaltyRules.missionId, missionId));
  if (ruleIds.length) await tx.insert(missionPenaltyRules).values(ruleIds.map((ruleId) => ({ userId, missionId, ruleId })));
}

export async function insertMissionEvent(tx: DbOrTx, values: typeof missionEvents.$inferInsert): Promise<void> {
  await tx.insert(missionEvents).values(values);
}

export function listMissionEvents(db: DbOrTx, missionId: string) {
  return db.select().from(missionEvents).where(eq(missionEvents.missionId, missionId)).orderBy(asc(missionEvents.createdAt));
}

// ------------------------------------------------------------------ Modelos recorrentes

export function listActiveTemplates(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(missionTemplates)
    .where(and(eq(missionTemplates.userId, userId), eq(missionTemplates.active, true)));
}
