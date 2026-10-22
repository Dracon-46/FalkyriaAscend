import { and, desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { gameConfigs } from '../schema';

export async function findActiveConfig(db: DbOrTx, userId: string) {
  const [row] = await db
    .select()
    .from(gameConfigs)
    .where(and(eq(gameConfigs.userId, userId), eq(gameConfigs.active, true)))
    .limit(1);
  return row ?? null;
}

export async function findLatestConfigVersion(db: DbOrTx, userId: string): Promise<number | null> {
  const [last] = await db
    .select({ version: gameConfigs.version })
    .from(gameConfigs)
    .where(eq(gameConfigs.userId, userId))
    .orderBy(desc(gameConfigs.version))
    .limit(1);
  return last?.version ?? null;
}

/** Desativa as versões anteriores e grava a nova como ativa. */
export async function activateNewConfig(db: DbOrTx, userId: string, version: number, config: unknown, note: string): Promise<void> {
  await db.update(gameConfigs).set({ active: false }).where(eq(gameConfigs.userId, userId));
  await db.insert(gameConfigs).values({ userId, version, config, active: true, note });
}

export function listConfigVersions(db: DbOrTx, userId: string) {
  return db.select().from(gameConfigs).where(eq(gameConfigs.userId, userId)).orderBy(desc(gameConfigs.version));
}
