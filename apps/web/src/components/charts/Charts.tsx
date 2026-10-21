import { useId, useState, type ReactNode } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmt, fmt1, fmtPeriod } from '../../lib/format';
import { useChartTheme } from './useChartTheme';
import { Icon } from '../ui/Icon';

function TooltipBox({ title, rows }: { title: ReactNode; rows: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <div className="panel px-3 py-2 text-sm" style={{ padding: '0.5rem 0.75rem' }}>
      <p className="mb-1 text-xs text-faint">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
          <span className="text-muted">{r.label}:</span>
          <span className="num">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function NoData({ height = 220, children }: { height?: number; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center text-sm text-faint" style={{ height }}>
      <Icon name="bar-chart" size={26} className="mb-2" />
      {children ?? 'Dados insuficientes no período. Registre atividades para ver este gráfico.'}
    </div>
  );
}

/** Alternância acessível: todo gráfico pode ser lido como tabela. */
export function ChartFrame({ children, table, height }: { children: ReactNode; table?: ReactNode; height: number }) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <div>
      {table && (
        <div className="-mt-1 mb-1 flex justify-end">
          <button type="button" className="text-xs text-faint hover:text-fg" aria-controls={id} aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        </div>
      )}
      <div id={id}>{asTable && table ? <div className="max-h-80 overflow-auto">{table}</div> : <div style={{ height }}>{children}</div>}</div>
    </div>
  );
}

// ------------------------------------------------------------------ Radar (teia de aranha)

export interface RadarPoint {
  code: string;
  name: string;
  level: number;
  previousLevel?: number;
  xp?: number;
}

export function AttributeRadar({ data, compareLabel, height = 300 }: { data: RadarPoint[]; compareLabel?: string; height?: number }) {
  const t = useChartTheme();
  if (data.length < 3) return <NoData height={height}>O radar precisa de pelo menos 3 atributos.</NoData>;
  const max = Math.max(5, ...data.map((d) => Math.max(d.level, d.previousLevel ?? 0)));
  const domainMax = Math.ceil((max + 1) / 5) * 5;
  const table = (
    <table className="table">
      <thead>
        <tr>
          <th>Atributo</th>
          <th>Nível</th>
          {compareLabel && <th>{compareLabel}</th>}
          <th>XP</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.code}>
            <td>
              {d.name} ({d.code})
            </td>
            <td className="num">{d.level}</td>
            {compareLabel && <td className="num">{d.previousLevel ?? '—'}</td>}
            <td className="num">{fmt(d.xp ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <ChartFrame height={height} table={table}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke={t.grid} gridType="polygon" />
          <PolarAngleAxis dataKey="code" tick={{ fill: t.text, fontSize: 12, fontFamily: 'var(--font-display)' }} />
          <PolarRadiusAxis domain={[0, domainMax]} tickCount={6} tick={{ fill: t.axis, fontSize: 10 }} axisLine={false} angle={90} />
          {compareLabel && (
            <Radar
              name={compareLabel}
              dataKey="previousLevel"
              stroke={t.muted}
              strokeDasharray="4 4"
              fill={t.muted}
              fillOpacity={0.06}
              isAnimationActive={t.animate}
            />
          )}
          <Radar name="Atual" dataKey="level" stroke={t.accent} fill={t.accent} fillOpacity={0.22} strokeWidth={2} dot={{ r: 3, fill: t.accent }} isAnimationActive={t.animate} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]!.payload as RadarPoint;
              return (
                <TooltipBox
                  title={`${d.name} (${d.code})`}
                  rows={[
                    { label: 'Nível atual', value: String(d.level), color: t.accent },
                    ...(compareLabel ? [{ label: compareLabel, value: String(d.previousLevel ?? 0), color: t.muted }] : []),
                    ...(d.xp !== undefined ? [{ label: 'XP', value: fmt(d.xp) }] : []),
                  ]}
                />
              );
            }}
          />
          {compareLabel && <Legend wrapperStyle={{ fontSize: 12, color: t.muted }} />}
        </RadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ------------------------------------------------------------------ Séries temporais

export interface SeriesDef {
  key: string;
  label: string;
  type?: 'area' | 'bar' | 'line';
  color?: string;
  axis?: 'left' | 'right';
  stack?: string;
  unit?: string;
  dashed?: boolean;
}

