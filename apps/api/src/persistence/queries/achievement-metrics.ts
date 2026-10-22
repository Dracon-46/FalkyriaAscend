import { and, count, eq, isNull, max, sql } from 'drizzle-orm';
import type { AchievementMetric, AchievementMetrics } from '@rpg/engine';
import type { DbOrTx } from '../client';
import {
  activities,
  activityTypes,
  assessments,
  attributes,
  characterProgress,
  goals,
  habitCheckins,
  habits,
  missions,
  pageVisits,
  personalRecords,
  purchases,
  seasons,
  skills,
  studySessions,
  wallets,
} from '../schema';

const num = (v: unknown) => Number(v ?? 0);

/** Calcula as métricas agregadas pedidas a partir do banco (fonte única para todas as conquistas). */
export async function computeMetrics(db: DbOrTx, userId: string, needed: AchievementMetric[]): Promise<AchievementMetrics> {
  const m: AchievementMetrics = {};
  const want = new Set(needed);
  const has = (...k: AchievementMetric[]) => k.some((x) => want.has(x));

  if (has('character_level', 'lifetime_xp')) {
    const [cp] = await db.select().from(characterProgress).where(eq(characterProgress.userId, userId));
    m.character_level = cp?.level ?? 1;
    m.lifetime_xp = cp?.lifetimeXp ?? 0;
  }
  if (has('missions_completed', 'missions_completed_hard_plus', 'missions_completed_epic_plus')) {
    const [r] = await db
      .select({
        all: count(),
        hard: sql<number>`count(*) filter (where ${missions.difficulty} in ('hard','very_hard','epic','legendary'))::int`,
        epic: sql<number>`count(*) filter (where ${missions.difficulty} in ('epic','legendary'))::int`,
      })
      .from(missions)
      .where(and(eq(missions.userId, userId), eq(missions.status, 'completed')));
    m.missions_completed = r?.all ?? 0;
    m.missions_completed_hard_plus = num(r?.hard);
    m.missions_completed_epic_plus = num(r?.epic);
  }
  if (has('habit_checkins')) {
    const [r] = await db
      .select({ n: count() })
      .from(habitCheckins)
      .where(and(eq(habitCheckins.userId, userId), eq(habitCheckins.status, 'done')));
    m.habit_checkins = r?.n ?? 0;
  }
  if (has('best_habit_streak')) {
    const [r] = await db
      .select({ v: max(habits.bestStreak) })
      .from(habits)
      .where(eq(habits.userId, userId));
    m.best_habit_streak = num(r?.v);
  }
  if (has('perfect_weeks')) {
    const res = await db.execute(sql`
      select count(*)::int as n from (
        select date_trunc('week', ${habitCheckins.localDate}) as wk
        from ${habitCheckins}
        where ${habitCheckins.userId} = ${userId}
        group by wk
        having count(*) filter (where ${habitCheckins.status} = 'done') >= 5
           and count(*) filter (where ${habitCheckins.status} = 'missed') = 0
           and (date_trunc('week', min(${habitCheckins.localDate})) + interval '7 days')::date <= current_date
      ) w`);
    m.perfect_weeks = num((res.rows[0] as { n?: number } | undefined)?.n);
  }
  if (has('study_sessions', 'study_minutes')) {
    const [r] = await db
      .select({ n: count(), minutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int` })
      .from(studySessions)
      .where(eq(studySessions.userId, userId));
    m.study_sessions = r?.n ?? 0;
    m.study_minutes = num(r?.minutes);
  }
  if (has('assessments_passed')) {
    const [r] = await db
      .select({ n: count() })
      .from(assessments)
      .where(and(eq(assessments.userId, userId), sql`${assessments.score} >= 0.7 * ${assessments.maxScore}`));
    m.assessments_passed = r?.n ?? 0;
  }
  if (has('training_sessions', 'strength_sessions', 'run_distance_km', 'longest_run_km')) {
    const [r] = await db
      .select({
        n: count(),
        strength: sql<number>`count(*) filter (where ${activityTypes.category} = 'strength')::int`,
        runKm: sql<number>`coalesce(sum(${activities.distanceKm}) filter (where ${activityTypes.category} = 'run'), 0)::float`,
        longest: sql<number>`coalesce(max(${activities.distanceKm}) filter (where ${activityTypes.category} = 'run'), 0)::float`,
      })
      .from(activities)
      .innerJoin(activityTypes, eq(activityTypes.id, activities.typeId))
      .where(and(eq(activities.userId, userId), isNull(activities.deletedAt)));
    m.training_sessions = r?.n ?? 0;
    m.strength_sessions = num(r?.strength);
    m.run_distance_km = num(r?.runKm);
    m.longest_run_km = num(r?.longest);
  }
  if (has('coins_earned')) {
    const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    m.coins_earned = w?.totalEarned ?? 0;
  }
  if (has('purchases')) {
    const [r] = await db
      .select({ n: count() })
      .from(purchases)
      .where(and(eq(purchases.userId, userId), eq(purchases.status, 'completed')));
    m.purchases = r?.n ?? 0;
  }
  if (has('goals_completed')) {
    const [r] = await db
      .select({ n: count() })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.status, 'completed')));
    m.goals_completed = r?.n ?? 0;
  }
  if (has('seasons_completed')) {
    const [r] = await db
      .select({ n: count() })
      .from(seasons)
      .where(and(eq(seasons.userId, userId), eq(seasons.status, 'closed')));
    m.seasons_completed = r?.n ?? 0;
  }
  if (has('attribute_max_level')) {
    const [r] = await db
      .select({ v: max(attributes.level) })
      .from(attributes)
      .where(eq(attributes.userId, userId));
    m.attribute_max_level = num(r?.v);
  }
  if (has('skills_level5')) {
    const [r] = await db
      .select({ n: count() })
      .from(skills)
      .where(and(eq(skills.userId, userId), sql`${skills.level} >= 5`));
    m.skills_level5 = r?.n ?? 0;
  }
  if (has('distinct_pages_visited')) {
    const [r] = await db.select({ n: count() }).from(pageVisits).where(eq(pageVisits.userId, userId));
    m.distinct_pages_visited = r?.n ?? 0;
  }
  if (has('personal_records')) {
    const [r] = await db.select({ n: count() }).from(personalRecords).where(eq(personalRecords.userId, userId));
    m.personal_records = r?.n ?? 0;
  }
  return m;
}
