import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  achievementCriteriaSchema,
  addDays,
  evaluateAchievement,
  isScheduledOn,
  levelFromXp,
  metricsNeeded,
  nextRank,
  rankForLevel,
  startOfIsoWeek,
} from '@rpg/engine';
import type { DbOrTx } from '../persistence/client';
import {
  achievements,
  characterProgress,
  goals,
  habitCheckins,
  habits,
  missionObjectives,
  missions,
  penaltyApplications,
  personalRecords,
  ranks,
  rewardGrants,
  seasonRewards,
  seasons,
  userAchievements,
  userSettings,
  users,
  wallets,
} from '../persistence/schema';
import { computeMetrics } from './achievements';
import { getActiveConfig } from './config';
import { currentMultiplier } from './gameplay';
import { computeGoalProgress } from './goals';
import { scheduleOf } from './habits';
import { seasonStats } from './seasons';
import { equippedItems } from './shop';
import { attributeRadar, productivity, progression } from './stats';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export async function characterSummary(db: DbOrTx, userId: string, today: string) {
  const { config } = await getActiveConfig(db, userId);
  const [cp] = await db.select().from(characterProgress).where(eq(characterProgress.userId, userId));
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const rankRows = await db.select().from(ranks).where(eq(ranks.userId, userId));
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
    wallet: w ?? null,
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

export async function habitsForDay(db: DbOrTx, userId: string, today: string) {
  const list = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), inArray(habits.status, ['active', 'paused'])))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt));
  const monday = startOfIsoWeek(today);
  const checkins = await db
    .select()
    .from(habitCheckins)
    .where(and(eq(habitCheckins.userId, userId), gte(habitCheckins.localDate, addDays(today, -13)), lte(habitCheckins.localDate, today)));
  return list.map((h) => {
    const mine = checkins.filter((c) => c.habitId === h.id);
    const todayCheckin = mine.find((c) => c.localDate === today) ?? null;
    const weekDone = mine.filter((c) => c.localDate >= monday && c.status === 'done').length;
    const scheduledToday = h.frequency === 'times_per_week' ? weekDone < h.timesPerWeek || todayCheckin !== null : isScheduledOn(scheduleOf(h), today);
    const last14 = Array.from({ length: 14 }, (_, i) => {
      const d = addDays(today, i - 13);
      const c = mine.find((x) => x.localDate === d);
      return { date: d, status: c?.status ?? (h.frequency !== 'times_per_week' && isScheduledOn(scheduleOf(h), d) ? (d === today ? 'pending' : 'none') : 'off') };
    });
    return { ...h, scheduledToday, todayStatus: todayCheckin?.status ?? null, weekDone, last14 };
  });
}

