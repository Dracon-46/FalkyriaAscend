import { computeFixedReward } from '@rpg/engine';
import type { Season } from '../persistence/models';
import { periodTotals } from '../persistence/queries/period-totals';
import {
  listRewardsOfSeason,
  listSeasons,
  listUnclaimedRewards,
  markSeasonRewardClaimed,
  updateSeasonRow,
} from '../persistence/repositories/seasons';
import { type DbOrTx } from '../persistence/unit-of-work';
import { getActiveConfig } from './config';
import { notify } from './notifications';
import { giveItem, grantReward } from './rewards';

/**
 * Estatísticas de uma temporada: XP sazonal é a soma das recompensas no período.
 * É uma visão separada da progressão vitalícia — encerrar a temporada não apaga nada.
 */
export async function seasonStats(db: DbOrTx, s: Season, today: string) {
  const t = await periodTotals(db, s.userId, s.startDate, s.endDate < today ? s.endDate : today);
  return { seasonXp: t.xp, seasonCoins: t.coins, missionsCompleted: t.missionsCompleted, habitsDone: t.habitsDone, bySource: t.bySource };
}

/** Recompensas sazonais por limiar de XP (cada uma resgatada no máximo uma vez). */
export async function claimSeasonRewards(tx: DbOrTx, s: Season, today: string) {
  if (s.status === 'planned') return [];
  const stats = await seasonStats(tx, s, today);
  const pending = await listUnclaimedRewards(tx, s.id);
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
    await markSeasonRewardClaimed(tx, r.id, grantId);
    claimed.push(r.title);
  }
  return claimed;
}

/** Ativa temporadas que começaram e encerra as que terminaram, gravando o resumo final. */
export async function advanceSeasons(tx: DbOrTx, userId: string, today: string) {
  for (const s of await listSeasons(tx, userId)) {
    if (s.status === 'planned' && s.startDate <= today) {
      await updateSeasonRow(tx, s.id, { status: 'active' });
      await notify(tx, userId, { category: 'season', title: `Temporada iniciada: ${s.name}`, link: '/temporadas', dedupeKey: `season-start:${s.id}` });
    }
    if (s.status !== 'closed' && s.endDate < today) await closeSeason(tx, s, s.endDate);
  }
}

/** Encerramento (manual ou automático): resgata recompensas, grava o resumo e fecha. Nada é apagado. */
export async function closeSeason(tx: DbOrTx, s: Season, endDate: string) {
  const end = endDate < s.startDate ? s.startDate : endDate;
  await updateSeasonRow(tx, s.id, { endDate: end });
  const season = { ...s, endDate: end, status: 'active' as const };
  await claimSeasonRewards(tx, season, end);
  const summary = await seasonStats(tx, season, end);
  await updateSeasonRow(tx, s.id, { status: 'closed', closedAt: new Date(), summary });
  await notify(tx, s.userId, {
    category: 'season',
    title: `Temporada encerrada: ${s.name}`,
    body: `${summary.seasonXp} XP sazonal · ${summary.missionsCompleted} missões`,
    link: '/temporadas',
    dedupeKey: `season-end:${s.id}`,
  });
  return summary;
}

/** Temporada com estatísticas e recompensas (para o painel). */
export async function seasonOverview(db: DbOrTx, s: Season, today: string) {
  return {
    ...s,
    stats: await seasonStats(db, s, today),
    rewards: await listRewardsOfSeason(db, s.id),
    daysLeft: Math.max(0, Math.round((Date.parse(s.endDate) - Date.parse(today)) / 86_400_000)),
  };
}
