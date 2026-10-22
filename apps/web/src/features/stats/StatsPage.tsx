import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PENALTY_TYPE_LABELS, type PenaltyType } from '@rpg/engine';
import { api, qs } from '../../lib/api';
import { fmt, fmt1, fmtDate, pct } from '../../lib/format';
import type { RadarData, SeriesPoint, Skill } from '../../lib/types';
import { AttributeRadar, DonutChart, TimeSeriesChart } from '../../components/charts/Charts';
import { useChartTheme } from '../../components/charts/useChartTheme';
import { Coins } from '../../components/ui/domain';
import { Icon } from '../../components/ui/Icon';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, Panel, ProgressBar, Segmented, Stat, Tabs } from '../../components/ui/primitives';

type Granularity = 'day' | 'week' | 'month';
type Tab = 'progressao' | 'produtividade' | 'economia' | 'atributos';

const PERIODS = [7, 30, 90, 180, 365] as const;
const defaultGranularity = (days: number): Granularity => (days <= 31 ? 'day' : days <= 180 ? 'week' : 'month');

/** Origem das moedas (categoria gravada no livro-razão) → rótulo legível. */
const SOURCE_LABELS: Record<string, string> = {
  mission: 'Missões',
  habit: 'Hábitos',
  study_session: 'Sessões de estudo',
  assessment: 'Avaliações',
  study_unit: 'Conteúdos concluídos',
  subject_milestone: 'Marcos de domínio',
  activity: 'Treinos',
  quick: 'Registros rápidos',
  goal: 'Metas',
  achievement: 'Conquistas',
  streak: 'Sequências',
  level: 'Marcos de nível',
  season: 'Temporadas',
  adjustment: 'Ajustes',
  reversal: 'Estornos',
};

interface Progression {
  series: SeriesPoint[];
  bySource: Array<{ source: string; label: string; xp: number }>;
  levels: Array<{ level: number; reachedAt: string }>;
  total: number;
  previousTotal: number;
  projection: { assumption: string; daysToNextLevel: number | null };
}

interface Productivity {
  missions: SeriesPoint[];
  habits: SeriesPoint[];
  study: SeriesPoint[];
  training: SeriesPoint[];
  effort: Array<{ label: string; color: string | null; xp: number }>;
  studyBySubject: Array<{ subject: string; color: string; minutes: number }>;
  trainingByType: Array<{ type: string; sessions: number; minutes: number }>;
  totals: { completed: number; failed: number; habitsDone: number; habitsMissed: number; missionCompletionRate: number | null; habitRate: number | null };
}

interface Economy {
  series: SeriesPoint[];
  sources: Array<{ category: string; total: number }>;
  spending: Array<{ category: string; total: number }>;
  topItems: Array<{ name: string; count: number; total: number }>;
  inflation: SeriesPoint[];
  penaltyEffect: Array<{ type: PenaltyType; count: number; amount: number }>;
  wallet: { balance: number; totalEarned: number; totalSpent: number; totalPenalties: number } | null;
  projection: { assumption: string; items: Array<{ id: string; name: string; price: number; days: number | null }> };
}

interface AttrHistory {
  attributes: Array<{ code: string; name: string; color: string }>;
  series: SeriesPoint[];
}

