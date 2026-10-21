import { Link } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { XP_SOURCE_LABELS } from '@rpg/engine';
import { api } from '../../lib/api';
import { fmt, fmtDate, pct, signed } from '../../lib/format';
import type { AfterAction, Dashboard, Habit, Mission, RewardOutcome } from '../../lib/types';
import { AttributeRadar, DonutChart, StatusStrip, TimeSeriesChart } from '../../components/charts/Charts';
import { Icon } from '../../components/ui/Icon';
import { Coins, DifficultyBadge, RarityBadge } from '../../components/ui/domain';
import { Badge, Button, EmptyState, ErrorState, Loading, PageHeader, Panel, ProgressBar, Stat } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

const RECORD_LABEL: Record<string, string> = {
  longest_run_km: 'Maior corrida',
  best_pace_5k_plus: 'Melhor ritmo (≥5 km)',
  estimated_1rm: '1RM estimado',
};

function recordValue(r: { kind: string; value: number; unit: string }) {
  if (r.kind === 'best_pace_5k_plus') return `${(-r.value).toFixed(2)} min/km`;
  return `${fmt(r.value)} ${r.unit}`;
}

export function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/api/dashboard') });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const order = d.widgets ?? [];
  const visible = (id: string) => order.length === 0 || order.find((w) => w.id === id)?.visible !== false;
  const position = (id: string) => {
    const i = order.findIndex((w) => w.id === id);
    return i === -1 ? 99 : i;
  };

  const widgets: Array<{ id: string; span: string; node: React.ReactNode }> = [
    { id: 'character', span: 'lg:col-span-1', node: <CharacterWidget d={d} /> },
    { id: 'alerts', span: 'lg:col-span-2', node: <AlertsWidget d={d} /> },
    { id: 'today', span: 'lg:col-span-1', node: <TodayWidget d={d} /> },
    { id: 'habits', span: 'lg:col-span-1', node: <HabitsWidget habits={d.habitsToday} /> },
    { id: 'weekly', span: 'lg:col-span-1', node: <WeeklyWidget missions={d.weeklyMissions} /> },
    { id: 'radar', span: 'lg:col-span-1', node: <RadarWidget d={d} /> },
    { id: 'xp_chart', span: 'lg:col-span-2', node: <XpWidget d={d} /> },
    { id: 'effort', span: 'lg:col-span-1', node: <EffortWidget d={d} /> },
    { id: 'goals', span: 'lg:col-span-1', node: <GoalsWidget d={d} /> },
    { id: 'streaks', span: 'lg:col-span-1', node: <StreaksWidget d={d} /> },
    { id: 'season', span: 'lg:col-span-1', node: <SeasonWidget d={d} /> },
    { id: 'recent', span: 'lg:col-span-2', node: <RecentWidget d={d} /> },
    { id: 'achievements', span: 'lg:col-span-1', node: <AchievementsWidget d={d} /> },
    { id: 'records', span: 'lg:col-span-1', node: <RecordsWidget d={d} /> },
  ];

  return (
    <>
      <PageHeader
        title="Painel de comando"
        icon="dashboard"
        subtitle={
          <>
            {fmtDate(d.today, { weekday: 'long', day: 'numeric', month: 'long' })} · hoje: <span className="num text-accent">{signed(d.todayTotals.xp)} XP</span> ·{' '}
            <span className="num" style={{ color: 'var(--coin)' }}>
              {signed(d.todayTotals.coins)} moedas
            </span>
          </>
        }
        actions={
          <Link to="/configuracoes?aba=painel" className="btn btn-ghost btn-sm">
            <Icon name="settings" size={14} /> Personalizar
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {widgets
          .filter((w) => visible(w.id))
          .sort((a, b) => position(a.id) - position(b.id))
          .map((w) => (
            <div key={w.id} className={`animate-rise min-w-0 ${w.span} ${w.span.includes('2') ? 'md:col-span-2' : ''}`}>
              {w.node}
            </div>
          ))}
      </div>
    </>
  );
}

