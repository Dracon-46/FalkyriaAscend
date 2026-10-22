import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { notifications } from '../schema';

export type NewNotification = typeof notifications.$inferInsert;

/** Insere uma notificação; a chave de deduplicação impede repetições do mesmo evento. */
export async function insertNotification(db: DbOrTx, values: NewNotification): Promise<void> {
  await db.insert(notifications).values(values).onConflictDoNothing();
}

export function listNotifications(db: DbOrTx, userId: string, limit = 100) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function countUnreadNotifications(db: DbOrTx, userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function markNotificationsRead(db: DbOrTx, userId: string, id?: string): Promise<void> {
  const where = id
    ? and(eq(notifications.userId, userId), eq(notifications.id, id))
    : and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}
