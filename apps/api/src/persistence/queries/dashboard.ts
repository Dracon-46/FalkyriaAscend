/** Read model do painel: listas curtas e recentes que só a tela inicial consome. */
import { and, asc, desc, eq, gte, inArray, or } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { missions, penaltyApplications, personalRecords, rewardGrants } from '../schema';

/** Missões abertas ou suspensas, mais as concluídas hoje. */
export function missionsForDashboard(db: DbOrTx, userId: string, today: string) {
  return db
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.userId, userId),
        or(inArray(missions.status, ['available', 'in_progress', 'suspended']), and(eq(missions.status, 'completed'), eq(missions.completedOn, today))),
      ),
    )
    .orderBy(desc(missions.priority), asc(missions.dueDate));
}

/** Missões que falharam ou expiraram com prazo a partir de `since`. */
export function recentFailedMissions(db: DbOrTx, userId: string, since: string) {
  return db
    .select()
    .from(missions)
    .where(and(eq(missions.userId, userId), inArray(missions.status, ['failed', 'expired']), gte(missions.dueDate, since)));
}

export function recentAppliedPenalties(db: DbOrTx, userId: string, since: string, limit = 5) {
  return db
    .select()
    .from(penaltyApplications)
    .where(and(eq(penaltyApplications.userId, userId), eq(penaltyApplications.status, 'applied'), gte(penaltyApplications.localDate, since)))
    .orderBy(desc(penaltyApplications.createdAt))
    .limit(limit);
}

export function recentGrants(db: DbOrTx, userId: string, limit = 10) {
  return db.select().from(rewardGrants).where(eq(rewardGrants.userId, userId)).orderBy(desc(rewardGrants.createdAt)).limit(limit);
}

export function recentPersonalRecords(db: DbOrTx, userId: string, since: string, limit = 5) {
  return db
    .select()
    .from(personalRecords)
    .where(and(eq(personalRecords.userId, userId), gte(personalRecords.achievedOn, since)))
    .orderBy(desc(personalRecords.createdAt))
    .limit(limit);
}