export function StatsPage() {
  const [params, setParams] = useSearchParams();
  const daysParam = Number(params.get('dias'));
  const days = (PERIODS as readonly number[]).includes(daysParam) ? daysParam : 30;
  const gParam = params.get('g');
  const granularity: Granularity = gParam === 'day' || gParam === 'week' || gParam === 'month' ? gParam : defaultGranularity(days);
  const tabParam = params.get('aba') as Tab | null;
  const tab: Tab = tabParam && ['progressao', 'produtividade', 'economia', 'atributos'].includes(tabParam) ? tabParam : 'progressao';

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Estatísticas"
        icon="bar-chart"
        subtitle="Todos os gráficos usam seus registros reais. Projeções são estimativas com premissas declaradas, não resultados."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Período"
          value={days}
          onChange={(d) => update({ dias: String(d), g: null })}
          options={PERIODS.map((p) => ({ value: p, label: p === 365 ? '1 ano' : `${p} dias` }))}
        />
        <Segmented
          label="Agrupamento"
          value={granularity}
          onChange={(g) => update({ g })}
          options={[
            { value: 'day', label: 'Dia' },
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mês' },
          ]}
        />
      </div>
      <Tabs
        value={tab}
        onChange={(t) => update({ aba: t })}
        tabs={[
          { value: 'progressao', label: 'Progressão', icon: 'trending-up' },
          { value: 'produtividade', label: 'Produtividade', icon: 'list-checks' },
          { value: 'economia', label: 'Economia', icon: 'coins' },
          { value: 'atributos', label: 'Atributos e maestria', icon: 'git-branch' },
        ]}
      />
      {tab === 'progressao' && <ProgressionTab days={days} granularity={granularity} />}
      {tab === 'produtividade' && <ProductivityTab days={days} granularity={granularity} />}
      {tab === 'economia' && <EconomyTab days={days} granularity={granularity} />}
      {tab === 'atributos' && <AttributesTab days={days} granularity={granularity} />}
    </>
  );
}

function useStats<T>(path: string, days: number, granularity: Granularity) {
  return useQuery({ queryKey: ['stats', path, days, granularity], queryFn: () => api.get<T>(`/api/stats/${path}${qs({ days, granularity })}`) });
}

function change(current: number, previous: number): { label: string; tone: 'success' | 'danger' | 'muted' } {
  if (previous === 0) return current === 0 ? { label: 'sem variação', tone: 'muted' } : { label: 'sem base anterior', tone: 'muted' };
  const delta = (current - previous) / previous;
  return { label: `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}% vs. período anterior`, tone: delta >= 0 ? 'success' : 'danger' };
}

