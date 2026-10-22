import {
  addDays,
  computeHabitReward,
  computeStreak,
  computeFixedReward,
  isMissTolerated,
  isScheduledOn,
  isoWeekKey,
  startOfIsoWeek,
  streakMilestonesCrossed,
  weeklyShortfall,
  type HabitSchedule,
  type StreakEntry,
} from '@rpg/engine';
import type { Habit } from '../persistence/models';
import {
  checkinsOfHabit,
  checkinsOfHabitBetween,
  countDoneBetween,
  deleteCheckin,
  findCheckin,
  findHabit,
  insertCheckin,
  insertCheckinIfAbsent,
  checkinsOfUserBetween,
  listCurrentHabits,
  lockHabit,
  setHabitStreak,
} from '../persistence/repositories/habits';
import { findGrant } from '../persistence/repositories/ledger';
import { rulesOfHabit } from '../persistence/repositories/penalties';
import { type DbOrTx } from '../persistence/unit-of-work';
import { badRequest, conflict, notFound } from '../shared/errors';
import { getActiveConfig } from './config';
import { currentMultiplier, xpTodayBySource } from './gameplay';
import { applyPenalties } from './penalties';
import { grantReward, reverseGrant } from './rewards';

export type { Habit };

export function scheduleOf(h: Habit): HabitSchedule {
  return {
    frequency: h.frequency,
    weekdaysMask: h.weekdaysMask,
    timesPerWeek: h.timesPerWeek,
    startDate: h.startDate,
    endDate: h.endDate,
  };
}

export async function getHabit(tx: DbOrTx, userId: string, id: string, lock = false): Promise<Habit> {
  const h = lock ? await lockHabit(tx, userId, id) : await findHabit(tx, userId, id);
  if (!h) throw notFound('Hábito');
  return h;
}

/** Entradas de sequência: diárias ou, para metas semanais, uma por semana encerrada. */
export async function streakEntries(tx: DbOrTx, h: Habit, today: string): Promise<StreakEntry[]> {
  const rows = await checkinsOfHabit(tx, h.id);
  if (h.frequency !== 'times_per_week') return rows;
  const weeks = new Map<string, { done: number; excused: number; monday: string }>();
  for (const r of rows) {
    const monday = startOfIsoWeek(r.date);
    const w = weeks.get(monday) ?? { done: 0, excused: 0, monday };
    if (r.status === 'done') w.done++;
    if (r.status === 'excused' || r.status === 'rest') w.excused++;
    weeks.set(monday, w);
  }
  const currentMonday = startOfIsoWeek(today);
  const entries: StreakEntry[] = [];
  // Semanas sem nenhum registro desde o início também contam como semanas avaliadas.
  for (let monday = startOfIsoWeek(h.startDate); monday < currentMonday; monday = addDays(monday, 7)) {
    const w = weeks.get(monday) ?? { done: 0, excused: 0, monday };
    const s = weeklyShortfall(scheduleOf(h), monday, w.done, w.excused);
    entries.push({ date: monday, status: s.target === 0 ? 'excused' : s.shortfall === 0 ? 'done' : 'missed' });
  }
  const cur = weeks.get(currentMonday);
  if (cur && cur.done >= h.timesPerWeek) entries.push({ date: currentMonday, status: 'done' });
  return entries;
}

/** Recalcula e grava a sequência atual/melhor; concede marcos de sequência (uma vez por hábito). */
export async function refreshStreak(tx: DbOrTx, h: Habit, today: string): Promise<{ current: number; best: number; milestones: number[] }> {
  const state = computeStreak(await streakEntries(tx, h, today));
  const best = Math.max(state.best, h.bestStreak);
  await setHabitStreak(tx, h.id, state.current, best);
  const { config } = await getActiveConfig(tx, h.userId);
  const crossed = streakMilestonesCrossed(h.bestStreak, best, config.streakMilestones.map((m) => m.days));
  for (const days of crossed) {
    const m = config.streakMilestones.find((x) => x.days === days)!;
    await grantReward(tx, {
      userId: h.userId,
      idempotencyKey: `streak:${h.id}:${days}`,
      sourceType: 'streak',
      sourceId: h.id,
      xpSource: 'streak',
      categoryId: h.categoryId,
      title: `Sequência de ${days}: ${h.title}`,
      localDate: today,
      reward: computeFixedReward({ xp: m.xp, coins: m.coins, label: `Marco de sequência: ${days} ocorrências` }, config),
    });
  }
  return { current: state.current, best, milestones: crossed };
}

