import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { addDays, daysToAfford, diffDays, levelFromXp, startOfIsoWeek, startOfMonth, XP_SOURCE_LABELS, type XpSource } from '@rpg/engine';
import type { DbOrTx } from '../db/client';
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
  wallets,
} from '../db/schema';
import { getActiveConfig } from './config';
import { effectiveGrant } from './gameplay';

export type Granularity = 'day' | 'week' | 'month';

export interface Range {
  from: string;
  to: string;
  granularity: Granularity;
}

export function periodStart(date: string, g: Granularity): string {
  return g === 'day' ? date : g === 'week' ? startOfIsoWeek(date) : startOfMonth(date);
}

/** Lista contínua de períodos (preenche lacunas com zero, evitando gráficos enganosos). */
export function periods(r: Range): string[] {
  const out: string[] = [];
  let p = periodStart(r.from, r.granularity);
  while (p <= r.to) {
    out.push(p);
    p = r.granularity === 'day' ? addDays(p, 1) : r.granularity === 'week' ? addDays(p, 7) : startOfMonth(addDays(p, 32));
  }
  return out;
}

const GRANULARITY_SQL: Record<Granularity, string> = { day: "'day'", week: "'week'", month: "'month'" };
/** A granularidade vem de um enum validado e é inserida como literal para que GROUP BY reconheça a expressão. */
const bucket = (col: unknown, g: Granularity) => sql<string>`to_char(date_trunc(${sql.raw(GRANULARITY_SQL[g])}, ${col}::timestamp), 'YYYY-MM-DD')`;

function fill<K extends string>(list: string[], rows: Array<{ period: string } & Record<K, number>>, keys: K[]) {
  const map = new Map(rows.map((r) => [r.period, r]));
  return list.map((period) => {
    const r = map.get(period);
    const o = { period } as { period: string } & Record<K, number>;
    for (const k of keys) (o as Record<string, unknown>)[k] = Number(r?.[k] ?? 0);
    return o;
  });
}

/** Comparação com o período imediatamente anterior de mesma duração. */
function previousRange(r: Range): Range {
  const len = diffDays(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1), granularity: r.granularity };
}

async function xpTotal(db: DbOrTx, userId: string, from: string, to: string) {
  const [row] = await db
    .select({ xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), gte(rewardGrants.localDate, from), lte(rewardGrants.localDate, to), effectiveGrant));
  return row?.xp ?? 0;
}

/** XP por período, XP acumulado, nível ao fim de cada período e distribuição por origem. */
export async function progression(db: DbOrTx, userId: string, r: Range) {
  const { config } = await getActiveConfig(db, userId);
  const p = bucket(rewardGrants.localDate, r.granularity);
  // Estornos entram no período da recompensa original (mesma local_date) e a anulam.
  const notReversal = isNull(rewardGrants.reversalOf);
  const rows = await db
    .select({ period: p, xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int`, coins: sql<number>`coalesce(sum(greatest(${rewardGrants.coins},0)),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), gte(rewardGrants.localDate, r.from), lte(rewardGrants.localDate, r.to), isNull(rewardGrants.reversedAt), notReversal))
    .groupBy(p);
  const [before] = await db
    .select({ xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), sql`${rewardGrants.localDate} < ${r.from}`, effectiveGrant));
  let cumulative = before?.xp ?? 0;
  const series = fill(periods(r), rows, ['xp', 'coins']).map((row) => {
    cumulative += row.xp;
    return { ...row, cumulativeXp: cumulative, level: levelFromXp(cumulative, config.curves.character).level };
  });
  const bySourceRows = await db
    .select({ source: rewardGrants.xpSource, xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), gte(rewardGrants.localDate, r.from), lte(rewardGrants.localDate, r.to), effectiveGrant))
    .groupBy(rewardGrants.xpSource);
  const bySource = bySourceRows.map((s) => ({ source: s.source, label: XP_SOURCE_LABELS[s.source as XpSource], xp: s.xp })).sort((a, b) => b.xp - a.xp);
  const levels = await db
    .select({ level: levelHistory.level, reachedAt: levelHistory.reachedAt })
    .from(levelHistory)
    .where(eq(levelHistory.userId, userId))
    .orderBy(asc(levelHistory.level));
  const total = series.reduce((a, s) => a + s.xp, 0);
  const prev = previousRange(r);
  const previousTotal = await xpTotal(db, userId, prev.from, prev.to);
  const days = diffDays(r.from, r.to) + 1;
  const state = levelFromXp(cumulative, config.curves.character);
  const ratePerDay = total / days;
  return {
    series,
    bySource,
    levels,
    total,
    previousTotal,
    /** Projeção ingênua (ritmo médio do período). Não é promessa. */
    projection: {
      assumption: `Mantido o ritmo médio de ${Math.round(ratePerDay)} XP/dia observado no período selecionado.`,
      daysToNextLevel: ratePerDay > 0 ? Math.ceil(state.xpToNextLevel / ratePerDay) : null,
    },
  };
}