function CharacterWidget({ d }: { d: Dashboard }) {
  const c = d.character;
  return (
    <Panel title="Personagem" icon="user" className="h-full">
      <div className="flex items-center gap-4">
        <div className="avatar-frame grid h-20 w-20 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: c.equipped.frame?.color ?? 'var(--accent)', boxShadow: 'var(--glow)' }}>
          <div className="text-center leading-none">
            <span className="block text-[0.6rem] text-faint uppercase">nível</span>
            <span className="num text-3xl text-accent">{c.level.level}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-lg">{c.name}</p>
          {c.equipped.title && <p className="text-sm text-accent">{c.equipped.title}</p>}
          {c.rank && (
            <Badge tone="accent" title={c.nextRank ? `Próximo rank: ${c.nextRank.code} no nível ${c.nextRank.minLevel}` : 'Rank máximo'}>
              Rank {c.rank.code} — {c.rank.name}
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Progresso do nível</span>
          <span className="num">
            {fmt(c.level.xpIntoLevel)} / {fmt(c.level.xpForNextLevel)} XP
          </span>
        </div>
        <ProgressBar xp value={c.level.progress} label="Progresso do nível" />
        <p className="mt-1 text-xs text-faint">
          Faltam <span className="num">{fmt(c.level.xpToNextLevel)}</span> XP
          {d.projection.daysToNextLevel != null && <> · ~{d.projection.daysToNextLevel} dias no ritmo atual</>}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="XP total" value={fmt(c.level.totalXp)} />
        <Stat label="Moedas" value={<Coins value={c.coins} />} />
        <Stat
          label="Consistência"
          value={`×${c.multiplier.multiplier.toFixed(2)}`}
          hint={c.multiplier.scheduled ? `${c.multiplier.completed}/${c.multiplier.scheduled} hábitos (14 d)` : 'sem dados'}
        />
      </div>
    </Panel>
  );
}

function AlertsWidget({ d }: { d: Dashboard }) {
  const label: Record<string, string> = { due_today: 'Prazo hoje', due_tomorrow: 'Prazo amanhã', failed: 'Falhou', expired: 'Expirou', penalty: 'Penalidade' };
  const tone: Record<string, 'warning' | 'danger' | 'muted' | 'info'> = { due_today: 'warning', due_tomorrow: 'info', failed: 'danger', expired: 'muted', penalty: 'danger' };
  return (
    <Panel title="Alertas" icon="alert-triangle" className="h-full">
      {d.alerts.length === 0 ? (
        <EmptyState icon="shield-check" title="Nenhum alerta">
          Sem prazos próximos, falhas ou penalidades recentes.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {d.alerts.map((a, i) => (
            <li key={i} className="flex items-center gap-3 py-2">
              <Badge tone={tone[a.kind] ?? 'muted'}>{label[a.kind] ?? a.kind}</Badge>
              <Link to={a.link} className="min-w-0 flex-1 truncate hover:text-accent">
                {a.title}
              </Link>
              {a.date && <span className="text-xs text-faint">{fmtDate(a.date)}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MissionRow({ m }: { m: Mission }) {
  const toast = useToast();
  const complete = useMutation({
    mutationFn: () => api.post<{ reward: RewardOutcome | null; after: AfterAction }>(`/api/missions/${m.id}/action`, { action: 'complete' }),
    onSuccess: (r) => toast.reward(r.reward, r.after, 'Missão concluída'),
    onError: (e) => toast.error(e),
  });
  const done = m.status === 'completed';
  const required = m.objectives.filter((o) => !o.optional);
  const progress = required.length ? required.reduce((a, o) => a + Math.min(1, o.current / o.target), 0) / required.length : null;
  return (
    <li className="flex items-center gap-3 py-2">
      <button
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong hover:border-accent disabled:opacity-50"
        aria-label={done ? 'Concluída' : `Concluir ${m.title}`}
        disabled={done || complete.isPending || (progress !== null && progress < 1)}
        title={progress !== null && progress < 1 ? 'Conclua os objetivos primeiro' : undefined}
        onClick={() => complete.mutate()}
      >
        {done && <Icon name="check" size={14} className="text-success" />}
      </button>
      <Link to={`/missoes/${m.id}`} className={`min-w-0 flex-1 truncate hover:text-accent ${done ? 'text-faint line-through' : ''}`}>
        {m.title}
      </Link>
      {progress !== null && !done && <span className="num text-xs text-faint">{pct(progress)}</span>}
      <DifficultyBadge value={m.difficulty} />
    </li>
  );
}

function TodayWidget({ d }: { d: Dashboard }) {
  const pending = d.todayMissions.filter((m) => m.status !== 'completed');
  const done = d.todayMissions.filter((m) => m.status === 'completed');
  return (
    <Panel title="Missões de hoje" icon="swords" className="h-full" actions={<Link to="/missoes?nova=1" className="btn btn-ghost btn-sm" aria-label="Nova missão"><Icon name="plus" size={14} /></Link>}>
      {d.todayMissions.length === 0 ? (
        <EmptyState icon="map" title="Nenhuma missão para hoje" action={<Link className="btn btn-secondary btn-sm" to="/missoes?nova=1">Criar missão</Link>}>
          Missões diárias e com prazo hoje aparecem aqui.
        </EmptyState>
      ) : (
        <>
          <p className="mb-1 text-xs text-faint">
            {done.length} de {d.todayMissions.length} concluídas
          </p>
          <ul className="divide-y divide-line">
            {[...pending, ...done].map((m) => (
              <MissionRow key={m.id} m={m} />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

export function HabitCheck({ h }: { h: Habit }) {
  const toast = useToast();
  const check = useMutation({
    mutationFn: () => api.post<{ reward: RewardOutcome | null; after: AfterAction; streak: { current: number; milestones: number[] } | null }>(`/api/habits/${h.id}/checkins`, { status: 'done' }),
    onSuccess: (r) => {
      toast.reward(r.reward, r.after, h.title);
      for (const m of r.streak?.milestones ?? []) toast.success(`Marco de sequência: ${m} seguidas em "${h.title}"`);
    },
    onError: (e) => toast.error(e),
  });
  const done = h.todayStatus === 'done';
  const disabled = !h.scheduledToday || h.todayStatus !== null || h.status !== 'active' || check.isPending;
  return (
    <button
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] border transition-colors ${done ? 'border-success bg-success/15' : 'border-line-strong hover:border-accent'} disabled:cursor-not-allowed`}
      aria-label={done ? `${h.title}: cumprido` : `Marcar ${h.title} como cumprido`}
      aria-pressed={done}
      disabled={disabled}
      onClick={() => check.mutate()}
    >
      {done && <Icon name="check" size={15} className="text-success" />}
      {h.todayStatus && h.todayStatus !== 'done' && <Icon name="minus" size={14} className="text-faint" />}
    </button>
  );
}

function HabitsWidget({ habits }: { habits: Habit[] }) {
  const today = habits.filter((h) => h.scheduledToday && h.status === 'active');
  const done = today.filter((h) => h.todayStatus === 'done').length;
  return (
    <Panel title="Hábitos do dia" icon="flame" className="h-full" actions={<Link to="/habitos" className="btn btn-ghost btn-sm">Todos</Link>}>
      {today.length === 0 ? (
        <EmptyState icon="flame" title="Nenhum hábito programado hoje" action={<Link className="btn btn-secondary btn-sm" to="/habitos?novo=1">Criar hábito</Link>} />
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <ProgressBar value={done / today.length} className="flex-1" label="Hábitos cumpridos hoje" />
            <span className="num text-xs text-faint">
              {done}/{today.length}
            </span>
          </div>
          <ul className="space-y-2">
            {today.map((h) => (
              <li key={h.id} className="flex items-center gap-3">
                <HabitCheck h={h} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{h.title}</p>
                  <StatusStrip days={h.last14.slice(-10)} />
                </div>
                {h.currentStreak > 0 && (
                  <span className="num inline-flex items-center gap-0.5 text-xs text-warning" title="Sequência atual">
                    <Icon name="flame" size={13} />
                    {h.currentStreak}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function WeeklyWidget({ missions }: { missions: Mission[] }) {
  return (
    <Panel title="Missões da semana" icon="calendar" className="h-full">
      {missions.length === 0 ? (
        <EmptyState icon="calendar" title="Sem missões semanais ativas">
          Ative modelos recorrentes em Missões → Modelos.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {missions.map((m) => (
            <li key={m.id}>
              <div className="flex items-center justify-between gap-2">
                <Link to={`/missoes/${m.id}`} className="truncate hover:text-accent">
                  {m.title}
                </Link>
                <DifficultyBadge value={m.difficulty} />
              </div>
              <ul className="mt-1.5 space-y-1">
                {m.objectives.map((o) => (
                  <li key={o.id} className="text-xs">
                    <div className="flex justify-between text-muted">
                      <span className="truncate">{o.title}</span>
                      <span className="num">
                        {fmt(o.current)}/{fmt(o.target)} {o.unit ?? ''}
                      </span>
                    </div>
                    <ProgressBar value={o.current / o.target} className="mt-0.5 !h-1.5" label={o.title} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RadarWidget({ d }: { d: Dashboard }) {
  return (
    <Panel title="Atributos" icon="git-branch" className="h-full" actions={<Link to="/atributos" className="btn btn-ghost btn-sm">Detalhes</Link>}>
      <AttributeRadar
        height={260}
        compareLabel={`Há 30 dias (${fmtDate(d.radar.compareDate)})`}
        data={d.radar.attributes.map((a) => ({ code: a.code, name: a.name, level: a.level, previousLevel: a.previousLevel, xp: a.xp }))}
      />
    </Panel>
  );
}

function XpWidget({ d }: { d: Dashboard }) {
  return (
    <Panel title={`XP e moedas — últimos ${d.periodDays} dias`} icon="trending-up" className="h-full">
      <TimeSeriesChart
        data={d.dailySeries}
        series={[
          { key: 'xp', label: 'XP', type: 'bar' },
          { key: 'coins', label: 'Moedas', type: 'line', axis: 'right', color: 'var(--coin)' },
        ]}
        height={230}
      />
      <div className="divider my-3" />
      <p className="mb-1 text-xs text-faint">Evolução semanal (8 semanas; a semana atual está em andamento)</p>
      <TimeSeriesChart data={d.weeklyXp} granularity="week" series={[{ key: 'xp', label: 'XP na semana', type: 'area' }]} height={140} />
      <p className="mt-2 text-xs text-faint">Projeção: {d.projection.assumption}</p>
    </Panel>
  );
}

function EffortWidget({ d }: { d: Dashboard }) {
  return (
    <Panel title="Esforço por área" icon="compass" className="h-full">
      <DonutChart data={d.effort.map((e) => ({ label: e.label, value: e.xp, color: e.color }))} height={190} />
      <p className="mt-2 text-xs text-faint">Distribuição do XP dos últimos {d.periodDays} dias por categoria (ou origem, quando sem categoria).</p>
    </Panel>
  );
}

function GoalsWidget({ d }: { d: Dashboard }) {
  const label: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };
  return (
    <Panel title="Metas prioritárias" icon="target" className="h-full" actions={<Link to="/metas" className="btn btn-ghost btn-sm">Todas</Link>}>
      {d.priorityGoals.length === 0 ? (
        <EmptyState icon="target" title="Nenhuma meta ativa" action={<Link className="btn btn-secondary btn-sm" to="/metas?nova=1">Criar meta</Link>} />
      ) : (
        <ul className="space-y-3">
          {d.priorityGoals.map((g) => (
            <li key={g.id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{g.title}</span>
                <span className="num text-faint">{pct(g.progress)}</span>
              </div>
              <ProgressBar value={g.progress} className="mt-1" label={g.title} />
              <p className="mt-0.5 text-xs text-faint">
                Prioridade {label[g.priority]}
                {g.deadline && <> · prazo {fmtDate(g.deadline)}</>}
                {g.blocked && <> · aguardando dependências</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function StreaksWidget({ d }: { d: Dashboard }) {
  return (
    <Panel title="Sequências ativas" icon="flame" className="h-full">
      {d.streaks.length === 0 ? (
        <EmptyState icon="flame" title="Nenhuma sequência ativa">
          Cada hábito tem sua própria sequência. Descanso programado não a interrompe.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {d.streaks.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <span className="num w-10 text-right text-xl text-warning">{s.current}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{s.title}</p>
                <p className="text-xs text-faint">
                  melhor: {s.best} {s.frequency === 'times_per_week' ? 'semanas' : 'ocorrências'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SeasonWidget({ d }: { d: Dashboard }) {
  const s = d.season;
  return (
    <Panel title="Temporada" icon="hourglass" className="h-full" actions={<Link to="/temporadas" className="btn btn-ghost btn-sm">Ver</Link>}>
      {!s ? (
        <EmptyState icon="hourglass" title="Nenhuma temporada ativa" action={<Link className="btn btn-secondary btn-sm" to="/temporadas">Criar temporada</Link>} />
      ) : (
        <>
          <p className="font-display">{s.name}</p>
          <p className="text-xs text-faint">
            {fmtDate(s.startDate)} — {fmtDate(s.endDate)} · {s.daysLeft} dias restantes
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="XP sazonal" value={fmt(s.stats.seasonXp)} />
            <Stat label="Missões" value={fmt(s.stats.missionsCompleted)} />
            <Stat label="Hábitos" value={fmt(s.stats.habitsDone)} />
          </div>
          {s.rewards.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {s.rewards.map((r) => (
                <li key={r.id} className="text-xs">
                  <div className="flex justify-between">
                    <span className={r.claimedAt ? 'text-success' : 'text-muted'}>
                      {r.claimedAt && <Icon name="check" size={12} className="mr-1 inline" />}
                      {r.title}
                    </span>
                    <span className="num text-faint">{fmt(r.thresholdXp)} XP</span>
                  </div>
                  <ProgressBar value={s.stats.seasonXp / r.thresholdXp} className="mt-0.5 !h-1.5" label={r.title} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function RecentWidget({ d }: { d: Dashboard }) {
  return (
    <Panel title="Recompensas recentes" icon="history" className="h-full" actions={<Link to="/historico" className="btn btn-ghost btn-sm">Histórico</Link>}>
      {d.recent.length === 0 ? (
        <EmptyState icon="sparkles" title="Nenhuma recompensa ainda">
          Conclua uma missão, cumpra um hábito ou registre um estudo para começar.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {d.recent.map((g) => (
            <li key={g.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {g.title}
                    {g.reversedAt && <Badge tone="muted" className="ml-2">estornada</Badge>}
                  </span>
                  <span className="hidden text-xs text-faint sm:inline">{XP_SOURCE_LABELS[g.xpSource]}</span>
                  <span className={`num text-sm ${g.xp < 0 ? 'text-danger' : 'text-accent'}`}>{signed(g.xp)} XP</span>
                  <span className="num w-14 text-right text-sm" style={{ color: 'var(--coin)' }}>
                    {signed(g.coins)}
                  </span>
                </summary>
                <ul className="mt-1 ml-1 space-y-0.5 text-xs text-muted">
                  {g.explanation.map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                  <li className="text-faint">
                    {fmtDate(g.localDate)} · regras v{g.configVersion}
                  </li>
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AchievementsWidget({ d }: { d: Dashboard }) {
  return (
    <Panel title="Próximas conquistas" icon="trophy" className="h-full" actions={<Link to="/conquistas" className="btn btn-ghost btn-sm">Todas</Link>}>
      {d.nextAchievements.length === 0 ? (
        <EmptyState icon="trophy" title="Todas as conquistas visíveis foram desbloqueadas" />
      ) : (
        <ul className="space-y-3">
          {d.nextAchievements.map((a) => (
            <li key={a.id} className="flex gap-3">
              <Icon name={a.icon} size={22} className="mt-0.5 shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm">{a.name}</p>
                  <RarityBadge value={a.rarity} />
                </div>
                <p className="truncate text-xs text-faint">{a.description}</p>
                <ProgressBar value={a.progress} className="mt-1 !h-1.5" label={a.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecordsWidget({ d }: { d: Dashboard }) {
  return (
    <Panel title="Recordes recentes" icon="medal" className="h-full" actions={<Link to="/treinos?aba=recordes" className="btn btn-ghost btn-sm">Todos</Link>}>
      {d.records.length === 0 ? (
        <EmptyState icon="medal" title="Nenhum recorde nos últimos 30 dias" />
      ) : (
        <ul className="space-y-2">
          {d.records.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted">{RECORD_LABEL[r.kind] ?? r.kind}</span>
              <span className="num">{recordValue(r)}</span>
              <span className="text-xs text-faint">{fmtDate(r.achievedOn)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export { recordValue, RECORD_LABEL };
