/** Temporadas e suas recompensas por limiar de XP sazonal. */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { seasonRewards, seasons } from '../schema';

export type NewSeason = typeof seasons.$inferInsert;
export type SeasonPatch = Partial<Omit<NewSeason, 'id' | 'userId'>>;
export type SeasonRewardValues = Pick<typeof seasonRewards.$inferInsert, 'title' | 'thresholdXp' | 'coins' | 'itemId'>;

export async function findSeason(db: DbOrTx, userId: string, id: string) {
  const [s] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.id, id), eq(seasons.userId, userId)));
  return s ?? null;
}

export async function lockSeason(tx: DbOrTx, userId: string, id: string) {
  const [s] = await tx
    .select()
    .from(seasons)
    .where(and(eq(seasons.id, id), eq(seasons.userId, userId)))
    .for('update');
  return s ?? null;
}

/** Temporadas do usuário, da mais recente para a mais antiga. */
export function listSeasons(db: DbOrTx, userId: string) {
  return db.select().from(seasons).where(eq(seasons.userId, userId)).orderBy(desc(seasons.startDate));
}

/** Temporada ativa que termina primeiro. */
export async function findCurrentSeason(db: DbOrTx, userId: string) {
  const [s] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.userId, userId), eq(seasons.status, 'active')))
    .orderBy(asc(seasons.endDate))
    .limit(1);
  return s ?? null;
}

export async function insertSeason(tx: DbOrTx, values: NewSeason) {
  const [s] = await tx.insert(seasons).values(values).returning();
  return s!;
}

export async function updateSeasonRow(tx: DbOrTx, id: string, patch: SeasonPatch) {
  const [s] = await tx.update(seasons).set(patch).where(eq(seasons.id, id)).returning();
  return s!;
}

// ------------------------------------------------------------------ Recompensas sazonais

export function listRewardsOfUser(db: DbOrTx, userId: string) {
  return db.select().from(seasonRewards).where(eq(seasonRewards.userId, userId)).orderBy(asc(seasonRewards.thresholdXp));
}

export function listRewardsOfSeason(db: DbOrTx, seasonId: string) {
  return db.select().from(seasonRewards).where(eq(seasonRewards.seasonId, seasonId)).orderBy(asc(seasonRewards.thresholdXp));
}

export function listUnclaimedRewards(db: DbOrTx, seasonId: string) {
  return db
    .select()
    .from(seasonRewards)
    .where(and(eq(seasonRewards.seasonId, seasonId), isNull(seasonRewards.claimedAt)));
}

export async function insertSeasonReward(tx: DbOrTx, userId: string, seasonId: string, values: SeasonRewardValues): Promise<void> {
  await tx.insert(seasonRewards).values({ ...values, userId, seasonId });
}

export async function updateSeasonReward(tx: DbOrTx, id: string, values: SeasonRewardValues): Promise<void> {
  await tx.update(seasonRewards).set(values).where(eq(seasonRewards.id, id));
}

export async function deleteSeasonRewards(tx: DbOrTx, ids: string[]): Promise<void> {
  if (ids.length) await tx.delete(seasonRewards).where(inArray(seasonRewards.id, ids));
}

export async function markSeasonRewardClaimed(tx: DbOrTx, id: string, grantId: string | null): Promise<void> {
  await tx.update(seasonRewards).set({ claimedAt: new Date(), grantId }).where(eq(seasonRewards.id, id));
}

export function listActiveSeasons(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(seasons)
    .where(and(eq(seasons.userId, userId), eq(seasons.status, 'active')));
}
