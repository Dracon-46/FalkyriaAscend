/** Treinos: tipos de atividade, atividades, séries, recordes pessoais e registros rápidos. */
import { and, asc, desc, eq, ilike, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { activities, activitySets, activityTypes, attributes, exercises, personalRecords, quickLogs } from '../schema';

type RecordSource = (typeof activities.$inferSelect)['source'];

export async function findActivityType(db: DbOrTx, userId: string, id: string) {
  const [t] = await db.select().from(activityTypes).where(and(eq(activityTypes.id, id), eq(activityTypes.userId, userId)));
  return t ?? null;
}

export async function countOwnedExercises(db: DbOrTx, userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db.select({ id: exercises.id }).from(exercises).where(and(eq(exercises.userId, userId), inArray(exercises.id, ids)));
  return rows.length;
}

// ------------------------------------------------------------------ Atividades

export async function findActivityByExternalId(db: DbOrTx, userId: string, source: RecordSource, externalId: string) {
  const [a] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.source, source), eq(activities.externalId, externalId)));
  return a ?? null;
}

/** Atividade manual equivalente (mesmo tipo e data, duração ±10% ou ±5 min), não excluída. */
export async function findEquivalentManualActivity(db: DbOrTx, userId: string, typeId: string, date: string, durationMin: number) {
  const [a] = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.typeId, typeId),
        eq(activities.localDate, date),
        eq(activities.source, 'manual'),
        isNull(activities.deletedAt),
        sql`abs(${activities.durationMin} - ${durationMin}) <= greatest(5, ${durationMin} * 0.1)`,
      ),
    )
    .limit(1);
  return a ?? null;
}

export async function insertActivity(tx: DbOrTx, values: typeof activities.$inferInsert) {
  const [a] = await tx.insert(activities).values(values).returning();
  return a!;
}

export async function updateActivity(tx: DbOrTx, id: string, patch: Partial<Omit<typeof activities.$inferInsert, 'id' | 'userId'>>) {
  const [a] = await tx
    .update(activities)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(activities.id, id))
    .returning();
  return a!;
}

export async function lockActivity(tx: DbOrTx, userId: string, id: string) {
  const [a] = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .for('update');
  return a ?? null;
}

export async function insertSets(tx: DbOrTx, rows: Array<typeof activitySets.$inferInsert>): Promise<void> {
  if (rows.length) await tx.insert(activitySets).values(rows);
}

/** Atividades não excluídas com tipo, categoria e séries. */
export async function listActivitiesWithSets(db: DbOrTx, userId: string, limit: number) {
  const rows = await db
    .select({ a: activities, typeName: activityTypes.name, category: activityTypes.category })
    .from(activities)
    .innerJoin(activityTypes, eq(activityTypes.id, activities.typeId))
    .where(and(eq(activities.userId, userId), isNull(activities.deletedAt)))
    .orderBy(desc(activities.localDate), desc(activities.createdAt))
    .limit(limit);
  const sets = rows.length
    ? await db
        .select({ s: activitySets, exercise: exercises.name })
        .from(activitySets)
        .innerJoin(exercises, eq(exercises.id, activitySets.exerciseId))
        .where(inArray(activitySets.activityId, rows.map((r) => r.a.id)))
        .orderBy(asc(activitySets.setIndex))
    : [];
  return { rows, sets };
}

// ------------------------------------------------------------------ Recordes

/** Melhor valor já registrado de um tipo de recorde (opcionalmente por exercício). */
export async function bestRecordValue(db: DbOrTx, userId: string, kind: string, exerciseId: string | null): Promise<number | null> {
  const conds: SQL[] = [eq(personalRecords.userId, userId), eq(personalRecords.kind, kind)];
  if (exerciseId) conds.push(eq(personalRecords.exerciseId, exerciseId));
  const [r] = await db.select().from(personalRecords).where(and(...conds)).orderBy(desc(personalRecords.value)).limit(1);
  return r ? Number(r.value) : null;
}

export async function insertPersonalRecord(tx: DbOrTx, values: typeof personalRecords.$inferInsert): Promise<void> {
  await tx.insert(personalRecords).values(values);
}

export async function deleteRecordsOfActivity(tx: DbOrTx, activityId: string): Promise<void> {
  await tx.delete(personalRecords).where(eq(personalRecords.activityId, activityId));
}

export async function listPersonalRecords(db: DbOrTx, userId: string) {
  const rows = await db
    .select({ r: personalRecords, exercise: exercises.name })
    .from(personalRecords)
    .leftJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
    .where(eq(personalRecords.userId, userId))
    .orderBy(desc(personalRecords.achievedOn));
  return rows.map((x) => ({ ...x.r, exerciseName: x.exercise }));
}

// ------------------------------------------------------------------ Registro rápido

export async function findAttributeByCode(db: DbOrTx, userId: string, code: string) {
  const [a] = await db.select().from(attributes).where(and(eq(attributes.userId, userId), eq(attributes.code, code)));
  return a ?? null;
}

/** Quantas vezes a mesma tarefa (chave normalizada) já foi registrada no dia. */
export async function countQuickLogsOn(db: DbOrTx, userId: string, date: string, key: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quickLogs)
    .where(and(eq(quickLogs.userId, userId), eq(quickLogs.localDate, date), eq(quickLogs.normalizedKey, key)));
  return r?.n ?? 0;
}

export async function insertQuickLog(tx: DbOrTx, values: typeof quickLogs.$inferInsert) {
  const [q] = await tx.insert(quickLogs).values(values).returning();
  return q!;
}

export async function setQuickLogGrant(tx: DbOrTx, id: string, grantId: string): Promise<void> {
  await tx.update(quickLogs).set({ grantId }).where(eq(quickLogs.id, id));
}

export async function setActivityGrant(tx: DbOrTx, id: string, grantId: string): Promise<void> {
  await tx.update(activities).set({ grantId }).where(eq(activities.id, id));
}

export function listQuickLogs(db: DbOrTx, userId: string, limit = 50) {
  return db.select().from(quickLogs).where(eq(quickLogs.userId, userId)).orderBy(desc(quickLogs.createdAt)).limit(limit);
}

// ------------------------------------------------------------------ Integrações

export async function findActivityTypeByCategory(db: DbOrTx, userId: string, category: (typeof activityTypes.$inferSelect)['category']) {
  const [t] = await db
    .select({ id: activityTypes.id })
    .from(activityTypes)
    .where(and(eq(activityTypes.userId, userId), eq(activityTypes.category, category)))
    .limit(1);
  return t ?? null;
}

/** Exercício com o nome informado (sem diferenciar maiúsculas), criando-o se não existir. */
export async function findOrCreateExercise(tx: DbOrTx, userId: string, name: string): Promise<string> {
  const [e] = await tx.select({ id: exercises.id }).from(exercises).where(and(eq(exercises.userId, userId), ilike(exercises.name, name))).limit(1);
  if (e) return e.id;
  const [created] = await tx.insert(exercises).values({ userId, name, muscleGroup: 'importado' }).returning({ id: exercises.id });
  return created!.id;
}

export function listActivitiesFromSource(db: DbOrTx, userId: string, source: RecordSource) {
  return db.select().from(activities).where(and(eq(activities.userId, userId), eq(activities.source, source)));
}
