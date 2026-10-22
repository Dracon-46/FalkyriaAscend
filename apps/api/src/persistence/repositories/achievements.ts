/** Definições de conquistas e desbloqueios do usuário. */
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { achievements, userAchievements } from '../schema';

export function listActiveAchievements(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(achievements)
    .where(and(eq(achievements.userId, userId), isNull(achievements.archivedAt)))
    .orderBy(asc(achievements.sortOrder));
}

/** Conquistas ativas ainda não desbloqueadas (opcionalmente só as não secretas). */
export async function listLockedAchievements(db: DbOrTx, userId: string, opts: { includeSecret: boolean }) {
  const rows = await db
    .select({ a: achievements })
    .from(achievements)
    .leftJoin(userAchievements, and(eq(userAchievements.achievementId, achievements.id), eq(userAchievements.userId, userId)))
    .where(
      and(
        eq(achievements.userId, userId),
        isNull(achievements.archivedAt),
        isNull(userAchievements.id),
        ...(opts.includeSecret ? [] : [eq(achievements.secret, false)]),
      ),
    );
  return rows.map((r) => r.a);
}

export function listUnlocks(db: DbOrTx, userId: string) {
  return db.select().from(userAchievements).where(eq(userAchievements.userId, userId));
}

export async function hasUnlocked(db: DbOrTx, userId: string, achievementId: string): Promise<boolean> {
  const [ua] = await db
    .select({ id: userAchievements.id })
    .from(userAchievements)
    .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, achievementId)));
  return Boolean(ua);
}

/** Registra o desbloqueio; retorna `null` se já estava desbloqueada. */
export async function insertUnlockIfNew(tx: DbOrTx, values: typeof userAchievements.$inferInsert) {
  const rows = await tx.insert(userAchievements).values(values).onConflictDoNothing().returning();
  return rows[0] ?? null;
}

export async function setUnlockGrant(tx: DbOrTx, unlockId: string, grantId: string): Promise<void> {
  await tx.update(userAchievements).set({ grantId }).where(eq(userAchievements.id, unlockId));
}

export async function findUnlock(db: DbOrTx, userId: string, unlockId: string) {
  const [ua] = await db
    .select()
    .from(userAchievements)
    .where(and(eq(userAchievements.id, unlockId), eq(userAchievements.userId, userId)));
  return ua ?? null;
}

export async function deleteUnlock(tx: DbOrTx, unlockId: string): Promise<void> {
  await tx.delete(userAchievements).where(eq(userAchievements.id, unlockId));
}