/**
 * Registra um hábito no dia (hoje ou ontem, se ainda não avaliado).
 * `done` concede recompensa uma única vez por dia (chave habit:<id>:<data>).
 */
export async function checkin(
  tx: DbOrTx,
  userId: string,
  habitId: string,
  input: { date?: string | null; status: 'done' | 'excused' | 'rest'; note?: string | null },
  today: string,
) {
  const h = await getHabit(tx, userId, habitId, true);
  const date = input.date ?? today;
  if (date > today) throw badRequest('Não é possível registrar datas futuras.');
  if (date < addDays(today, -1)) throw badRequest('Registros só podem ser feitos para hoje ou ontem. Para correções, use o histórico.');
  if (h.status === 'archived') throw conflict('Hábito arquivado.');
  if (date < h.startDate || (h.endDate && date > h.endDate)) throw badRequest('Data fora do período do hábito.');
  if (h.frequency !== 'times_per_week' && !isScheduledOn(scheduleOf(h), date)) {
    throw badRequest('Este hábito não está programado para este dia.');
  }
  const existing = await findCheckin(tx, habitId, date);
  if (existing) {
    if (existing.status === input.status) return { checkin: existing, reward: null, streak: null };
    throw conflict('Já existe um registro para este dia. Desfaça-o antes de alterar.');
  }

  let grantId: string | null = null;
  let reward: { xp: number; coins: number; explanation: string[]; levelUps: number[] } | null = null;
  if (input.status === 'done') {
    let eligible = true;
    if (h.frequency === 'times_per_week') {
      const monday = startOfIsoWeek(date);
      // Execuções além da meta semanal são registradas, mas não recompensadas.
      eligible = (await countDoneBetween(tx, habitId, monday, addDays(monday, 6))) < h.timesPerWeek;
    }
    if (eligible) {
      const { config } = await getActiveConfig(tx, userId);
      const mult = await currentMultiplier(tx, userId, today, config);
      const todayXp = await xpTodayBySource(tx, userId, date);
      const r = computeHabitReward(
        { difficulty: h.difficulty, attributeWeights: h.attributeWeights, xpFromHabitsToday: todayXp.habit ?? 0, multiplier: mult.multiplier },
        config,
      );
      const g = await grantReward(tx, {
        userId,
        idempotencyKey: `habit:${h.id}:${date}`,
        sourceType: 'habit',
        sourceId: h.id,
        xpSource: 'habit',
        categoryId: h.categoryId,
        title: `Hábito: ${h.title}`,
        localDate: date,
        reward: r,
      });
      grantId = g.grantId;
      reward = { xp: g.xp, coins: g.coins, explanation: r.explanation, levelUps: g.levelUps };
    }
  }
  const row = await insertCheckin(tx, { userId, habitId, localDate: date, status: input.status, note: input.note ?? null, grantId });
  const streak = await refreshStreak(tx, h, today);
  return { checkin: row, reward, streak };
}

/** Desfaz um registro feito pelo usuário hoje (ex.: clique por engano), estornando a recompensa. */
export async function undoCheckin(tx: DbOrTx, userId: string, habitId: string, date: string, today: string) {
  const h = await getHabit(tx, userId, habitId, true);
  if (date !== today) throw conflict('Somente registros de hoje podem ser desfeitos. Para correções, use o histórico.');
  const c = await findCheckin(tx, habitId, date);
  if (!c) throw notFound('Registro');
  if (c.source !== 'user') throw conflict('Registros gerados pela avaliação diária não podem ser desfeitos aqui.');
  if (c.grantId) {
    const g = await findGrant(tx, c.grantId);
    if (g && !g.reversedAt) await reverseGrant(tx, userId, c.grantId, 'Registro desfeito pelo usuário', userId);
  }
  await deleteCheckin(tx, c.id);
  await refreshStreak(tx, h, today);
}

