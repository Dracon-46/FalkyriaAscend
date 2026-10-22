import { addDays, localDateOf, localTimeOf, maxDate, UNAVAILABILITY_REASON_LABELS } from '@rpg/engine';
import { listNonArchivedHabits } from '../persistence/repositories/habits';
import { listActiveSeasons } from '../persistence/repositories/seasons';
import { findSettings, lockSettings, updateSettings } from '../persistence/repositories/settings';
import { unavailabilityCovering } from '../persistence/repositories/unavailability';
import { findUser, listUserIds } from '../persistence/repositories/users';
import { inTransaction, type Db } from '../persistence/unit-of-work';
import { evaluateAchievements } from './achievements';
import { evaluateHabitDay, refreshStreak } from './habits';
import { refreshActiveGoals } from './goals';
import { closeOverdueMissions, generateRecurringMissions, notifyDeadlines, refreshActiveMissions } from './missions';
import { advanceSeasons, claimSeasonRewards } from './seasons';

/** Hora local a partir da qual o dia anterior é considerado encerrado (permite registros tardios). */
export const DAY_CLOSE_HOUR = 4;
/** Máximo de dias avaliados retroativamente numa execução (evita espiral de penalidades). */
export const MAX_CATCH_UP_DAYS = 14;
/** Intervalo mínimo entre avaliações preguiçosas disparadas por requisições. */
const LAZY_EVALUATION_INTERVAL_MS = 5 * 60_000;

export interface EvaluationSummary {
  evaluatedDays: string[];
  missed: number;
  excused: number;
  tolerated: number;
  missionsClosed: number;
  recurringCreated: number;
}

/**
 * Fechamento diário do usuário (idempotente):
 *  1. Para cada dia encerrado ainda não avaliado: hábitos (falha / tolerância / dispensa) e missões vencidas.
 *  2. Temporadas iniciadas/encerradas.
 *  3. Instâncias de missões recorrentes do período atual e alertas de prazo.
 *  4. Progresso automático de missões e metas; conquistas.
 * Cada dia é avaliado em sua própria transação.
 */
export async function evaluateUser(db: Db, userId: string, now: Date = new Date()): Promise<EvaluationSummary> {
  const settings = await findSettings(db, userId);
  const user = await findUser(db, userId);
  if (!settings || !user) throw new Error('Usuário sem configurações');
  const tz = settings.timezone;
  const today = localDateOf(now, tz);
  const closedUpTo = localTimeOf(now, tz).hour >= DAY_CLOSE_HOUR ? addDays(today, -1) : addDays(today, -2);
  const firstDay = localDateOf(user.createdAt, tz);
  let from = settings.lastEvaluatedDate ? addDays(settings.lastEvaluatedDate, 1) : firstDay;
  from = maxDate(maxDate(from, firstDay), addDays(closedUpTo, -(MAX_CATCH_UP_DAYS - 1)));

  const summary: EvaluationSummary = { evaluatedDays: [], missed: 0, excused: 0, tolerated: 0, missionsClosed: 0, recurringCreated: 0 };

  for (let date = from; date <= closedUpTo; date = addDays(date, 1)) {
    await inTransaction(db, async (tx) => {
      // Trava a linha de configurações: impede duas avaliações simultâneas do mesmo dia.
      const s = (await lockSettings(tx, userId))!;
      if (s.lastEvaluatedDate && s.lastEvaluatedDate >= date) return;
      const periods = await unavailabilityCovering(tx, userId, date);
      const isUnavailable = (d: string, categoryId: string | null) => {
        const p = periods.find((u) => u.startDate <= d && u.endDate >= d && (u.categoryId === null || u.categoryId === categoryId));
        return p ? `Indisponibilidade: ${UNAVAILABILITY_REASON_LABELS[p.reason]}` : null;
      };
      for (const h of await listNonArchivedHabits(tx, userId)) {
        const result = await evaluateHabitDay(tx, h, date, {
          today,
          isUnavailable,
          recoveryUntil: s.recoveryModeUntil,
          penaltiesSuspendedUntil: s.penaltiesSuspendedUntil,
        });
        if (result === 'missed') summary.missed++;
        if (result === 'excused') summary.excused++;
        if (result === 'tolerated') summary.tolerated++;
        if (result) await refreshStreak(tx, h, today);
      }
      summary.missionsClosed += await closeOverdueMissions(tx, userId, date, (d, c) => isUnavailable(d, c) !== null);
      await updateSettings(tx, userId, { lastEvaluatedDate: date });
      summary.evaluatedDays.push(date);
    });
  }

  await inTransaction(db, async (tx) => {
    await advanceSeasons(tx, userId, today);
    for (const s of await listActiveSeasons(tx, userId)) await claimSeasonRewards(tx, s, today);
    summary.recurringCreated = await generateRecurringMissions(tx, userId, today);
    await notifyDeadlines(tx, userId, today);
    await refreshActiveMissions(tx, userId, today);
    await refreshActiveGoals(tx, userId, today);
    await evaluateAchievements(tx, userId, today);
  });
  return summary;
}

/** Executa a avaliação para todos os usuários (agendador). */
export async function evaluateAllUsers(db: Db, now: Date = new Date()) {
  const results: Array<{ userId: string; ok: boolean; error?: string }> = [];
  for (const userId of await listUserIds(db)) {
    try {
      await evaluateUser(db, userId, now);
      results.push({ userId, ok: true });
    } catch (err) {
      results.push({ userId, ok: false, error: (err as Error).message });
    }
  }
  return results;
}

const lastLazyEvaluation = new Map<string, number>();

/** Avaliação preguiçosa: garante que o dia anterior foi fechado mesmo sem o agendador. */
export async function ensureEvaluated(db: Db, userId: string, now: Date, force = false): Promise<void> {
  const last = lastLazyEvaluation.get(userId) ?? 0;
  if (!force && Date.now() - last < LAZY_EVALUATION_INTERVAL_MS) return;
  lastLazyEvaluation.set(userId, Date.now());
  await evaluateUser(db, userId, now);
}

export function resetEvaluationThrottle(): void {
  lastLazyEvaluation.clear();
}