/** Radar de atributos: níveis atuais vs. níveis em uma data anterior (reconstruídos do livro-razão). */
export async function attributeRadar(db: DbOrTx, userId: string, today: string, compareDays: number) {
  const { config } = await getActiveConfig(db, userId);
  const attrs = await db
    .select()
    .from(attributes)
    .where(and(eq(attributes.userId, userId), isNull(attributes.archivedAt)))
    .orderBy(asc(attributes.sortOrder));
  const compareDate = addDays(today, -compareDays);
  const past = await db
    .select({ attributeId: grantAttributeXp.attributeId, xp: sql<number>`coalesce(sum(${grantAttributeXp.amount}),0)::int` })
    .from(grantAttributeXp)
    .innerJoin(rewardGrants, eq(rewardGrants.id, grantAttributeXp.grantId))
    .where(and(eq(grantAttributeXp.userId, userId), lte(rewardGrants.localDate, compareDate)))
    .groupBy(grantAttributeXp.attributeId);
  const pastMap = new Map(past.map((p) => [p.attributeId, p.xp]));
  return {
    compareDate,
    attributes: attrs.map((a) => {
      const pastXp = pastMap.get(a.id) ?? 0;
      const state = levelFromXp(a.xp, config.curves.attribute);
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        color: a.color,
        xp: a.xp,
        level: a.level,
        progress: state.progress,
        xpToNext: state.xpToNextLevel,
        previousXp: pastXp,
        previousLevel: levelFromXp(pastXp, config.curves.attribute).level,
      };
    }),
  };
}

/** Evolução semanal/mensal do nível de cada atributo. */
export async function attributeHistory(db: DbOrTx, userId: string, r: Range) {
  const { config } = await getActiveConfig(db, userId);
  const attrs = await db.select().from(attributes).where(and(eq(attributes.userId, userId), isNull(attributes.archivedAt))).orderBy(asc(attributes.sortOrder));
  const p = bucket(rewardGrants.localDate, r.granularity);
  const rows = await db
    .select({ period: p, attributeId: grantAttributeXp.attributeId, xp: sql<number>`coalesce(sum(${grantAttributeXp.amount}),0)::int` })
    .from(grantAttributeXp)
    .innerJoin(rewardGrants, eq(rewardGrants.id, grantAttributeXp.grantId))
    .where(and(eq(grantAttributeXp.userId, userId), lte(rewardGrants.localDate, r.to)))
    .groupBy(p, grantAttributeXp.attributeId);
  const list = periods(r);
  const running = new Map<string, number>();
  for (const row of rows) if (row.period < list[0]!) running.set(row.attributeId, (running.get(row.attributeId) ?? 0) + row.xp);
  const series = list.map((period) => {
    const o: Record<string, number | string> = { period };
    for (const a of attrs) {
      const add = rows.find((x) => x.period === period && x.attributeId === a.id)?.xp ?? 0;
      running.set(a.id, (running.get(a.id) ?? 0) + add);
      o[a.code] = levelFromXp(running.get(a.id) ?? 0, config.curves.attribute).level;
    }
    return o;
  });
  return { attributes: attrs.map((a) => ({ code: a.code, name: a.name, color: a.color })), series };
}

