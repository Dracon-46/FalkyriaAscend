import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { addDays, localDateOf, localTimeOf, maxDate, UNAVAILABILITY_REASON_LABELS } from '@rpg/engine';
import type { Db } from '../db/client';
import { habits, unavailability, users, userSettings } from '../db/schema';
import { evaluateAchievements } from './achievements';
import { evaluateHabitDay, refreshStreak } from './habits';
import { refreshActiveGoals } from './goals';
import { closeOverdueMissions, generateRecurringMissions, notifyDeadlines, refreshActiveMissions } from './missions';
import { advanceSeasons, claimSeasonRewards } from './seasons';
import { seasons } from '../db/schema';

/** Hora local a partir da qual o dia anterior é considerado encerrado (permite registros tardios). */
export const DAY_CLOSE_HOUR = 4;
/** Máximo de dias avaliados retroativamente numa execução (evita espiral de penalidades). */
export const MAX_CATCH_UP_DAYS = 14;

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
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!settings || !user) throw new Error('Usuário sem configurações');
  const tz = settings.timezone;
  const today = localDateOf(now, tz);
  const closedUpTo = localTimeOf(now, tz).hour >= DAY_CLOSE_HOUR ? addDays(today, -1) : addDays(today, -2);
  const firstDay = localDateOf(user.createdAt, tz);
  let from = settings.lastEvaluatedDate ? addDays(settings.lastEvaluatedDate, 1) : firstDay;
  from = maxDate(maxDate(from, firstDay), addDays(closedUpTo, -(MAX_CATCH_UP_DAYS - 1)));

  const summary: EvaluationSummary = { evaluatedDays: [], missed: 0, excused: 0, tolerated: 0, missionsClosed: 0, recurringCreated: 0 };

  for (let date = from; date <= closedUpTo; date = addDays(date, 1)) {
    await db.transaction(async (tx) => {
      // Trava a linha de configurações: impede duas avaliações simultâneas do mesmo dia.
      const [s] = await tx.select().from(userSettings).where(eq(userSettings.userId, userId)).for('update');
      if (s!.lastEvaluatedDate && s!.lastEvaluatedDate >= date) return;
      const periods = await tx
        .select()
        .from(unavailability)
        .where(and(eq(unavailability.userId, userId), lte(unavailability.startDate, date), gte(unavailability.endDate, date)));
      const isUnavailable = (d: string, categoryId: string | null) => {
        const p = periods.find((u) => u.startDate <= d && u.endDate >= d && (u.categoryId === null || u.categoryId === categoryId));
        return p ? `Indisponibilidade: ${UNAVAILABILITY_REASON_LABELS[p.reason]}` : null;
      };
      const list = await tx.select().from(habits).where(and(eq(habits.userId, userId), ne(habits.status, 'archived')));
      for (const h of list) {
        const result = await evaluateHabitDay(tx, h, date, {
          today,
          isUnavailable,
          recoveryUntil: s!.recoveryModeUntil,
          penaltiesSuspendedUntil: s!.penaltiesSuspendedUntil,
        });
        if (result === 'missed') summary.missed++;
        if (result === 'excused') summary.excused++;
        if (result === 'tolerated') summary.tolerated++;
        if (result) await refreshStreak(tx, h, today);
      }
      summary.missionsClosed += await closeOverdueMissions(tx, userId, date, (d, c) => isUnavailable(d, c) !== null);
      await tx.update(userSettings).set({ lastEvaluatedDate: date }).where(eq(userSettings.userId, userId));
      summary.evaluatedDays.push(date);
    });
  }

  await db.transaction(async (tx) => {
    await advanceSeasons(tx, userId, today);
    const active = await tx.select().from(seasons).where(and(eq(seasons.userId, userId), inArray(seasons.status, ['active'])));
    for (const s of active) await claimSeasonRewards(tx, s, today);
    summary.recurringCreated = await generateRecurringMissions(tx, userId, today);
    await notifyDeadlines(tx, userId, today);
    await refreshActiveMissions(tx, userId, today);
    await refreshActiveGoals(tx, userId, today);
    await evaluateAchievements(tx, userId, today);
  });
  return summary;
}

/** Executa a avaliação para todos os usuários ativos (agendador). */
export async function evaluateAllUsers(db: Db, now: Date = new Date()) {
  const list = await db.select({ id: users.id }).from(users);
  const results: Array<{ userId: string; ok: boolean; error?: string }> = [];
  for (const u of list) {
    try {
      await evaluateUser(db, u.id, now);
      results.push({ userId: u.id, ok: true });
    } catch (err) {
      results.push({ userId: u.id, ok: false, error: (err as Error).message });
    }
  }
  return results;
}
