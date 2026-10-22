import type { SeasonInput } from '@rpg/contracts';
import { addDays } from '@rpg/engine';
import type { Season } from '../../persistence/models';
import {
  deleteSeasonRewards,
  insertSeason,
  insertSeasonReward,
  listRewardsOfSeason,
  listRewardsOfUser,
  listSeasons,
  lockSeason,
  updateSeasonReward,
  updateSeasonRow,
} from '../../persistence/repositories/seasons';
import { inTransaction, type Db } from '../../persistence/unit-of-work';
import { badRequest, conflict, notFound } from '../../shared/errors';
import { audit } from '../audit';
import { afterAction } from '../hooks';
import { todayFor } from '../time';
import { assertOwned } from '../validation';
import { advanceSeasons, claimSeasonRewards, closeSeason, seasonStats } from '../seasons';

// ------------------------------------------------------------------ Casos de uso

/** Lista as temporadas (avançando estados antes) com estatísticas e recompensas. */
export async function seasonsView(db: Db, userId: string, now: Date) {
  const today = await todayFor(db, userId, now);
  await inTransaction(db, (tx) => advanceSeasons(tx, userId, today));
  const list = await listSeasons(db, userId);
  const rewards = await listRewardsOfUser(db, userId);
  return Promise.all(
    list.map(async (s) => ({
      ...s,
      stats: s.status === 'closed' ? s.summary : await seasonStats(db, s, today),
      rewards: rewards.filter((r) => r.seasonId === s.id),
    })),
  );
}

/** Cria (id = null) ou atualiza uma temporada e suas recompensas; recompensas já resgatadas são imutáveis. */
export async function saveSeason(db: Db, userId: string, data: SeasonInput, id: string | null, now: Date) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => {
    if (data.endDate < data.startDate) throw badRequest('A temporada deve terminar após começar.');
    const { rewards, ...rest } = data;
    let row: Season;
    if (id) {
      const prev = await lockSeason(tx, userId, id);
      if (!prev) throw notFound('Temporada');
      if (prev.status === 'closed') throw conflict('Temporada encerrada não pode ser editada.');
      row = await updateSeasonRow(tx, id, rest);
    } else {
      row = await insertSeason(tx, { ...rest, userId, status: data.startDate <= today ? 'active' : 'planned' });
    }
    const existing = await listRewardsOfSeason(tx, row.id);
    const keep = new Set(rewards.map((r) => r.id).filter(Boolean) as string[]);
    await deleteSeasonRewards(
      tx,
      existing.filter((e) => !keep.has(e.id) && !e.claimedAt).map((e) => e.id),
    );
    for (const r of rewards) {
      await assertOwned(tx, 'items', r.itemId, userId, 'Item');
      const prev = existing.find((e) => e.id === r.id);
      if (prev?.claimedAt) continue; // recompensas já resgatadas são imutáveis
      const values = { title: r.title, thresholdXp: r.thresholdXp, coins: r.coins, itemId: r.itemId ?? null };
      if (prev) await updateSeasonReward(tx, prev.id, values);
      else await insertSeasonReward(tx, userId, row.id, values);
    }
    await audit(tx, { actorId: userId, userId, action: id ? 'update' : 'create', entityType: 'seasons', entityId: row.id, after: { ...row, rewards } });
    await claimSeasonRewards(tx, row, today);
    return row;
  });
}

/** Encerra antecipadamente: fecha a temporada ontem, preservando todo o progresso vitalício. */
export async function closeSeasonNow(db: Db, userId: string, id: string, now: Date) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => {
    const s = await lockSeason(tx, userId, id);
    if (!s) throw notFound('Temporada');
    if (s.status === 'closed') throw conflict('Temporada já encerrada.');
    await closeSeason(tx, s, addDays(today, -1));
    await afterAction(tx, userId, today);
    return (await lockSeason(tx, userId, id))!;
  });
}
