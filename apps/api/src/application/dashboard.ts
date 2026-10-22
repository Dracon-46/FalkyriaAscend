import { addDays, levelFromXp, nextRank, rankForLevel, startOfIsoWeek } from '@rpg/engine';
import { missionsForDashboard, recentAppliedPenalties, recentFailedMissions, recentGrants, recentPersonalRecords } from '../persistence/queries/dashboard';
import { grantTotalsOn } from '../persistence/queries/stats';
import { listActiveGoals } from '../persistence/repositories/goals';
import { listObjectivesOf } from '../persistence/repositories/missions';
import { findCharacterProgress, listRanks } from '../persistence/repositories/progression';
import { findCurrentSeason } from '../persistence/repositories/seasons';
import { findSettings } from '../persistence/repositories/settings';
import { findUser } from '../persistence/repositories/users';
import { findWallet } from '../persistence/repositories/wallets';
import type { DbOrTx } from '../persistence/unit-of-work';
import { nextAchievements } from './achievements';
import { getActiveConfig } from './config';
import { currentMultiplier } from './gameplay';
import { computeGoalProgress } from './goals';
import { habitsForDay } from './habits';
import { seasonOverview } from './seasons';
import { equippedItems } from './shop';
import { attributeRadar, productivity, progression } from './stats';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export async function characterSummary(db: DbOrTx, userId: string, today: string) {
  const { config } = await getActiveConfig(db, userId);
  const cp = await findCharacterProgress(db, userId);
  const w = await findWallet(db, userId);
  const u = await findUser(db, userId);
  const rankRows = await listRanks(db, userId);
  const state = levelFromXp(cp?.lifetimeXp ?? 0, config.curves.character);
  const equipped = await equippedItems(db, userId);
  const mult = await currentMultiplier(db, userId, today, config);
  const title = equipped.find((e) => e.item.kind === 'title');
  const frame = equipped.find((e) => e.item.kind === 'frame');
  const effect = equipped.find((e) => e.item.kind === 'effect');
  const badge = equipped.find((e) => e.item.kind === 'badge');
  return {
    name: u?.displayName ?? '',
    characterClass: u?.characterClass ?? null,
    level: state,
    rank: rankForLevel(state.level, rankRows),
    nextRank: nextRank(state.level, rankRows),
    coins: w?.balance ?? 0,
    wallet: w,
    multiplier: mult,
    equipped: {
      title: (title?.item.payload as { title?: string } | undefined)?.title ?? null,
      frame: frame ? { name: frame.item.name, color: (frame.item.payload as { color?: string }).color ?? null } : null,
      effect: (effect?.item.payload as { effect?: string } | undefined)?.effect ?? null,
      badge: badge ? { name: badge.item.name, icon: badge.item.icon } : null,
    },
    configVersion: config.version,
  };
}

export async function buildDashboard(db: DbOrTx, userId: string, today: string) {
  const settings = await findSettings(db, userId);
  const periodDays = settings?.dashboardWidgets?.periodDays ?? 30;
  const character = await characterSummary(db, userId, today);

  const active = await missionsForDashboard(db, userId, today);
  const objectives = await listObjectivesOf(
    db,
    active.map((m) => m.id),
  );
  const withObjectives = active
    .filter((m) => !m.isSecret || m.status === 'completed')
    .map((m) => ({ ...m, objectives: objectives.filter((o) => o.missionId === m.id) }));
  const todayMissions = withObjectives.filter(
    (m) => m.type === 'daily' || m.dueDate === today || (m.status === 'completed' && m.completedOn === today && m.type !== 'weekly'),
  );
  const weeklyMissions = withObjectives.filter((m) => m.type === 'weekly' && m.status !== 'completed');

  const alerts: Array<{ kind: string; title: string; link: string; date?: string | null }> = [];
  for (const m of withObjectives) {
    if (m.dueDate && m.dueDate <= addDays(today, 1) && ['available', 'in_progress'].includes(m.status)) {
      alerts.push({ kind: m.dueDate === today ? 'due_today' : 'due_tomorrow', title: m.title, link: `/missoes/${m.id}`, date: m.dueDate });
    }
  }
  for (const m of await recentFailedMissions(db, userId, addDays(today, -3)))
    alerts.push({ kind: m.status, title: m.title, link: `/missoes/${m.id}`, date: m.dueDate });
  for (const p of await recentAppliedPenalties(db, userId, addDays(today, -3))) {
    alerts.push({
      kind: 'penalty',
      title: `${p.sourceTitle}: ${p.type === 'coin_loss' ? `−${p.amount} moedas` : p.type}`,
      link: '/historico?aba=penalidades',
      date: p.localDate,
    });
  }

  const goalRows = await listActiveGoals(db, userId);
  const priorityGoals = (await Promise.all(goalRows.map(async (g) => ({ ...g, ...(await computeGoalProgress(db, g, today)) }))))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
    .slice(0, 4)
    .map((g) => ({ id: g.id, title: g.title, priority: g.priority, deadline: g.deadline, progress: g.progress, blocked: g.blockedBy.length > 0 }));

  const habitsToday = await habitsForDay(db, userId, today);
  const streaks = [...habitsToday]
    .filter((h) => h.currentStreak > 0)
    .sort((a, b) => b.currentStreak - a.currentStreak)
    .slice(0, 5)
    .map((h) => ({ id: h.id, title: h.title, current: h.currentStreak, best: h.bestStreak, frequency: h.frequency }));

  const weekly = await progression(db, userId, { from: addDays(startOfIsoWeek(today), -7 * 7), to: today, granularity: 'week' });
  const daily = await progression(db, userId, { from: addDays(today, -(periodDays - 1)), to: today, granularity: 'day' });
  const prod = await productivity(db, userId, { from: addDays(today, -(periodDays - 1)), to: today, granularity: 'week' });
  const season = await findCurrentSeason(db, userId);

  return {
    today,
    periodDays,
    widgets: settings?.dashboardWidgets?.widgets ?? null,
    character,
    todayTotals: await grantTotalsOn(db, userId, today),
    todayMissions,
    weeklyMissions,
    alerts,
    priorityGoals,
    habitsToday,
    streaks,
    recent: await recentGrants(db, userId),
    nextAchievements: await nextAchievements(db, userId, 4),
    weeklyXp: weekly.series,
    dailySeries: daily.series,
    projection: daily.projection,
    effort: prod.effort,
    radar: await attributeRadar(db, userId, today, 30),
    season: season ? await seasonOverview(db, season, today) : null,
    records: await recentPersonalRecords(db, userId, addDays(today, -30)),
  };
}
