/** Projeções de progressão: personagem, atributos, habilidades, níveis alcançados e marcos. */
import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { attributes, characterProgress, levelHistory, levelRewards, ranks, skills } from '../schema';

// ------------------------------------------------------------------ Personagem

export async function findCharacterProgress(db: DbOrTx, userId: string) {
  const [cp] = await db.select().from(characterProgress).where(eq(characterProgress.userId, userId));
  return cp ?? null;
}

/** Bloqueia a projeção do personagem (criando-a se necessário) para serializar subidas de nível. */
export async function lockCharacterProgress(tx: DbOrTx, userId: string) {
  await tx.insert(characterProgress).values({ userId }).onConflictDoNothing();
  const [cp] = await tx.select().from(characterProgress).where(eq(characterProgress.userId, userId)).for('update');
  return cp!;
}

export async function updateCharacterProgress(tx: DbOrTx, userId: string, patch: { lifetimeXp?: number; level: number }): Promise<void> {
  await tx
    .update(characterProgress)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(characterProgress.userId, userId));
}

/** Registra o nível alcançado; retorna `null` se ele já havia sido alcançado antes. */
export async function insertLevelReachedIfNew(tx: DbOrTx, values: typeof levelHistory.$inferInsert) {
  const rows = await tx.insert(levelHistory).values(values).onConflictDoNothing().returning();
  return rows[0] ?? null;
}

export async function findLevelReward(db: DbOrTx, userId: string, level: number) {
  const [row] = await db
    .select()
    .from(levelRewards)
    .where(and(eq(levelRewards.userId, userId), eq(levelRewards.level, level)));
  return row ?? null;
}

export function listRanks(db: DbOrTx, userId: string) {
  return db.select().from(ranks).where(eq(ranks.userId, userId));
}

// ------------------------------------------------------------------ Atributos

export function listAttributes(db: DbOrTx, userId: string) {
  return db.select().from(attributes).where(eq(attributes.userId, userId));
}

export function lockAttributesByCode(tx: DbOrTx, userId: string, codes: string[]) {
  return tx
    .select()
    .from(attributes)
    .where(and(eq(attributes.userId, userId), inArray(attributes.code, codes)))
    .for('update');
}

export async function setAttributeXp(tx: DbOrTx, attributeId: string, xp: number, level: number): Promise<void> {
  await tx.update(attributes).set({ xp, level }).where(eq(attributes.id, attributeId));
}

export async function setAttributeLevel(tx: DbOrTx, attributeId: string, level: number): Promise<void> {
  await tx.update(attributes).set({ level }).where(eq(attributes.id, attributeId));
}

// ------------------------------------------------------------------ Habilidades

export function listSkills(db: DbOrTx, userId: string) {
  return db.select().from(skills).where(eq(skills.userId, userId));
}

export async function findSkill(db: DbOrTx, skillId: string) {
  const [s] = await db.select().from(skills).where(eq(skills.id, skillId));
  return s ?? null;
}

export function lockSkillsById(tx: DbOrTx, userId: string, ids: string[]) {
  return tx
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), inArray(skills.id, ids)))
    .for('update');
}

export async function setSkillXp(tx: DbOrTx, skillId: string, xp: number, level: number): Promise<void> {
  await tx.update(skills).set({ xp, level }).where(eq(skills.id, skillId));
}

export async function setSkillLevel(tx: DbOrTx, skillId: string, level: number): Promise<void> {
  await tx.update(skills).set({ level }).where(eq(skills.id, skillId));
}
