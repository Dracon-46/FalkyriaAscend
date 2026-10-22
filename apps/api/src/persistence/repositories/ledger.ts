/** Livro-razão de recompensas: cabeçalhos (reward_grants) e linhas de XP de atributos e habilidades. */
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { attributes, grantAttributeXp, grantSkillXp, rewardGrants } from '../schema';

export type NewRewardGrant = typeof rewardGrants.$inferInsert;

/** Insere o cabeçalho; retorna `null` se a chave de idempotência já existir. */
export async function insertGrantIfNew(tx: DbOrTx, values: NewRewardGrant) {
  const inserted = await tx.insert(rewardGrants).values(values).onConflictDoNothing().returning();
  return inserted[0] ?? null;
}

export async function insertGrant(tx: DbOrTx, values: NewRewardGrant) {
  const [row] = await tx.insert(rewardGrants).values(values).returning();
  return row!;
}

export async function findGrantByKey(db: DbOrTx, userId: string, idempotencyKey: string) {
  const [row] = await db
    .select()
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), eq(rewardGrants.idempotencyKey, idempotencyKey)));
  return row ?? null;
}

/** Recompensa ainda não estornada com a chave informada. */
export async function findActiveGrantByKey(db: DbOrTx, userId: string, idempotencyKey: string) {
  const [row] = await db
    .select()
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), eq(rewardGrants.idempotencyKey, idempotencyKey), isNull(rewardGrants.reversedAt)));
  return row ?? null;
}

export async function findGrant(db: DbOrTx, grantId: string) {
  const [row] = await db.select().from(rewardGrants).where(eq(rewardGrants.id, grantId));
  return row ?? null;
}

export async function lockGrant(tx: DbOrTx, userId: string, grantId: string) {
  const [row] = await tx
    .select()
    .from(rewardGrants)
    .where(and(eq(rewardGrants.id, grantId), eq(rewardGrants.userId, userId)))
    .for('update');
  return row ?? null;
}

export async function markGrantReversed(tx: DbOrTx, grantId: string): Promise<void> {
  await tx.update(rewardGrants).set({ reversedAt: new Date() }).where(eq(rewardGrants.id, grantId));
}

export async function insertAttributeXpLine(tx: DbOrTx, line: typeof grantAttributeXp.$inferInsert): Promise<void> {
  await tx.insert(grantAttributeXp).values(line);
}

export async function insertSkillXpLine(tx: DbOrTx, line: typeof grantSkillXp.$inferInsert): Promise<void> {
  await tx.insert(grantSkillXp).values(line);
}

/** Linhas de XP de atributos de uma recompensa, com o código do atributo. */
export function attributeLinesOf(db: DbOrTx, grantId: string) {
  return db
    .select({ code: attributes.code, amount: grantAttributeXp.amount })
    .from(grantAttributeXp)
    .innerJoin(attributes, eq(attributes.id, grantAttributeXp.attributeId))
    .where(eq(grantAttributeXp.grantId, grantId));
}

export function skillLinesOf(db: DbOrTx, grantId: string) {
  return db.select().from(grantSkillXp).where(eq(grantSkillXp.grantId, grantId));
}

/** Recompensas de uma origem (missão, hábito, meta…), em ordem cronológica. */
export function grantsOfSource(db: DbOrTx, userId: string, sourceId: string) {
  return db
    .select()
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), eq(rewardGrants.sourceId, sourceId)))
    .orderBy(asc(rewardGrants.createdAt));
}
