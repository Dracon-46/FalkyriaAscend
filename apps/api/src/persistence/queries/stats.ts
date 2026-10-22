/**
 * Read model de estatísticas: agregações por período (dia/semana/mês) sobre o livro-razão e os registros.
 * Retorna linhas brutas; preencher lacunas, acumular e projetar é papel da aplicação.
 */
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import {
  activities,
  activityTypes,
  attributes,
  categories,
  coinTransactions,
  grantAttributeXp,
  habitCheckins,
  items,
  levelHistory,
  missions,
  penaltyApplications,
  purchases,
  rewardGrants,
  skills,
  studySessions,
  studySubjects,
} from '../schema';
import { effectiveGrant } from './ledger-filters';

export type Granularity = 'day' | 'week' | 'month';
export interface DateRange {
  from: string;
  to: string;
}

const GRANULARITY_SQL: Record<Granularity, string> = { day: "'day'", week: "'week'", month: "'month'" };
/** A granularidade vem de um enum validado e é inserida como literal para que GROUP BY reconheça a expressão. */
const bucket = (col: unknown, g: Granularity) => sql<string>`to_char(date_trunc(${sql.raw(GRANULARITY_SQL[g])}, ${col}::timestamp), 'YYYY-MM-DD')`;

const grantsBetween = (userId: string, r: DateRange) =>
  and(eq(rewardGrants.userId, userId), gte(rewardGrants.localDate, r.from), lte(rewardGrants.localDate, r.to));

// ------------------------------------------------------------------ Progressão

/** XP e moedas (positivas) por período, sem estornos (que anulam a recompensa original na mesma data). */
export function xpByPeriod(db: DbOrTx, userId: string, r: DateRange, g: Granularity) {
  const p = bucket(rewardGrants.localDate, g);
  return db
    .select({
      period: p,
      xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int`,
      coins: sql<number>`coalesce(sum(greatest(${rewardGrants.coins},0)),0)::int`,
    })
    .from(rewardGrants)
    .where(and(grantsBetween(userId, r), isNull(rewardGrants.reversedAt), isNull(rewardGrants.reversalOf)))
    .groupBy(p);
}

/** XP efetivo acumulado antes de uma data. */
export async function xpBefore(db: DbOrTx, userId: string, date: string): Promise<number> {
  const [row] = await db
    .select({ xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), sql`${rewardGrants.localDate} < ${date}`, effectiveGrant));
  return row?.xp ?? 0;
}

/** XP efetivo total no intervalo. */
export async function xpBetween(db: DbOrTx, userId: string, r: DateRange): Promise<number> {
  const [row] = await db
    .select({ xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` })
    .from(rewardGrants)
    .where(and(grantsBetween(userId, r), effectiveGrant));
  return row?.xp ?? 0;
}

