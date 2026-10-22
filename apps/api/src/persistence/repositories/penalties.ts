/** Regras de penalidade e penalidades aplicadas. */
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { habitPenaltyRules, missionObjectives, missionPenaltyRules, penaltyApplications, penaltyRules } from '../schema';

export async function findRulesOwnedBy(db: DbOrTx, userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(penaltyRules)
    .where(and(eq(penaltyRules.userId, userId), inArray(penaltyRules.id, ids)));
}

export async function rulesOfMission(db: DbOrTx, missionId: string) {
  const rows = await db
    .select({ r: penaltyRules })
    .from(missionPenaltyRules)
    .innerJoin(penaltyRules, eq(penaltyRules.id, missionPenaltyRules.ruleId))
    .where(eq(missionPenaltyRules.missionId, missionId));
  return rows.map((r) => r.r);
}

export async function rulesOfHabit(db: DbOrTx, habitId: string) {
  const rows = await db
    .select({ r: penaltyRules })
    .from(habitPenaltyRules)
    .innerJoin(penaltyRules, eq(penaltyRules.id, habitPenaltyRules.ruleId))
    .where(eq(habitPenaltyRules.habitId, habitId));
  return rows.map((r) => r.r);
}

/** Registra a aplicação; retorna `null` se a mesma regra já foi aplicada à mesma ocorrência. */
export async function insertApplicationIfNew(tx: DbOrTx, values: typeof penaltyApplications.$inferInsert) {
  const rows = await tx.insert(penaltyApplications).values(values).onConflictDoNothing().returning();
  return rows[0] ?? null;
}

export async function lockApplication(tx: DbOrTx, userId: string, penaltyId: string) {
  const [app] = await tx
    .select()
    .from(penaltyApplications)
    .where(and(eq(penaltyApplications.id, penaltyId), eq(penaltyApplications.userId, userId)))
    .for('update');
  return app ?? null;
}

export async function markApplicationReversed(tx: DbOrTx, penaltyId: string, reason: string) {
  const [u] = await tx
    .update(penaltyApplications)
    .set({ status: 'reversed', reversedAt: new Date(), reversalReason: reason })
    .where(eq(penaltyApplications.id, penaltyId))
    .returning();
  return u!;
}

/** Bloqueios de itens (reward_lock) ainda vigentes em `today`. */
export function activeRewardLocks(db: DbOrTx, userId: string, today: string) {
  return db
    .select({ itemId: penaltyApplications.targetItemId, until: penaltyApplications.expiresOn })
    .from(penaltyApplications)
    .where(
      and(
        eq(penaltyApplications.userId, userId),
        eq(penaltyApplications.type, 'reward_lock'),
        eq(penaltyApplications.status, 'applied'),
        gte(penaltyApplications.expiresOn, today),
      ),
    );
}

/** Soma das reduções de multiplicador vigentes em `today`. */
export async function activeMultiplierReduction(db: DbOrTx, userId: string, today: string): Promise<number> {
  const [damp] = await db
    .select({ total: sql<number>`coalesce(sum(${penaltyApplications.reductionPct}), 0)::float` })
    .from(penaltyApplications)
    .where(
      and(
        eq(penaltyApplications.userId, userId),
        eq(penaltyApplications.type, 'multiplier_reduction'),
        eq(penaltyApplications.status, 'applied'),
        gte(penaltyApplications.expiresOn, today),
        lte(penaltyApplications.localDate, today),
      ),
    );
  return damp?.total ?? 0;
}

/** Reduz o progresso de objetivos manuais das missões informadas (nunca abaixo de zero). */
export async function reduceManualObjectives(tx: DbOrTx, missionIds: string[], amount: number): Promise<void> {
  if (missionIds.length === 0) return;
  await tx
    .update(missionObjectives)
    .set({ current: sql`greatest(0, ${missionObjectives.current} - ${amount})` })
    .where(and(inArray(missionObjectives.missionId, missionIds), eq(missionObjectives.metric, 'manual')));
}

/** Penalidades aplicadas a uma origem (missão ou hábito), da mais recente para a mais antiga. */
export function applicationsOfSource(db: DbOrTx, userId: string, sourceId: string) {
  return db
    .select()
    .from(penaltyApplications)
    .where(and(eq(penaltyApplications.userId, userId), eq(penaltyApplications.sourceId, sourceId)))
    .orderBy(desc(penaltyApplications.localDate));
}
