import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { computeFixedReward } from '@rpg/engine';
import type { DbOrTx } from '../persistence/client';
import { habitCheckins, missions, rewardGrants, seasonRewards, seasons } from '../persistence/schema';
import { getActiveConfig } from './config';
import { effectiveGrant } from './gameplay';
import { notify } from './notifications';
import { giveItem, grantReward } from './rewards';

type Season = typeof seasons.$inferSelect;

/**
 * Estatísticas de uma temporada: XP sazonal é a soma das recompensas no período.
 * É uma visão separada da progressão vitalícia — encerrar a temporada não apaga nada.
 */
export async function seasonStats(db: DbOrTx, s: Season, today: string) {
  const to = s.endDate < today ? s.endDate : today;
  const [xp] = await db
    .select({ xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int`, coins: sql<number>`coalesce(sum(${rewardGrants.coins}),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, s.userId), gte(rewardGrants.localDate, s.startDate), lte(rewardGrants.localDate, to), effectiveGrant));
  const [done] = await db
    .select({ n: count() })
    .from(missions)
    .where(and(eq(missions.userId, s.userId), eq(missions.status, 'completed'), gte(missions.completedOn, s.startDate), lte(missions.completedOn, to)));
  const [habitsDone] = await db
    .select({ n: count() })
    .from(habitCheckins)
    .where(and(eq(habitCheckins.userId, s.userId), eq(habitCheckins.status, 'done'), gte(habitCheckins.localDate, s.startDate), lte(habitCheckins.localDate, to)));
  const bySource = await db
    .select({ source: rewardGrants.xpSource, xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, s.userId), gte(rewardGrants.localDate, s.startDate), lte(rewardGrants.localDate, to), effectiveGrant))
    .groupBy(rewardGrants.xpSource);
  return { seasonXp: xp?.xp ?? 0, seasonCoins: xp?.coins ?? 0, missionsCompleted: done?.n ?? 0, habitsDone: habitsDone?.n ?? 0, bySource };
}

/** Recompensas sazonais por limiar de XP (cada uma resgatada no máximo uma vez). */
export async function claimSeasonRewards(tx: DbOrTx, s: Season, today: string) {
  if (s.status === 'planned') return [];
  const stats = await seasonStats(tx, s, today);
  const pending = await tx.select().from(seasonRewards).where(and(eq(seasonRewards.seasonId, s.id), sql`${seasonRewards.claimedAt} is null`));
  const { config } = await getActiveConfig(tx, s.userId);
  const claimed: string[] = [];
  for (const r of pending.sort((a, b) => a.thresholdXp - b.thresholdXp)) {
    if (stats.seasonXp < r.thresholdXp) continue;
    let grantId: string | null = null;
    if (r.coins > 0) {
      const g = await grantReward(tx, {
        userId: s.userId,
        idempotencyKey: `season-reward:${r.id}`,
        sourceType: 'season',
        sourceId: s.id,
        xpSource: 'season',
        title: `Temporada ${s.name}: ${r.title}`,
        localDate: today,
        reward: computeFixedReward({ xp: 0, coins: r.coins, label: `Recompensa sazonal (${r.thresholdXp} XP na temporada)` }, config),
      });
      grantId = g.grantId;
    }
    if (r.itemId) await giveItem(tx, s.userId, r.itemId, 'season', `Temporada ${s.name}`);
    await tx.update(seasonRewards).set({ claimedAt: new Date(), grantId }).where(eq(seasonRewards.id, r.id));
    claimed.push(r.title);
  }
  return claimed;
}

/** Ativa temporadas que começaram e encerra as que terminaram, gravando o resumo final. */
export async function advanceSeasons(tx: DbOrTx, userId: string, today: string) {
  const list = await tx.select().from(seasons).where(eq(seasons.userId, userId)).orderBy(desc(seasons.startDate));
  for (const s of list) {
    if (s.status === 'planned' && s.startDate <= today) {
      await tx.update(seasons).set({ status: 'active' }).where(eq(seasons.id, s.id));
      await notify(tx, userId, { category: 'season', title: `Temporada iniciada: ${s.name}`, link: '/temporadas', dedupeKey: `season-start:${s.id}` });
    }
    if (s.status !== 'closed' && s.endDate < today) await closeSeason(tx, s, s.endDate);
  }
}

/** Encerramento (manual ou automático): resgata recompensas, grava o resumo e fecha. Nada é apagado. */
export async function closeSeason(tx: DbOrTx, s: Season, endDate: string) {
  const end = endDate < s.startDate ? s.startDate : endDate;
  await tx.update(seasons).set({ endDate: end }).where(eq(seasons.id, s.id));
  const season = { ...s, endDate: end, status: 'active' as const };
  await claimSeasonRewards(tx, season, end);
  const summary = await seasonStats(tx, season, end);
  await tx.update(seasons).set({ status: 'closed', closedAt: new Date(), summary }).where(eq(seasons.id, s.id));
  await notify(tx, s.userId, {
    category: 'season',
    title: `Temporada encerrada: ${s.name}`,
    body: `${summary.seasonXp} XP sazonal · ${summary.missionsCompleted} missões`,
    link: '/temporadas',
    dedupeKey: `season-end:${s.id}`,
  });
  return summary;
}
