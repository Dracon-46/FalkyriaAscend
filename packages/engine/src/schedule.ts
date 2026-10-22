import { addDays, dateRange, isoWeekKey, startOfIsoWeek, weekdayOf } from './dates';
import type { HabitFrequency } from './types';

export interface HabitSchedule {
  frequency: HabitFrequency;
  /** Bitmask de dias da semana (bit 0 = domingo ... bit 6 = sábado). Usado em `weekdays`. */
  weekdaysMask: number;
  /** Alvo semanal para `times_per_week`. */
  timesPerWeek: number;
  /** Data local a partir da qual o hábito vale. */
  startDate: string;
  endDate?: string | null;
}

export const ALL_DAYS_MASK = 0b1111111;

export function maskHasDay(mask: number, weekday: number): boolean {
  return (mask & (1 << weekday)) !== 0;
}

export function maskFromDays(days: number[]): number {
  return days.reduce((m, d) => m | (1 << d), 0);
}

export function daysFromMask(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => maskHasDay(mask, d));
}

function inRange(s: HabitSchedule, date: string): boolean {
  if (date < s.startDate) return false;
  if (s.endDate && date > s.endDate) return false;
  return true;
}

/**
 * Indica se existe uma obrigação no dia. Para `times_per_week`, o hábito é
 * "programável" todos os dias, mas a obrigação é semanal (ver weeklyShortfall).
 */
export function isScheduledOn(s: HabitSchedule, date: string): boolean {
  if (!inRange(s, date)) return false;
  switch (s.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return maskHasDay(s.weekdaysMask, weekdayOf(date));
    case 'times_per_week':
      return false;
  }
}

/** Ocorrências programadas (dias) em um intervalo. */
export function scheduledDates(s: HabitSchedule, from: string, to: string): string[] {
  if (from > to) return [];
  return dateRange(from, to).filter((d) => isScheduledOn(s, d));
}

/**
 * Para hábitos `times_per_week`: quantas execuções faltaram na semana ISO que contém `date`,
 * considerando os dias dispensados (descanso/indisponibilidade), que reduzem a meta proporcionalmente.
 */
export function weeklyShortfall(
  s: HabitSchedule,
  weekDate: string,
  doneCount: number,
  excusedDays: number,
): { target: number; done: number; shortfall: number; weekKey: string } {
  const monday = startOfIsoWeek(weekDate);
  const sunday = addDays(monday, 6);
  const activeDays = dateRange(monday, sunday).filter((d) => inRange(s, d)).length;
  const available = Math.max(0, activeDays - excusedDays);
  const target = Math.min(s.timesPerWeek, Math.round((s.timesPerWeek * available) / 7));
  return { target, done: doneCount, shortfall: Math.max(0, target - doneCount), weekKey: isoWeekKey(weekDate) };
}
