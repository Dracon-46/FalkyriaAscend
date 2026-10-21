import { addDays } from './dates';
import type { CheckinStatus } from './types';

export interface StreakEntry {
  /** Data local da ocorrência (ou segunda-feira, para metas semanais). */
  date: string;
  status: CheckinStatus;
}

export interface StreakInterruption {
  date: string;
  /** Tamanho da sequência que foi interrompida. */
  lengthBefore: number;
}

export interface StreakState {
  current: number;
  best: number;
  /** Ocorrências cumpridas no total. */
  totalDone: number;
  interruptions: StreakInterruption[];
  lastDoneDate: string | null;
}

/**
 * Calcula a sequência a partir do histórico de ocorrências.
 *
 * Regras:
 *  - `done` incrementa a sequência;
 *  - `missed` interrompe (zera) a sequência;
 *  - `tolerated`, `excused`, `rest` e `skipped` são neutros: não quebram nem incrementam.
 *    Assim, descanso planejado, indisponibilidade e falhas dentro da tolerância
 *    nunca são tratados como interrupção.
 */
export function computeStreak(entries: StreakEntry[]): StreakState {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let current = 0;
  let best = 0;
  let totalDone = 0;
  let lastDoneDate: string | null = null;
  const interruptions: StreakInterruption[] = [];
  for (const e of sorted) {
    if (e.status === 'done') {
      current += 1;
      totalDone += 1;
      lastDoneDate = e.date;
      if (current > best) best = current;
    } else if (e.status === 'missed') {
      if (current > 0) interruptions.push({ date: e.date, lengthBefore: current });
      current = 0;
    }
  }
  return { current, best, totalDone, interruptions, lastDoneDate };
}

/**
 * Decide se uma falha deve ser tolerada: no máximo `tolerance` falhas toleradas
 * numa janela móvel de `windowDays` dias terminando na data da falha.
 */
export function isMissTolerated(
  missDate: string,
  history: StreakEntry[],
  tolerance: number,
  windowDays = 7,
): boolean {
  if (tolerance <= 0) return false;
  const windowStart = addDays(missDate, -(windowDays - 1));
  const used = history.filter((e) => e.status === 'tolerated' && e.date >= windowStart && e.date < missDate).length;
  return used < tolerance;
}

/** Marcos de sequência alcançados ao passar de `before` para `after`. */
export function streakMilestonesCrossed(before: number, after: number, milestones: number[]): number[] {
  return milestones.filter((m) => before < m && after >= m).sort((a, b) => a - b);
}