export function xpBySource(db: DbOrTx, userId: string, r: DateRange) {
  return db
    .select({ source: rewardGrants.xpSource, xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` })
    .from(rewardGrants)
    .where(and(grantsBetween(userId, r), effectiveGrant))
    .groupBy(rewardGrants.xpSource);
}

export function levelsReached(db: DbOrTx, userId: string) {
  return db
    .select({ level: levelHistory.level, reachedAt: levelHistory.reachedAt })
    .from(levelHistory)
    .where(eq(levelHistory.userId, userId))
    .orderBy(asc(levelHistory.level));
}

/** Soma de XP e moedas (positivas e negativas) lançados numa data local. */
export async function grantTotalsOn(db: DbOrTx, userId: string, date: string) {
  const [row] = await db
    .select({ xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int`, coins: sql<number>`coalesce(sum(${rewardGrants.coins}),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), eq(rewardGrants.localDate, date)));
  return row ?? { xp: 0, coins: 0 };
}

// ------------------------------------------------------------------ Atributos e maestria

export function activeAttributes(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(attributes)
    .where(and(eq(attributes.userId, userId), isNull(attributes.archivedAt)))
    .orderBy(asc(attributes.sortOrder));
}

export function activeSkills(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), isNull(skills.archivedAt)))
    .orderBy(asc(skills.sortOrder));
}

/** XP de cada atributo acumulado até uma data (reconstruído do livro-razão). */
export function attributeXpUntil(db: DbOrTx, userId: string, date: string) {
  return db
    .select({ attributeId: grantAttributeXp.attributeId, xp: sql<number>`coalesce(sum(${grantAttributeXp.amount}),0)::int` })
    .from(grantAttributeXp)
    .innerJoin(rewardGrants, eq(rewardGrants.id, grantAttributeXp.grantId))
    .where(and(eq(grantAttributeXp.userId, userId), lte(rewardGrants.localDate, date)))
    .groupBy(grantAttributeXp.attributeId);
}

/** XP de atributos por período até a data final (inclui períodos anteriores para o acumulado). */
export function attributeXpByPeriod(db: DbOrTx, userId: string, to: string, g: Granularity) {
  const p = bucket(rewardGrants.localDate, g);
  return db
    .select({ period: p, attributeId: grantAttributeXp.attributeId, xp: sql<number>`coalesce(sum(${grantAttributeXp.amount}),0)::int` })
    .from(grantAttributeXp)
    .innerJoin(rewardGrants, eq(rewardGrants.id, grantAttributeXp.grantId))
    .where(and(eq(grantAttributeXp.userId, userId), lte(rewardGrants.localDate, to)))
    .groupBy(p, grantAttributeXp.attributeId);
}

// ------------------------------------------------------------------ Produtividade

export function missionOutcomesByPeriod(db: DbOrTx, userId: string, r: DateRange, g: Granularity) {
  const pm = bucket(sql`coalesce(${missions.completedOn}, ${missions.dueDate})`, g);
  return db
    .select({
      period: pm,
      completed: sql<number>`count(*) filter (where ${missions.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${missions.status} in ('failed','expired'))::int`,
    })
    .from(missions)
    .where(
      and(
        eq(missions.userId, userId),
        sql`coalesce(${missions.completedOn}, ${missions.dueDate}) between ${r.from} and ${r.to}`,
        sql`${missions.status} in ('completed','failed','expired')`,
      ),
    )
    .groupBy(pm);
}

export function habitOutcomesByPeriod(db: DbOrTx, userId: string, r: DateRange, g: Granularity) {
  const ph = bucket(habitCheckins.localDate, g);
  return db
    .select({
      period: ph,
      done: sql<number>`count(*) filter (where ${habitCheckins.status} = 'done')::int`,
      missed: sql<number>`count(*) filter (where ${habitCheckins.status} = 'missed')::int`,
      tolerated: sql<number>`count(*) filter (where ${habitCheckins.status} = 'tolerated')::int`,
      excused: sql<number>`count(*) filter (where ${habitCheckins.status} in ('excused','rest'))::int`,
    })
    .from(habitCheckins)
    .where(and(eq(habitCheckins.userId, userId), gte(habitCheckins.localDate, r.from), lte(habitCheckins.localDate, r.to)))
    .groupBy(ph);
}

export function studyByPeriod(db: DbOrTx, userId: string, r: DateRange, g: Granularity) {
  const ps = bucket(studySessions.localDate, g);
  return db
    .select({ period: ps, studyMinutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int`, studySessions: sql<number>`count(*)::int` })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), gte(studySessions.localDate, r.from), lte(studySessions.localDate, r.to)))
    .groupBy(ps);
}

export function trainingByPeriod(db: DbOrTx, userId: string, r: DateRange, g: Granularity) {
  const pa = bucket(activities.localDate, g);
  return db
    .select({
      period: pa,
      trainingSessions: sql<number>`count(*)::int`,
      trainingMinutes: sql<number>`coalesce(sum(${activities.durationMin}),0)::int`,
      distanceKm: sql<number>`coalesce(sum(${activities.distanceKm}),0)::float`,
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), isNull(activities.deletedAt), gte(activities.localDate, r.from), lte(activities.localDate, r.to)))
    .groupBy(pa);
}

/** XP efetivo por categoria (ou origem, quando sem categoria). */
export function effortByCategory(db: DbOrTx, userId: string, r: DateRange) {
  return db
    .select({
      categoryId: rewardGrants.categoryId,
      name: categories.name,
      color: categories.color,
      source: rewardGrants.xpSource,
      xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int`,
    })
    .from(rewardGrants)
    .leftJoin(categories, eq(categories.id, rewardGrants.categoryId))
    .where(and(grantsBetween(userId, r), effectiveGrant))
    .groupBy(rewardGrants.categoryId, categories.name, categories.color, rewardGrants.xpSource);
}

export function studyMinutesBySubject(db: DbOrTx, userId: string, r: DateRange) {
  return db
    .select({ subject: studySubjects.name, color: studySubjects.color, minutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int` })
    .from(studySessions)
    .innerJoin(studySubjects, eq(studySubjects.id, studySessions.subjectId))
    .where(and(eq(studySessions.userId, userId), gte(studySessions.localDate, r.from), lte(studySessions.localDate, r.to)))
    .groupBy(studySubjects.name, studySubjects.color);
}

export function trainingByType(db: DbOrTx, userId: string, r: DateRange) {
  return db
    .select({ type: activityTypes.name, sessions: sql<number>`count(*)::int`, minutes: sql<number>`coalesce(sum(${activities.durationMin}),0)::int` })
    .from(activities)
    .innerJoin(activityTypes, eq(activityTypes.id, activities.typeId))
    .where(and(eq(activities.userId, userId), isNull(activities.deletedAt), gte(activities.localDate, r.from), lte(activities.localDate, r.to)))
    .groupBy(activityTypes.name);
}

