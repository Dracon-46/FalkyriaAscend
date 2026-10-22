import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { userSettings } from '../schema';

export type SettingsPatch = Partial<Omit<typeof userSettings.$inferInsert, 'userId'>>;

export async function findSettings(db: DbOrTx, userId: string) {
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return s ?? null;
}

export async function lockSettings(tx: DbOrTx, userId: string) {
  const [s] = await tx.select().from(userSettings).where(eq(userSettings.userId, userId)).for('update');
  return s ?? null;
}

export async function updateSettings(db: DbOrTx, userId: string, patch: SettingsPatch) {
  const [s] = await db
    .update(userSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId))
    .returning();
  return s ?? null;
}

export async function insertDefaultSettings(db: DbOrTx, values: typeof userSettings.$inferInsert): Promise<void> {
  await db.insert(userSettings).values(values).onConflictDoNothing();
}