function ProgressionTab({ days, granularity }: { days: number; granularity: Granularity }) {
  const t = useChartTheme();
  const q = useStats<Progression>('progression', days, granularity);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const cmp = change(d.total, d.previousTotal);
  const avg = d.total / days;
  const levelsInRange = d.levels.filter((l) => Date.now() - Date.parse(l.reachedAt) <= days * 86_400_000);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Resumo do período" icon="sparkles" className="lg:col-span-3">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="XP no período" value={fmt(d.total)} hint={<span style={{ color: `var(--${cmp.tone === 'muted' ? 'text-faint' : cmp.tone})` }}>{cmp.label}</span>} />
          <Stat label="Período anterior" value={fmt(d.previousTotal)} hint={`mesma duração (${days} dias)`} />
          <Stat label="Média diária" value={`${fmt1(avg)} XP`} />
          <Stat label="Níveis alcançados" value={fmt(levelsInRange.length)} hint="no período" />
        </div>
      </Panel>
      <Panel title="XP por período e nível" icon="trending-up" className="lg:col-span-2">
        <TimeSeriesChart
          data={d.series}
          granularity={granularity}
          height={280}
          yUnit="XP"
          rightUnit="Nível"
          series={[
            { key: 'xp', label: 'XP ganho', type: 'bar' },
            { key: 'level', label: 'Nível', type: 'line', axis: 'right', color: t.accent2 },
          ]}
        />
      </Panel>
      <Panel title="XP por origem" icon="compass">
        <DonutChart data={d.bySource.map((s) => ({ label: s.label, value: s.xp }))} height={200} />
      </Panel>
      <Panel title="XP vitalício acumulado" icon="chevrons-up" className="lg:col-span-2">
        <TimeSeriesChart data={d.series} granularity={granularity} height={220} yUnit="XP" series={[{ key: 'cumulativeXp', label: 'XP acumulado', type: 'area' }]} />
      </Panel>
      <Panel title="Níveis alcançados" icon="crown">
        {d.levels.length === 0 ? (
          <EmptyState icon="crown" title="Nenhum nível alcançado ainda" />
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto pr-1 text-sm">
            {[...d.levels].reverse().map((l) => (
              <li key={l.level} className="flex justify-between">
                <span>
                  Nível <span className="num text-accent">{l.level}</span>
                </span>
                <span className="text-faint">{fmtDate(l.reachedAt.slice(0, 10), { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Projeção (estimativa)" icon="hourglass" className="lg:col-span-3">
        <p className="text-sm">
          {d.projection.daysToNextLevel == null ? (
            'Sem ritmo de ganho no período para estimar o próximo nível.'
          ) : (
            <>
              Próximo nível em cerca de <span className="num text-accent">{d.projection.daysToNextLevel}</span> dia(s).
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-faint">Premissa: {d.projection.assumption} O ritmo futuro pode ser diferente do passado.</p>
      </Panel>
    </div>
  );
}

function ProductivityTab({ days, granularity }: { days: number; granularity: Granularity }) {
  const t = useChartTheme();
  const q = useStats<Productivity>('productivity', days, granularity);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const missions = d.missions.map((m) => {
    const c = Number(m.completed ?? 0);
    const f = Number(m.failed ?? 0);
    return { ...m, rate: c + f > 0 ? Math.round((c / (c + f)) * 1000) / 10 : null };
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Resumo do período" icon="list-checks" className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Missões concluídas" value={fmt(d.totals.completed)} tone="success" />
          <Stat label="Missões falhadas/expiradas" value={fmt(d.totals.failed)} tone="danger" />
          <Stat label="Taxa de conclusão" value={pct(d.totals.missionCompletionRate)} hint="concluídas ÷ (concluídas + falhas)" />
          <Stat label="Adesão a hábitos" value={pct(d.totals.habitRate)} hint={`${fmt(d.totals.habitsDone)} cumpridos · ${fmt(d.totals.habitsMissed)} falhas`} />
        </div>
      </Panel>
      <Panel title="Missões: concluídas × falhadas" icon="swords">
        <TimeSeriesChart
          data={missions}
          granularity={granularity}
          rightUnit="%"
          series={[
            { key: 'completed', label: 'Concluídas', type: 'bar', stack: 'm', color: t.success },
            { key: 'failed', label: 'Falhadas/expiradas', type: 'bar', stack: 'm', color: t.danger },
            { key: 'rate', label: 'Taxa de conclusão', type: 'line', axis: 'right', unit: '%', color: t.accent },
          ]}
        />
      </Panel>
      <Panel title="Hábitos e consistência" icon="flame">
        <TimeSeriesChart
          data={d.habits}
          granularity={granularity}
          rightUnit="%"
          series={[
            { key: 'done', label: 'Cumpridos', type: 'bar', stack: 'h', color: t.success },
            { key: 'tolerated', label: 'Falhas toleradas', type: 'bar', stack: 'h', color: t.warning },
            { key: 'missed', label: 'Falhas', type: 'bar', stack: 'h', color: t.danger },
            { key: 'rate', label: 'Taxa de cumprimento', type: 'line', axis: 'right', unit: '%', color: t.accent },
          ]}
        />
        <p className="mt-1 text-xs text-faint">Dias dispensados (descanso, indisponibilidade, pausa) não contam como falha nem entram na taxa.</p>
      </Panel>
      <Panel title="Horas de estudo" icon="book-open">
        <TimeSeriesChart
          data={d.study}
          granularity={granularity}
          yUnit="min"
          series={[
            { key: 'studyMinutes', label: 'Minutos de estudo', type: 'bar', unit: 'min' },
            { key: 'studySessions', label: 'Sessões', type: 'line', axis: 'right', color: t.accent2 },
          ]}
        />
      </Panel>
      <Panel title="Treinos" icon="dumbbell">
        <TimeSeriesChart
          data={d.training}
          granularity={granularity}
          yUnit="min"
          rightUnit="km"
          series={[
            { key: 'trainingMinutes', label: 'Minutos de treino', type: 'bar', unit: 'min' },
            { key: 'trainingSessions', label: 'Sessões', type: 'line', color: t.accent2 },
            { key: 'distanceKm', label: 'Distância', type: 'line', axis: 'right', unit: 'km', color: t.success, dashed: true },
          ]}
        />
      </Panel>
      <Panel title="Distribuição do esforço por área" icon="compass">
        <DonutChart data={d.effort.map((e) => ({ label: e.label, value: e.xp, color: e.color }))} />
        <p className="mt-2 text-xs text-faint">XP do período por categoria; sem categoria, agrupado pela origem.</p>
      </Panel>
      <Panel title="Estudo por disciplina e treino por tipo" icon="library">
        <p className="mb-1 text-xs text-faint">Minutos de estudo por disciplina</p>
        <DonutChart data={d.studyBySubject.map((s) => ({ label: s.subject, value: s.minutes, color: s.color }))} height={160} unit="min" />
        <div className="divider my-3" />
        {d.trainingByType.length === 0 ? (
          <p className="text-sm text-faint">Nenhum treino no período.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tipo de treino</th>
                <th>Sessões</th>
                <th>Minutos</th>
              </tr>
            </thead>
            <tbody>
              {d.trainingByType.map((r) => (
                <tr key={r.type}>
                  <td>{r.type}</td>
                  <td className="num">{fmt(r.sessions)}</td>
                  <td className="num">{fmt(r.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function EconomyTab({ days, granularity }: { days: number; granularity: Granularity }) {
  const t = useChartTheme();
  const q = useStats<Economy>('economy', days, granularity);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const earned = d.series.reduce((a, s) => a + Number(s.earned ?? 0), 0);
  const spent = d.series.reduce((a, s) => a + Number(s.spent ?? 0), 0);
  const penalties = d.series.reduce((a, s) => a + Number(s.penalties ?? 0), 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Resumo do período" icon="coins" className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Saldo atual" value={<Coins value={d.wallet?.balance ?? 0} />} />
          <Stat label="Recebidas" value={fmt(earned)} tone="success" />
          <Stat label="Gastas" value={fmt(spent)} />
          <Stat label="Perdidas em penalidades" value={fmt(penalties)} tone="danger" />
          <Stat label="Total histórico recebido" value={fmt(d.wallet?.totalEarned ?? 0)} hint={`gasto: ${fmt(d.wallet?.totalSpent ?? 0)}`} />
        </div>
      </Panel>
      <Panel title="Moedas recebidas, gastas e saldo" icon="trending-up" className="lg:col-span-2">
        <TimeSeriesChart
          data={d.series}
          granularity={granularity}
          height={280}
          yUnit="moedas"
          rightUnit="saldo"
          series={[
            { key: 'earned', label: 'Recebidas', type: 'bar', color: t.success },
            { key: 'spent', label: 'Gastas', type: 'bar', color: t.accent2 },
            { key: 'penalties', label: 'Penalidades', type: 'bar', color: t.danger },
            { key: 'balance', label: 'Saldo ao fim do período', type: 'line', axis: 'right', color: t.accent },
          ]}
        />
        <p className="mt-1 text-xs text-faint">Estornos, reembolsos e ajustes entram no saldo, mas não nas barras.</p>
      </Panel>
      <Panel title="Fontes de moedas" icon="coins">
        <DonutChart data={d.sources.map((s) => ({ label: SOURCE_LABELS[s.category] ?? s.category, value: s.total }))} unit="moedas" />
      </Panel>
      <Panel title="Gastos por categoria" icon="shopping-bag">
        <DonutChart data={d.spending.map((s) => ({ label: s.category, value: s.total }))} unit="moedas" />
      </Panel>
      <Panel title="Emissão de moedas (inflação virtual)" icon="refresh">
        <TimeSeriesChart data={d.inflation} granularity={granularity} yUnit="moedas" series={[{ key: 'coinsPerActiveDay', label: 'Moedas por dia ativo', type: 'line' }]} />
        <p className="mt-1 text-xs text-faint">Ritmo médio de moedas ganhas por dia com atividade. Alta contínua com preços fixos indica inflação.</p>
      </Panel>
      <Panel title="Efeito das penalidades" icon="skull">
        {d.penaltyEffect.length === 0 ? (
          <EmptyState icon="shield-check" title="Nenhuma penalidade aplicada no período" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Ocorrências</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {d.penaltyEffect.map((p) => (
                <tr key={p.type}>
                  <td>{PENALTY_TYPE_LABELS[p.type] ?? p.type}</td>
                  <td className="num">{fmt(p.count)}</td>
                  <td className="num">{p.type === 'coin_loss' ? `${fmt(p.amount)} moedas` : fmt(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="Recompensas mais adquiridas" icon="trophy">
        {d.topItems.length === 0 ? (
          <EmptyState icon="shopping-bag" title="Nenhuma compra ainda" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Unidades</th>
                <th>Total gasto</th>
              </tr>
            </thead>
            <tbody>
              {d.topItems.map((i) => (
                <tr key={i.name}>
                  <td>{i.name}</td>
                  <td className="num">{fmt(i.count)}</td>
                  <td>
                    <Coins value={i.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="Projeção de compra (estimativa)" icon="hourglass">
        <p className="mb-2 text-xs text-faint">Premissa: {d.projection.assumption} Não é uma promessa.</p>
        {d.projection.items.length === 0 ? (
          <p className="text-sm text-faint">Nenhum item à venda.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Preço</th>
                  <th>Estimativa</th>
                </tr>
              </thead>
              <tbody>
                {d.projection.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>
                      <Coins value={i.price} />
                    </td>
                    <td className="text-sm">{i.days === 0 ? <Badge tone="success">disponível agora</Badge> : i.days === null ? <span className="text-faint">sem ritmo para estimar</span> : `≈ ${i.days} dia(s)`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AttributesTab({ days, granularity }: { days: number; granularity: Granularity }) {
  const radar = useQuery({ queryKey: ['stats', 'radar', days], queryFn: () => api.get<RadarData>(`/api/stats/attributes/radar?compareDays=${days}`) });
  const history = useStats<AttrHistory>('attributes/history', days, granularity);
  const mastery = useQuery({ queryKey: ['stats', 'mastery'], queryFn: () => api.get<Skill[]>('/api/stats/mastery') });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Radar de atributos" icon="git-branch">
        {radar.isLoading ? (
          <Loading />
        ) : radar.isError || !radar.data ? (
          <ErrorState error={radar.error} onRetry={() => radar.refetch()} />
        ) : (
          <AttributeRadar
            height={320}
            compareLabel={`Em ${fmtDate(radar.data.compareDate)}`}
            data={radar.data.attributes.map((a) => ({ code: a.code, name: a.name, level: a.level, previousLevel: a.previousLevel, xp: a.xp }))}
          />
        )}
      </Panel>
      <Panel title="Evolução dos atributos (nível)" icon="trending-up">
        {history.isLoading ? (
          <Loading />
        ) : history.isError || !history.data ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} />
        ) : (
          <TimeSeriesChart
            data={history.data.series}
            granularity={granularity}
            height={320}
            yUnit="nível"
            series={history.data.attributes.map((a) => ({ key: a.code, label: a.name, type: 'line' as const, color: a.color }))}
          />
        )}
      </Panel>
      <Panel title="Maestria por habilidade" icon="sparkles" className="lg:col-span-2">
        {mastery.isLoading ? (
          <Loading />
        ) : mastery.isError || !mastery.data ? (
          <ErrorState error={mastery.error} onRetry={() => mastery.refetch()} />
        ) : mastery.data.filter((s) => s.xp > 0).length === 0 ? (
          <EmptyState icon="sparkles" title="Nenhuma maestria acumulada ainda">
            Estudos, avaliações e treinos concedem XP de maestria às habilidades vinculadas.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...mastery.data]
              .filter((s) => s.xp > 0)
              .sort((a, b) => b.xp - a.xp)
              .map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <Icon name={s.icon} size={18} className="shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{s.name}</span>
                      <span className="num text-faint">Nv {s.level}</span>
                    </div>
                    <ProgressBar value={s.progress} className="mt-1 !h-1.5" label={`Maestria em ${s.name}`} />
                    <p className="mt-0.5 text-xs text-faint">
                      {fmt(s.xp)} XP · faltam {fmt(s.xpToNext)}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-faint">Tempo de estudo sozinho não é prova de domínio: avaliações e marcos demonstrados pesam mais na maestria.</p>
      </Panel>
    </div>
  );
}