// ------------------------------------------------------------------ Economia

export function coinFlowByPeriod(db: DbOrTx, userId: string, r: DateRange, g: Granularity) {
  const p = bucket(coinTransactions.localDate, g);
  return db
    .select({
      period: p,
      earned: sql<number>`coalesce(sum(${coinTransactions.amount}) filter (where ${coinTransactions.kind} = 'earn' or (${coinTransactions.kind} = 'adjustment' and ${coinTransactions.amount} > 0)),0)::int`,
      spent: sql<number>`coalesce(-sum(${coinTransactions.amount}) filter (where ${coinTransactions.kind} = 'spend'),0)::int`,
      penalties: sql<number>`coalesce(-sum(${coinTransactions.amount}) filter (where ${coinTransactions.kind} = 'penalty'),0)::int`,
      corrections: sql<number>`coalesce(sum(${coinTransactions.amount}) filter (where ${coinTransactions.kind} in ('reversal','refund') or (${coinTransactions.kind} = 'adjustment' and ${coinTransactions.amount} < 0)),0)::int`,
    })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), gte(coinTransactions.localDate, r.from), lte(coinTransactions.localDate, r.to)))
    .groupBy(p);
}

/** Saldo do livro-razão antes de uma data. */
export async function coinBalanceBefore(db: DbOrTx, userId: string, date: string): Promise<number> {
  const [opening] = await db
    .select({ balance: sql<number>`coalesce(sum(${coinTransactions.amount}),0)::int` })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), sql`${coinTransactions.localDate} < ${date}`));
  return opening?.balance ?? 0;
}

/** Totais por categoria de lançamento de um tipo (ganhos positivos; gastos como valor positivo). */
export function coinsByCategory(db: DbOrTx, userId: string, r: DateRange, kind: 'earn' | 'spend') {
  const total =
    kind === 'earn' ? sql<number>`coalesce(sum(${coinTransactions.amount}),0)::int` : sql<number>`coalesce(-sum(${coinTransactions.amount}),0)::int`;
  return db
    .select({ category: coinTransactions.category, total })
    .from(coinTransactions)
    .where(
      and(eq(coinTransactions.userId, userId), eq(coinTransactions.kind, kind), gte(coinTransactions.localDate, r.from), lte(coinTransactions.localDate, r.to)),
    )
    .groupBy(coinTransactions.category);
}

export function topPurchasedItems(db: DbOrTx, userId: string, limit = 8) {
  return db
    .select({ name: items.name, count: sql<number>`coalesce(sum(${purchases.quantity}),0)::int`, total: sql<number>`coalesce(sum(${purchases.total}),0)::int` })
    .from(purchases)
    .innerJoin(items, eq(items.id, purchases.itemId))
    .where(and(eq(purchases.userId, userId), eq(purchases.status, 'completed')))
    .groupBy(items.name)
    .orderBy(desc(sql`sum(${purchases.quantity})`))
    .limit(limit);
}

/** "Inflação virtual": moedas ganhas por dia ativo, por período (ritmo de emissão). */
export function coinsPerActiveDayByPeriod(db: DbOrTx, userId: string, r: DateRange, g: Granularity) {
  const pg = bucket(rewardGrants.localDate, g);
  return db
    .select({
      period: pg,
      coinsPerActiveDay: sql<number>`round(coalesce(sum(${rewardGrants.coins})::numeric / nullif(count(distinct ${rewardGrants.localDate}),0), 0), 1)::float`,
    })
    .from(rewardGrants)
    .where(and(grantsBetween(userId, r), effectiveGrant))
    .groupBy(pg);
}

export function penaltyEffectByType(db: DbOrTx, userId: string, r: DateRange) {
  return db
    .select({ type: penaltyApplications.type, count: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${penaltyApplications.amount}),0)::int` })
    .from(penaltyApplications)
    .where(
      and(
        eq(penaltyApplications.userId, userId),
        eq(penaltyApplications.status, 'applied'),
        gte(penaltyApplications.localDate, r.from),
        lte(penaltyApplications.localDate, r.to),
      ),
    )
    .groupBy(penaltyApplications.type);
}

/** Variação líquida de moedas no intervalo, desconsiderando gastos. */
export async function netCoinsExcludingSpend(db: DbOrTx, userId: string, r: DateRange): Promise<number> {
  const [row] = await db
    .select({ net: sql<number>`coalesce(sum(${coinTransactions.amount}) filter (where ${coinTransactions.kind} <> 'spend'),0)::int` })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), gte(coinTransactions.localDate, r.from), lte(coinTransactions.localDate, r.to)));
  return row?.net ?? 0;
}
