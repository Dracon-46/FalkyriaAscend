/** Conexões com serviços externos (credenciais cifradas) e eventos recebidos. */
import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { integrationConnections, integrationEvents } from '../schema';

type Connection = typeof integrationConnections.$inferSelect;
export type Provider = Connection['provider'];
export type ConnectionPatch = Partial<Omit<typeof integrationConnections.$inferInsert, 'id' | 'userId' | 'provider'>>;
export type EventStatus = (typeof integrationEvents.$inferSelect)['status'];

export async function findConnection(db: DbOrTx, userId: string, provider: Provider) {
  const [c] = await db
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.userId, userId), eq(integrationConnections.provider, provider)));
  return c ?? null;
}

export function listConnections(db: DbOrTx, userId: string) {
  return db.select().from(integrationConnections).where(eq(integrationConnections.userId, userId));
}

export async function findStravaConnectionByAthlete(db: DbOrTx, athleteId: string) {
  const [c] = await db
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.provider, 'strava'), eq(integrationConnections.externalAccountId, athleteId)));
  return c ?? null;
}

export async function updateConnection(db: DbOrTx, id: string, patch: ConnectionPatch) {
  const [c] = await db
    .update(integrationConnections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(integrationConnections.id, id))
    .returning();
  return c!;
}

export async function updateConnectionOf(db: DbOrTx, userId: string, provider: Provider, patch: ConnectionPatch): Promise<void> {
  await db
    .update(integrationConnections)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(integrationConnections.userId, userId), eq(integrationConnections.provider, provider)));
}

/** Cria a conexão ou, se já existir para o provedor, aplica `onExisting`. */
export async function upsertConnection(db: DbOrTx, userId: string, provider: Provider, values: ConnectionPatch, onExisting: ConnectionPatch): Promise<void> {
  await db
    .insert(integrationConnections)
    .values({ userId, provider, ...values })
    .onConflictDoUpdate({ target: [integrationConnections.userId, integrationConnections.provider], set: { ...onExisting, updatedAt: new Date() } });
}

// ------------------------------------------------------------------ Eventos

/** Eventos recentes, do mais antigo ao mais recente. */
export async function recentEvents(db: DbOrTx, userId: string, limit = 50) {
  const rows = await db.select().from(integrationEvents).where(eq(integrationEvents.userId, userId)).orderBy(integrationEvents.receivedAt).limit(limit);
  return rows.reverse();
}

/** Registra o evento; retorna `null` se a chave de deduplicação já existir. */
export async function insertEventIfNew(db: DbOrTx, values: typeof integrationEvents.$inferInsert) {
  const rows = await db.insert(integrationEvents).values(values).onConflictDoNothing().returning();
  return rows[0] ?? null;
}

export async function markEvent(db: DbOrTx, id: string, status: EventStatus, error: string | null = null): Promise<void> {
  await db.update(integrationEvents).set({ status, error, processedAt: new Date() }).where(eq(integrationEvents.id, id));
}