export async function productivity(db: DbOrTx, userId: string, r: Range) {
  const pm = bucket(sql`coalesce(${missions.completedOn}, ${missions.dueDate})`, r.granularity);
  const missionRows = await db
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
  const ph = bucket(habitCheckins.localDate, r.granularity);
  const habitRows = await db
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
  const ps = bucket(studySessions.localDate, r.granularity);
  const studyRows = await db
    .select({ period: ps, studyMinutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int`, studySessions: sql<number>`count(*)::int` })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), gte(studySessions.localDate, r.from), lte(studySessions.localDate, r.to)))
    .groupBy(ps);
  const pa = bucket(activities.localDate, r.granularity);
  const trainingRows = await db
    .select({
      period: pa,
      trainingSessions: sql<number>`count(*)::int`,
      trainingMinutes: sql<number>`coalesce(sum(${activities.durationMin}),0)::int`,
      distanceKm: sql<number>`coalesce(sum(${activities.distanceKm}),0)::float`,
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), isNull(activities.deletedAt), gte(activities.localDate, r.from), lte(activities.localDate, r.to)))
    .groupBy(pa);

  const list = periods(r);
  const missionsSeries = fill(list, missionRows, ['completed', 'failed']);
  const habitsSeries = fill(list, habitRows, ['done', 'missed', 'tolerated', 'excused']).map((h) => {
    const evaluated = h.done + h.missed + h.tolerated;
    return { ...h, rate: evaluated > 0 ? Math.round((h.done / evaluated) * 1000) / 10 : null };
  });
  const studySeries = fill(list, studyRows, ['studyMinutes', 'studySessions']);
  const trainingSeries = fill(list, trainingRows, ['trainingSessions', 'trainingMinutes', 'distanceKm']);

  const effortRows = await db
    .select({
      categoryId: rewardGrants.categoryId,
      name: categories.name,
      color: categories.color,
      source: rewardGrants.xpSource,
      xp: sql<number>`coalesce(sum(${rewardGrants.xp}),0)::int`,
    })
    .from(rewardGrants)
    .leftJoin(categories, eq(categories.id, rewardGrants.categoryId))
    .where(and(eq(rewardGrants.userId, userId), gte(rewardGrants.localDate, r.from), lte(rewardGrants.localDate, r.to), effectiveGrant))
    .groupBy(rewardGrants.categoryId, categories.name, categories.color, rewardGrants.xpSource);
  // Sem categoria: agrupa pela origem (Estudos, Treinos...) para não esconder esforço.
  const effortMap = new Map<string, { label: string; color: string | null; xp: number }>();
  for (const e of effortRows) {
    const key = e.categoryId ?? `source:${e.source}`;
    const label = e.name ?? XP_SOURCE_LABELS[e.source as XpSource];
    const cur = effortMap.get(key) ?? { label, color: e.color, xp: 0 };
    cur.xp += e.xp;
    effortMap.set(key, cur);
  }
  const subjectRows = await db
    .select({ subject: studySubjects.name, color: studySubjects.color, minutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int` })
    .from(studySessions)
    .innerJoin(studySubjects, eq(studySubjects.id, studySessions.subjectId))
    .where(and(eq(studySessions.userId, userId), gte(studySessions.localDate, r.from), lte(studySessions.localDate, r.to)))
    .groupBy(studySubjects.name, studySubjects.color);
  const typeRows = await db
    .select({ type: activityTypes.name, sessions: sql<number>`count(*)::int`, minutes: sql<number>`coalesce(sum(${activities.durationMin}),0)::int` })
    .from(activities)
    .innerJoin(activityTypes, eq(activityTypes.id, activities.typeId))
    .where(and(eq(activities.userId, userId), isNull(activities.deletedAt), gte(activities.localDate, r.from), lte(activities.localDate, r.to)))
    .groupBy(activityTypes.name);

  const totals = {
    completed: missionsSeries.reduce((a, m) => a + m.completed, 0),
    failed: missionsSeries.reduce((a, m) => a + m.failed, 0),
    habitsDone: habitsSeries.reduce((a, h) => a + h.done, 0),
    habitsMissed: habitsSeries.reduce((a, h) => a + h.missed + h.tolerated, 0),
  };
  return {
    missions: missionsSeries,
    habits: habitsSeries,
    study: studySeries,
    training: trainingSeries,
    effort: [...effortMap.values()].filter((e) => e.xp > 0).sort((a, b) => b.xp - a.xp),
    studyBySubject: subjectRows,
    trainingByType: typeRows,
    totals: {
      ...totals,
      missionCompletionRate: totals.completed + totals.failed > 0 ? totals.completed / (totals.completed + totals.failed) : null,
      habitRate: totals.habitsDone + totals.habitsMissed > 0 ? totals.habitsDone / (totals.habitsDone + totals.habitsMissed) : null,
    },
  };
}