export async function buildDashboard(db: DbOrTx, userId: string, today: string) {
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const periodDays = settings?.dashboardWidgets?.periodDays ?? 30;
  const character = await characterSummary(db, userId, today);

  const active = await db
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.userId, userId),
        or(inArray(missions.status, ['available', 'in_progress', 'suspended']), and(eq(missions.status, 'completed'), eq(missions.completedOn, today))),
      ),
    )
    .orderBy(desc(missions.priority), asc(missions.dueDate));
  const objectives = active.length
    ? await db.select().from(missionObjectives).where(inArray(missionObjectives.missionId, active.map((m) => m.id))).orderBy(asc(missionObjectives.sortOrder))
    : [];
  const withObjectives = active
    .filter((m) => !m.isSecret || m.status === 'completed')
    .map((m) => ({ ...m, objectives: objectives.filter((o) => o.missionId === m.id) }));
  const todayMissions = withObjectives.filter((m) => m.type === 'daily' || m.dueDate === today || (m.status === 'completed' && m.completedOn === today && m.type !== 'weekly'));
  const weeklyMissions = withObjectives.filter((m) => m.type === 'weekly' && m.status !== 'completed');

  const alerts: Array<{ kind: string; title: string; link: string; date?: string | null }> = [];
  for (const m of withObjectives) {
    if (m.dueDate && m.dueDate <= addDays(today, 1) && ['available', 'in_progress'].includes(m.status)) {
      alerts.push({ kind: m.dueDate === today ? 'due_today' : 'due_tomorrow', title: m.title, link: `/missoes/${m.id}`, date: m.dueDate });
    }
  }
  const recentFailures = await db
    .select()
    .from(missions)
    .where(and(eq(missions.userId, userId), inArray(missions.status, ['failed', 'expired']), gte(missions.dueDate, addDays(today, -3))));
  for (const m of recentFailures) alerts.push({ kind: m.status, title: m.title, link: `/missoes/${m.id}`, date: m.dueDate });
  const recentPenalties = await db
    .select()
    .from(penaltyApplications)
    .where(and(eq(penaltyApplications.userId, userId), eq(penaltyApplications.status, 'applied'), gte(penaltyApplications.localDate, addDays(today, -3))))
    .orderBy(desc(penaltyApplications.createdAt))
    .limit(5);
  for (const p of recentPenalties) alerts.push({ kind: 'penalty', title: `${p.sourceTitle}: ${p.type === 'coin_loss' ? `−${p.amount} moedas` : p.type}`, link: '/historico?aba=penalidades', date: p.localDate });

  const goalRows = await db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.status, 'active')));
  const priorityGoals = (
    await Promise.all(goalRows.map(async (g) => ({ ...g, ...(await computeGoalProgress(db, g, today)) })))
  )
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
    .slice(0, 4)
    .map((g) => ({ id: g.id, title: g.title, priority: g.priority, deadline: g.deadline, progress: g.progress, blocked: g.blockedBy.length > 0 }));

  const habitsToday = await habitsForDay(db, userId, today);
  const streaks = [...habitsToday].filter((h) => h.currentStreak > 0).sort((a, b) => b.currentStreak - a.currentStreak).slice(0, 5)
    .map((h) => ({ id: h.id, title: h.title, current: h.currentStreak, best: h.bestStreak, frequency: h.frequency }));

  const recent = await db.select().from(rewardGrants).where(eq(rewardGrants.userId, userId)).orderBy(desc(rewardGrants.createdAt)).limit(10);

  const lockedAch = await db
    .select({ a: achievements })
    .from(achievements)
    .leftJoin(userAchievements, and(eq(userAchievements.achievementId, achievements.id), eq(userAchievements.userId, userId)))
    .where(and(eq(achievements.userId, userId), isNull(achievements.archivedAt), isNull(userAchievements.id), eq(achievements.secret, false)));
  const parsed = lockedAch.map(({ a }) => ({ a, c: achievementCriteriaSchema.safeParse(a.criteria) })).filter((x) => x.c.success);
  const metrics = await computeMetrics(db, userId, metricsNeeded(parsed.map((p) => p.c.data!)));
  const nextAchievements = parsed
    .map(({ a, c }) => ({ id: a.id, name: a.name, description: a.description, icon: a.icon, rarity: a.rarity, ...evaluateAchievement(c.data!, metrics) }))
    .sort((x, y) => y.progress - x.progress)
    .slice(0, 4);

  const weekly = await progression(db, userId, { from: addDays(startOfIsoWeek(today), -7 * 7), to: today, granularity: 'week' });
  const daily = await progression(db, userId, { from: addDays(today, -(periodDays - 1)), to: today, granularity: 'day' });
  const prod = await productivity(db, userId, { from: addDays(today, -(periodDays - 1)), to: today, granularity: 'week' });
  const radar = await attributeRadar(db, userId, today, 30);

  const [season] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.userId, userId), eq(seasons.status, 'active')))
    .orderBy(asc(seasons.endDate))
    .limit(1);
  const seasonInfo = season
    ? {
        ...season,
        stats: await seasonStats(db, season, today),
        rewards: await db.select().from(seasonRewards).where(eq(seasonRewards.seasonId, season.id)).orderBy(asc(seasonRewards.thresholdXp)),
        daysLeft: Math.max(0, Math.round((Date.parse(season.endDate) - Date.parse(today)) / 86_400_000)),
      }
    : null;

  const records = await db
    .select()
    .from(personalRecords)
    .where(and(eq(personalRecords.userId, userId), gte(personalRecords.achievedOn, addDays(today, -30))))
    .orderBy(desc(personalRecords.createdAt))
    .limit(5);

  const [todayXp] = await db
    .select({ xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int`, coins: sql<number>`coalesce(sum(${rewardGrants.coins}),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), eq(rewardGrants.localDate, today)));

  return {
    today,
    periodDays,
    widgets: settings?.dashboardWidgets?.widgets ?? null,
    character,
    todayTotals: todayXp ?? { xp: 0, coins: 0 },
    todayMissions,
    weeklyMissions,
    alerts,
    priorityGoals,
    habitsToday,
    streaks,
    recent,
    nextAchievements,
    weeklyXp: weekly.series,
    dailySeries: daily.series,
    projection: daily.projection,
    effort: prod.effort,
    radar,
    season: seasonInfo,
    records,
  };
}