export function TimeSeriesChart({
  data,
  series,
  granularity = 'day',
  height = 240,
  yUnit,
  rightUnit,
}: {
  data: Array<Record<string, unknown> & { period: string }>;
  series: SeriesDef[];
  granularity?: 'day' | 'week' | 'month';
  height?: number;
  yUnit?: string;
  rightUnit?: string;
}) {
  const t = useChartTheme();
  const gid = useId().replace(/:/g, '');
  const hasData = data.some((d) => series.some((s) => Number(d[s.key] ?? 0) !== 0));
  if (!hasData) return <NoData height={height} />;
  const color = (s: SeriesDef, i: number) => s.color ?? t.series[i % t.series.length]!;
  const hasRight = series.some((s) => s.axis === 'right');
  const table = (
    <table className="table">
      <thead>
        <tr>
          <th>Período</th>
          {series.map((s) => (
            <th key={s.key}>{s.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.period}>
            <td>{fmtPeriod(d.period, granularity)}</td>
            {series.map((s) => (
              <td key={s.key} className="num">
                {d[s.key] == null ? '—' : fmt1(Number(d[s.key]))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <ChartFrame height={height} table={table}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: hasRight ? 4 : 8, bottom: 0, left: -8 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color(s, i)} stopOpacity={0.45} />
                <stop offset="100%" stopColor={color(s, i)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="period"
            tickFormatter={(p: string) => fmtPeriod(p, granularity)}
            tick={{ fill: t.axis, fontSize: 11 }}
            axisLine={{ stroke: t.grid }}
            tickLine={false}
            minTickGap={18}
          />
          <YAxis yAxisId="left" tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => fmt(v)} label={yUnit ? { value: yUnit, angle: -90, position: 'insideLeft', fill: t.axis, fontSize: 10, dx: 14 } : undefined} />
          {hasRight && <YAxis yAxisId="right" orientation="right" tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={40} label={rightUnit ? { value: rightUnit, angle: 90, position: 'insideRight', fill: t.axis, fontSize: 10 } : undefined} />}
          <Tooltip
            cursor={{ fill: t.grid }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={fmtPeriod(String(label), granularity)}
                  rows={payload.map((p) => {
                    const def = series.find((s) => s.key === p.dataKey);
                    return { label: def?.label ?? String(p.dataKey), value: `${p.value == null ? '—' : fmt1(Number(p.value))}${def?.unit ? ` ${def.unit}` : ''}`, color: String(p.color ?? '') };
                  })}
                />
              ) : null
            }
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: t.muted }}>{v}</span>} />}
          {series.map((s, i) => {
            const c = color(s, i);
            const common = { dataKey: s.key, name: s.label, yAxisId: s.axis ?? 'left', isAnimationActive: t.animate } as const;
            if (s.type === 'bar') return <Bar key={s.key} {...common} fill={c} stackId={s.stack} radius={s.stack ? 0 : [3, 3, 0, 0]} maxBarSize={36} />;
            if (s.type === 'line')
              return <Line key={s.key} {...common} type="monotone" stroke={c} strokeWidth={2} dot={false} strokeDasharray={s.dashed ? '5 4' : undefined} connectNulls />;
            return <Area key={s.key} {...common} type="monotone" stroke={c} strokeWidth={2} fill={`url(#${gid}-${s.key})`} stackId={s.stack} />;
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ------------------------------------------------------------------ Distribuição

export function DonutChart({ data, height = 220, unit = 'XP' }: { data: Array<{ label: string; value: number; color?: string | null }>; height?: number; unit?: string }) {
  const t = useChartTheme();
  const items = data.filter((d) => d.value > 0);
  const total = items.reduce((a, d) => a + d.value, 0);
  if (total === 0) return <NoData height={height} />;
  const colored = items.map((d, i) => ({ ...d, color: d.color ?? t.series[i % t.series.length]! }));
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div style={{ height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={colored} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none" isAnimationActive={t.animate}>
              {colored.map((d) => (
                <Cell key={d.label} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={String(payload[0]!.name)}
                    rows={[{ label: unit, value: `${fmt(Number(payload[0]!.value))} (${Math.round((Number(payload[0]!.value) / total) * 100)}%)` }]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 text-sm">
        {colored.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="flex-1 truncate text-muted">{d.label}</span>
            <span className="num">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Faixa de quadrados (últimos dias) para hábitos. */
export function StatusStrip({ days }: { days: Array<{ date: string; status: string }> }) {
  const color: Record<string, string> = {
    done: 'var(--success)',
    missed: 'var(--danger)',
    tolerated: 'var(--warning)',
    excused: 'var(--info)',
    rest: 'var(--info)',
    pending: 'transparent',
    none: 'color-mix(in srgb, var(--text) 10%, transparent)',
    off: 'transparent',
    skipped: 'transparent',
  };
  const label: Record<string, string> = { done: 'cumprido', missed: 'falhou', tolerated: 'falha tolerada', excused: 'dispensado', rest: 'descanso', pending: 'pendente', none: 'sem registro', off: 'não programado', skipped: 'não programado' };
  return (
    <div className="flex gap-[3px]" aria-label="Últimos 14 dias">
      {days.map((d) => (
        <span
          key={d.date}
          title={`${d.date}: ${label[d.status] ?? d.status}`}
          className="h-3 w-3 rounded-[2px]"
          style={{
            background: color[d.status] ?? 'transparent',
            border: d.status === 'pending' || d.status === 'off' ? '1px dashed var(--border-strong)' : '1px solid transparent',
            opacity: d.status === 'off' ? 0.35 : 1,
          }}
        />
      ))}
    </div>
  );
}
