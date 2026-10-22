import { and, count, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { addDays, consistencyMultiplier, type GameConfig, type XpSource } from '@rpg/engine';
import type { DbOrTx } from '../persistence/client';
import { habitCheckins, missions, penaltyApplications, rewardGrants } from '../persistence/schema';

/** Recompensas efetivas = não estornadas e que não são estornos. */
export const effectiveGrant = and(isNull(rewardGrants.reversedAt), isNull(rewardGrants.reversalOf));

/** XP geral recebido no dia local, por origem (para limites diários). */
export async function xpTodayBySource(tx: DbOrTx, userId: string, localDate: string): Promise<Partial<Record<XpSource, number>>> {
  const rows = await tx
    .select({ source: rewardGrants.xpSource, xp: sql<number>`coalesce(sum(${rewardGrants.xp}), 0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), eq(rewardGrants.localDate, localDate), effectiveGrant))
    .groupBy(rewardGrants.xpSource);
  return Object.fromEntries(rows.map((r) => [r.source, r.xp]));
}

/** Quantidade de missões Difícil ou superior concluídas (e recompensadas) no dia. */
export async function hardMissionsCompletedToday(tx: DbOrTx, userId: string, localDate: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(rewardGrants)
    .innerJoin(missions, eq(missions.id, rewardGrants.sourceId))
    .where(
      and(
        eq(rewardGrants.userId, userId),
        eq(rewardGrants.sourceType, 'mission'),
        eq(rewardGrants.localDate, localDate),
        effectiveGrant,
        inArray(missions.difficulty, ['hard', 'very_hard', 'epic', 'legendary']),
      ),
    );
  return row?.n ?? 0;
}

export interface MultiplierState {
  multiplier: number;
  completed: number;
  scheduled: number;
  dampening: number;
}

/**
 * Multiplicador de consistência: taxa de hábitos cumpridos na janela configurada
 * (cumpridos / (cumpridos + falhas + falhas toleradas)), reduzido por penalidades ativas.
 */
export async function currentMultiplier(tx: DbOrTx, userId: string, today: string, cfg: GameConfig): Promise<MultiplierState> {
  const from = addDays(today, -cfg.consistency.windowDays);
  const rows = await tx
    .select({ status: habitCheckins.status, n: count() })
    .from(habitCheckins)
    .where(and(eq(habitCheckins.userId, userId), gte(habitCheckins.localDate, from), lte(habitCheckins.localDate, today)))
    .groupBy(habitCheckins.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const completed = by.done ?? 0;
  const scheduled = completed + (by.missed ?? 0) + (by.tolerated ?? 0);
  const [damp] = await tx
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
  const dampening = damp?.total ?? 0;
  return { multiplier: consistencyMultiplier({ completed, scheduled, dampening }, cfg.consistency), completed, scheduled, dampening };
}