export async function economy(db: DbOrTx, userId: string, r: Range, today: string) {
  const p = bucket(coinTransactions.localDate, r.granularity);
  const rows = await db
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
  const [opening] = await db
    .select({ balance: sql<number>`coalesce(sum(${coinTransactions.amount}),0)::int` })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), sql`${coinTransactions.localDate} < ${r.from}`));
  let balance = opening?.balance ?? 0;
  const series = fill(periods(r), rows, ['earned', 'spent', 'penalties', 'corrections']).map((s) => {
    balance += s.earned - s.spent - s.penalties + s.corrections;
    return { ...s, balance };
  });
  const sources = await db
    .select({ category: coinTransactions.category, total: sql<number>`coalesce(sum(${coinTransactions.amount}),0)::int` })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.kind, 'earn'), gte(coinTransactions.localDate, r.from), lte(coinTransactions.localDate, r.to)))
    .groupBy(coinTransactions.category);
  const spending = await db
    .select({ category: coinTransactions.category, total: sql<number>`coalesce(-sum(${coinTransactions.amount}),0)::int` })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.kind, 'spend'), gte(coinTransactions.localDate, r.from), lte(coinTransactions.localDate, r.to)))
    .groupBy(coinTransactions.category);
  const topItems = await db
    .select({ name: items.name, count: sql<number>`coalesce(sum(${purchases.quantity}),0)::int`, total: sql<number>`coalesce(sum(${purchases.total}),0)::int` })
    .from(purchases)
    .innerJoin(items, eq(items.id, purchases.itemId))
    .where(and(eq(purchases.userId, userId), eq(purchases.status, 'completed')))
    .groupBy(items.name)
    .orderBy(desc(sql`sum(${purchases.quantity})`))
    .limit(8);
  // "Inflação virtual": moedas ganhas por dia ativo, por período (ritmo de emissão).
  const pg = bucket(rewardGrants.localDate, r.granularity);
  const inflation = await db
    .select({
      period: pg,
      coinsPerActiveDay: sql<number>`round(coalesce(sum(${rewardGrants.coins})::numeric / nullif(count(distinct ${rewardGrants.localDate}),0), 0), 1)::float`,
    })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.userId, userId), gte(rewardGrants.localDate, r.from), lte(rewardGrants.localDate, r.to), effectiveGrant))
    .groupBy(pg);
  const penaltyEffect = await db
    .select({ type: penaltyApplications.type, count: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${penaltyApplications.amount}),0)::int` })
    .from(penaltyApplications)
    .where(and(eq(penaltyApplications.userId, userId), eq(penaltyApplications.status, 'applied'), gte(penaltyApplications.localDate, r.from), lte(penaltyApplications.localDate, r.to)))
    .groupBy(penaltyApplications.type);

  // Projeção de compra: ritmo líquido dos últimos 30 dias.
  const [net30] = await db
    .select({ net: sql<number>`coalesce(sum(${coinTransactions.amount}) filter (where ${coinTransactions.kind} <> 'spend'),0)::int` })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), gte(coinTransactions.localDate, addDays(today, -29)), lte(coinTransactions.localDate, today)));
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const netPerDay = (net30?.net ?? 0) / 30;
  const shopItems = await db
    .select()
    .from(items)
    .where(and(eq(items.userId, userId), eq(items.active, true), isNull(items.archivedAt), sql`${items.price} is not null`))
    .orderBy(asc(items.price));
  return {
    series,
    sources,
    spending,
    topItems,
    inflation: fill(periods(r), inflation, ['coinsPerActiveDay']),
    penaltyEffect,
    wallet: w ?? null,
    projection: {
      assumption: `Ganho líquido médio dos últimos 30 dias: ${netPerDay.toFixed(1)} moedas/dia, sem considerar gastos futuros.`,
      items: shopItems.map((i) => ({ id: i.id, name: i.name, price: i.price!, days: daysToAfford(i.price!, w?.balance ?? 0, netPerDay) })),
    },
  };
}

export async function mastery(db: DbOrTx, userId: string) {
  const { config } = await getActiveConfig(db, userId);
  const rows = await db.select().from(skills).where(and(eq(skills.userId, userId), isNull(skills.archivedAt))).orderBy(asc(skills.sortOrder));
  return rows.map((s) => {
    const st = levelFromXp(s.xp, config.curves.mastery);
    return { ...s, progress: st.progress, xpToNext: st.xpToNextLevel };
  });
}

/** Ponto de partida comum para filtros de período. */
export function parseRange(q: { from?: string; to?: string; granularity?: string; days?: string }, today: string): Range {
  const granularity = (['day', 'week', 'month'] as const).includes(q.granularity as Granularity) ? (q.granularity as Granularity) : 'day';
  const days = Math.min(3650, Math.max(1, Number(q.days ?? 30) || 30));
  const to = q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? q.to : today;
  const from = q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? q.from : addDays(to, -(days - 1));
  return { from: from <= to ? from : to, to, granularity };
}

export type { SQL };
