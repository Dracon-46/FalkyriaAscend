const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const fmt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
export const fmt1 = (n: number | null | undefined) => (n == null ? '—' : nf1.format(n));
export const pct = (f: number | null | undefined) => (f == null ? '—' : `${Math.round(f * 100)}%`);

/** Datas locais (YYYY-MM-DD) exibidas sem conversão de fuso. */
export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!)).toLocaleDateString('pt-BR', { ...opts, timeZone: 'UTC' });
}
export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function fmtPeriod(p: string, granularity: 'day' | 'week' | 'month') {
  if (granularity === 'month') return fmtDate(p, { month: 'short', year: '2-digit' });
  return fmtDate(p, { day: '2-digit', month: '2-digit' });
}
export function relativeDays(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
export function signed(n: number) {
  return `${n > 0 ? '+' : ''}${fmt(n)}`;
}
export function uid(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
