import { addDays, daysToAfford, diffDays, levelFromXp, startOfIsoWeek, startOfMonth, XP_SOURCE_LABELS, type XpSource } from '@rpg/engine';
import {
  activeAttributes,
  activeSkills,
  attributeXpByPeriod,
  attributeXpUntil,
  coinBalanceBefore,
  coinFlowByPeriod,
  coinsByCategory,
  coinsPerActiveDayByPeriod,
  effortByCategory,
  habitOutcomesByPeriod,
  levelsReached,
  missionOutcomesByPeriod,
  netCoinsExcludingSpend,
  penaltyEffectByType,
  studyByPeriod,
  studyMinutesBySubject,
  topPurchasedItems,
  trainingByPeriod,
  trainingByType,
  xpBefore,
  xpBetween,
  xpByPeriod,
  xpBySource,
  type Granularity,
} from '../persistence/queries/stats';
import { listShopItems } from '../persistence/repositories/inventory';
import { findWallet } from '../persistence/repositories/wallets';
import type { DbOrTx } from '../persistence/unit-of-work';
import { getActiveConfig } from './config';

export type { Granularity };

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

/** XP por período, XP acumulado, nível ao fim de cada período e distribuição por origem. */
export async function progression(db: DbOrTx, userId: string, r: Range) {
  const { config } = await getActiveConfig(db, userId);
  // Estornos entram no período da recompensa original (mesma local_date) e a anulam.
  const rows = await xpByPeriod(db, userId, r, r.granularity);
  let cumulative = await xpBefore(db, userId, r.from);
  const series = fill(periods(r), rows, ['xp', 'coins']).map((row) => {
    cumulative += row.xp;
    return { ...row, cumulativeXp: cumulative, level: levelFromXp(cumulative, config.curves.character).level };
  });
  const bySource = (await xpBySource(db, userId, r))
    .map((s) => ({ source: s.source, label: XP_SOURCE_LABELS[s.source as XpSource], xp: s.xp }))
    .sort((a, b) => b.xp - a.xp);
  const levels = await levelsReached(db, userId);
  const total = series.reduce((a, s) => a + s.xp, 0);
  const previousTotal = await xpBetween(db, userId, previousRange(r));
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
  const attrs = await activeAttributes(db, userId);
  const compareDate = addDays(today, -compareDays);
  const pastMap = new Map((await attributeXpUntil(db, userId, compareDate)).map((p) => [p.attributeId, p.xp]));
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
  const attrs = await activeAttributes(db, userId);
  const rows = await attributeXpByPeriod(db, userId, r.to, r.granularity);
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
  const list = periods(r);
  const missionsSeries = fill(list, await missionOutcomesByPeriod(db, userId, r, r.granularity), ['completed', 'failed']);
  const habitsSeries = fill(list, await habitOutcomesByPeriod(db, userId, r, r.granularity), ['done', 'missed', 'tolerated', 'excused']).map((h) => {
    const evaluated = h.done + h.missed + h.tolerated;
    return { ...h, rate: evaluated > 0 ? Math.round((h.done / evaluated) * 1000) / 10 : null };
  });
  const studySeries = fill(list, await studyByPeriod(db, userId, r, r.granularity), ['studyMinutes', 'studySessions']);
  const trainingSeries = fill(list, await trainingByPeriod(db, userId, r, r.granularity), ['trainingSessions', 'trainingMinutes', 'distanceKm']);

  // Sem categoria: agrupa pela origem (Estudos, Treinos...) para não esconder esforço.
  const effortMap = new Map<string, { label: string; color: string | null; xp: number }>();
  for (const e of await effortByCategory(db, userId, r)) {
    const key = e.categoryId ?? `source:${e.source}`;
    const label = e.name ?? XP_SOURCE_LABELS[e.source as XpSource];
    const cur = effortMap.get(key) ?? { label, color: e.color, xp: 0 };
    cur.xp += e.xp;
    effortMap.set(key, cur);
  }

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
    studyBySubject: await studyMinutesBySubject(db, userId, r),
    trainingByType: await trainingByType(db, userId, r),
    totals: {
      ...totals,
      missionCompletionRate: totals.completed + totals.failed > 0 ? totals.completed / (totals.completed + totals.failed) : null,
      habitRate: totals.habitsDone + totals.habitsMissed > 0 ? totals.habitsDone / (totals.habitsDone + totals.habitsMissed) : null,
    },
  };
}

export async function economy(db: DbOrTx, userId: string, r: Range, today: string) {
  let balance = await coinBalanceBefore(db, userId, r.from);
  const series = fill(periods(r), await coinFlowByPeriod(db, userId, r, r.granularity), ['earned', 'spent', 'penalties', 'corrections']).map((s) => {
    balance += s.earned - s.spent - s.penalties + s.corrections;
    return { ...s, balance };
  });
  // Projeção de compra: ritmo líquido dos últimos 30 dias.
  const netPerDay = (await netCoinsExcludingSpend(db, userId, { from: addDays(today, -29), to: today })) / 30;
  const w = await findWallet(db, userId);
  const shopItems = await listShopItems(db, userId);
  return {
    series,
    sources: await coinsByCategory(db, userId, r, 'earn'),
    spending: await coinsByCategory(db, userId, r, 'spend'),
    topItems: await topPurchasedItems(db, userId),
    inflation: fill(periods(r), await coinsPerActiveDayByPeriod(db, userId, r, r.granularity), ['coinsPerActiveDay']),
    penaltyEffect: await penaltyEffectByType(db, userId, r),
    wallet: w,
    projection: {
      assumption: `Ganho líquido médio dos últimos 30 dias: ${netPerDay.toFixed(1)} moedas/dia, sem considerar gastos futuros.`,
      items: [...shopItems]
        .sort((a, b) => a.price! - b.price!)
        .map((i) => ({ id: i.id, name: i.name, price: i.price!, days: daysToAfford(i.price!, w?.balance ?? 0, netPerDay) })),
    },
  };
}

export async function mastery(db: DbOrTx, userId: string) {
  const { config } = await getActiveConfig(db, userId);
  return (await activeSkills(db, userId)).map((s) => {
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

export type RangeQuery = { from?: string; to?: string; granularity?: string; days?: string };