export interface EvaluationContext {
  today: string;
  isUnavailable: (date: string, categoryId: string | null) => string | null;
  recoveryUntil: string | null;
  penaltiesSuspendedUntil: string | null;
}

/** Avalia um hábito num dia encerrado: dispensa, tolera ou registra falha (com penalidades). */
export async function evaluateHabitDay(tx: DbOrTx, h: Habit, date: string, ctx: EvaluationContext): Promise<string | null> {
  if (date < h.startDate || (h.endDate && date > h.endDate) || h.status === 'archived') return null;
  const paused = h.status === 'paused' && (!h.pausedUntil || h.pausedUntil >= date);
  const unavailable = ctx.isUnavailable(date, h.categoryId);
  const recovery = ctx.recoveryUntil !== null && ctx.recoveryUntil >= date;

  if (h.frequency === 'times_per_week') {
    if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 0) return null; // avalia no domingo
    if (paused) return null;
    const monday = startOfIsoWeek(date);
    const rows = await checkinsOfHabitBetween(tx, h.id, monday, date);
    let excusedDays = rows.filter((r) => r.status === 'excused' || r.status === 'rest').length;
    for (let d = monday; d <= date; d = addDays(d, 1)) if (ctx.isUnavailable(d, h.categoryId)) excusedDays++;
    const s = weeklyShortfall(scheduleOf(h), date, rows.filter((r) => r.status === 'done').length, Math.min(7, excusedDays));
    if (s.shortfall === 0 || recovery || h.isBasicNeed) return null;
    if (ctx.penaltiesSuspendedUntil && ctx.penaltiesSuspendedUntil >= date) return 'missed';
    await applyPenalties(tx, {
      userId: h.userId,
      rules: await rulesOfHabit(tx, h.id),
      sourceType: 'habit',
      sourceId: h.id,
      sourceTitle: `${h.title} (meta semanal ${s.done}/${s.target})`,
      localDate: date,
      consecutiveMisses: 1,
      keyBase: `habit:${h.id}:week:${isoWeekKey(date)}`,
      categoryId: h.categoryId,
    });
    return 'missed';
  }

  if (!isScheduledOn(scheduleOf(h), date)) return null;
  if (await findCheckin(tx, h.id, date)) return null;

  const insert = (status: 'excused' | 'tolerated' | 'missed', note: string | null) =>
    insertCheckinIfAbsent(tx, { userId: h.userId, habitId: h.id, localDate: date, status, note, source: 'evaluation' });

  if (paused) {
    await insert('excused', 'Hábito pausado');
    return 'excused';
  }
  if (unavailable) {
    await insert('excused', unavailable);
    return 'excused';
  }
  if (recovery) {
    await insert('excused', 'Modo de recuperação');
    return 'excused';
  }

  const rules = await rulesOfHabit(tx, h.id);
  const history = await checkinsOfHabitBetween(tx, h.id, addDays(date, -60), date);
  const noTolerance = rules.some((r) => r.type === 'streak_reset' && r.active);
  if (!noTolerance && isMissTolerated(date, history, h.tolerancePerWeek)) {
    await insert('tolerated', `Dentro da tolerância (${h.tolerancePerWeek}/semana)`);
    return 'tolerated';
  }
  await insert('missed', null);
  if (h.isBasicNeed) return 'missed';
  if (ctx.penaltiesSuspendedUntil && ctx.penaltiesSuspendedUntil >= date) return 'missed';

  let consecutive = 1;
  for (const e of [...history].reverse()) {
    if (e.date >= date) continue;
    if (e.status === 'missed') consecutive++;
    else if (e.status === 'done') break;
  }
  await applyPenalties(tx, {
    userId: h.userId,
    rules,
    sourceType: 'habit',
    sourceId: h.id,
    sourceTitle: h.title,
    localDate: date,
    consecutiveMisses: consecutive,
    keyBase: `habit:${h.id}:${date}`,
    categoryId: h.categoryId,
  });
  return 'missed';
}

/** Hábitos ativos e pausados com o estado do dia, a semana e os últimos 14 dias. */
export async function habitsForDay(db: DbOrTx, userId: string, today: string) {
  const list = await listCurrentHabits(db, userId);
  const monday = startOfIsoWeek(today);
  const checkins = await checkinsOfUserBetween(db, userId, addDays(today, -13), today);
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
