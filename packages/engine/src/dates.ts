/**
 * Utilidades de data independentes de fuso do servidor.
 *
 * Datas "locais" do usuário são representadas como strings ISO `YYYY-MM-DD`.
 * Toda aritmética é feita em UTC sobre essas strings, o que elimina erros de
 * horário de verão e do fuso da máquina que executa o servidor.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function parse(date: string): Date {
  if (!isLocalDate(date)) throw new Error(`Data local inválida: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

/** Data local (YYYY-MM-DD) de um instante em um fuso IANA. */
export function localDateOf(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hora local (0-23) e minuto de um instante em um fuso. */
export function localTimeOf(instant: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Diferença em dias (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** 0 = domingo ... 6 = sábado. */
export function weekdayOf(date: string): number {
  return parse(date).getUTCDay();
}

/** Segunda-feira da semana ISO da data. */
export function startOfIsoWeek(date: string): string {
  const wd = weekdayOf(date);
  const offset = wd === 0 ? -6 : 1 - wd;
  return addDays(date, offset);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Chave da semana ISO no formato `2026-W43`. */
export function isoWeekKey(date: string): string {
  const d = parse(date);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Lista inclusiva de datas entre `from` e `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const n = diffDays(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}
