import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activityInput, activityTypeInput, exerciseInput } from '@rpg/contracts';
import { ACTIVITY_CATEGORIES, ACTIVITY_CATEGORY_LABELS, type ActivityCategory } from '@rpg/engine';
import type { z } from 'zod';
import { api } from '../../lib/api';
import { fmt, fmt1, fmtDate } from '../../lib/format';
import type { AfterAction, RewardOutcome, SeriesPoint } from '../../lib/types';
import { useSession } from '../../app/session';
import { FormActions, useForm, useLookups, WeightsEditor } from '../../components/forms';
import { DonutChart, TimeSeriesChart } from '../../components/charts/Charts';
import { AttrWeights } from '../../components/ui/domain';
import { Icon, ICON_NAMES } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Badge, Button, EmptyState, ErrorState, Input, Loading, PageHeader, Panel, Select, Tabs, Textarea } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type Tab = 'registrar' | 'atividades' | 'recordes' | 'tipos';

interface ActivityType {
  id: string;
  name: string;
  category: ActivityCategory;
  icon: string;
  skillId: string | null;
  intensity: number;
  attributeWeights: Record<string, number>;
  archivedAt: string | null;
}
interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  archivedAt: string | null;
}
interface ActivityRow {
  id: string;
  typeId: string;
  typeName: string;
  category: ActivityCategory;
  title: string | null;
  localDate: string;
  durationMin: number;
  distanceKm: number | null;
  elevationM: number | null;
  avgHeartRate: number | null;
  perceivedEffort: number | null;
  notes: string | null;
  source: string;
  pace: number | null;
  volumeKg: number;
  sets: Array<{ id: string; setIndex: number; reps: number; weightKg: number | null; rir: number | null; exerciseName: string }>;
}
interface RecordRow {
  id: string;
  kind: string;
  value: number;
  unit: string;
  achievedOn: string;
  exerciseName: string | null;
}
interface Productivity {
  training: SeriesPoint[];
  trainingByType: Array<{ type: string; sessions: number; minutes: number }>;
}

const SOURCE_LABEL: Record<string, string> = { manual: 'Manual', strava: 'Strava', lyfta: 'Lyfta', hevy: 'Hevy', import: 'Importado', demo: 'Demonstração' };
const RECORD_LABEL: Record<string, string> = { longest_run_km: 'Maior corrida', best_pace_5k_plus: 'Melhor ritmo (≥ 5 km)', estimated_1rm: '1RM estimado' };

function recordText(r: RecordRow) {
  if (r.kind === 'best_pace_5k_plus') return `${fmt1(-Number(r.value))} min/km`;
  return `${fmt1(Number(r.value))} ${r.unit}`;
}

const numOrNull = (s: string) => (s === '' ? null : Number(s));

export function TrainingPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) ?? 'registrar';
  const setTab = (t: Tab) => setParams({ aba: t }, { replace: true });
  return (
    <>
      <PageHeader
        title="Treinos e atividades"
        icon="dumbbell"
        subtitle="Musculação, corrida, caminhada, ciclismo e outras atividades. Força, Resistência e Vitalidade evoluem com registros reais."
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'registrar', label: 'Registrar', icon: 'plus' },
          { value: 'atividades', label: 'Atividades', icon: 'activity' },
          { value: 'recordes', label: 'Recordes', icon: 'medal' },
          { value: 'tipos', label: 'Tipos e exercícios', icon: 'settings' },
        ]}
      />
      {tab === 'registrar' && <RegisterTab onDone={() => setTab('atividades')} />}
      {tab === 'atividades' && <ActivitiesTab />}
      {tab === 'recordes' && <RecordsTab />}
      {tab === 'tipos' && <TypesTab />}
    </>
  );
}

function useTypes(includeArchived = false) {
  return useQuery({
    queryKey: ['activity-types', includeArchived],
    queryFn: () => api.get<ActivityType[]>(`/api/activity-types${includeArchived ? '?includeArchived=true' : ''}`),
  });
}
function useExercises(includeArchived = false) {
  return useQuery({
    queryKey: ['exercises', includeArchived],
    queryFn: () => api.get<Exercise[]>(`/api/exercises${includeArchived ? '?includeArchived=true' : ''}`),
  });
}

// ------------------------------------------------------------------ Registrar

type ActivityForm = z.input<typeof activityInput>;

function RegisterTab({ onDone }: { onDone: () => void }) {
  const me = useSession();
  const toast = useToast();
  const types = useTypes();
  const exercises = useExercises();
  const [records, setRecords] = useState<string[]>([]);
  const initial: ActivityForm = {
    typeId: '',
    title: null,
    date: me.today,
    durationMin: 45,
    distanceKm: null,
    elevationM: null,
    avgHeartRate: null,
    perceivedEffort: null,
    notes: null,
    sets: [],
  };
  const form = useForm(activityInput, initial);
  const v = form.values;
  const type = types.data?.find((t) => t.id === v.typeId);
  const isStrength = type?.category === 'strength';
  const usesDistance = type && ['run', 'walk', 'cycle', 'swim'].includes(type.category);
  const sets = v.sets ?? [];
  const save = useMutation({
    mutationFn: (data: z.output<typeof activityInput>) =>
      api.post<{ reward: RewardOutcome | null; after: AfterAction; records: string[]; duplicate: boolean }>('/api/activities', data),
    onSuccess: (r) => {
      toast.reward(r.reward, r.after, 'Atividade registrada');
      setRecords(r.records ?? []);
      if (r.records?.length) toast.success(`Novo recorde pessoal: ${r.records.join(' · ')}`);
      form.setValues({ ...initial, typeId: v.typeId });
    },
    onError: (e) => {
      form.applyServerError(e);
      toast.error(e);
    },
  });

  if (types.isLoading) return <Loading />;
  if (types.isError) return <ErrorState error={types.error} onRetry={() => types.refetch()} />;
  if ((types.data ?? []).length === 0)
    return (
      <Panel>
        <EmptyState icon="dumbbell" title="Nenhum tipo de atividade">
          Cadastre um tipo (ex.: Musculação, Corrida) na aba "Tipos e exercícios".
        </EmptyState>
      </Panel>
    );

  const setRow = (i: number, patch: Partial<(typeof sets)[number]>) =>
    form.set(
      'sets',
      sets.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Novo registro" icon="plus" className="lg:col-span-2">
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const data = form.validate();
            if (data) save.mutate(data);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Tipo de atividade"
              value={v.typeId}
              onChange={(e) => form.set('typeId', e.target.value)}
              placeholder="Selecione…"
              error={form.errors.typeId}
              options={(types.data ?? []).map((t) => ({ value: t.id, label: `${t.name} (${ACTIVITY_CATEGORY_LABELS[t.category]})` }))}
            />
            <Input
              label="Data"
              type="date"
              value={v.date ?? ''}
              max={me.today}
              onChange={(e) => form.set('date', e.target.value || null)}
              error={form.errors.date}
            />
            <Input
              label="Duração (min)"
              type="number"
              min={1}
              max={1440}
              value={v.durationMin ?? ''}
              onChange={(e) => form.set('durationMin', Number(e.target.value))}
              error={form.errors.durationMin}
            />
          </div>
          <Input
            label="Título (opcional)"
            value={v.title ?? ''}
            onChange={(e) => form.set('title', e.target.value || null)}
            placeholder="Ex.: Treino A — empurrar"
          />
          <div className="grid gap-3 sm:grid-cols-4">
            {usesDistance && (
              <Input
                label="Distância (km)"
                type="number"
                min={0}
                step="0.01"
                value={v.distanceKm ?? ''}
                onChange={(e) => form.set('distanceKm', numOrNull(e.target.value))}
                error={form.errors.distanceKm}
              />
            )}
            {usesDistance && (
              <Input
                label="Elevação (m)"
                type="number"
                min={0}
                value={v.elevationM ?? ''}
                onChange={(e) => form.set('elevationM', numOrNull(e.target.value))}
              />
            )}
            <Input
              label="FC média (bpm)"
              type="number"
              min={30}
              max={250}
              value={v.avgHeartRate ?? ''}
              onChange={(e) => form.set('avgHeartRate', numOrNull(e.target.value))}
              error={form.errors.avgHeartRate}
            />
            <Select
              label="Esforço percebido"
              value={v.perceivedEffort == null ? '' : String(v.perceivedEffort)}
              onChange={(e) => form.set('perceivedEffort', numOrNull(e.target.value))}
              placeholder="—"
              options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}/10` }))}
            />
          </div>
          {v.distanceKm && v.durationMin ? (
            <p className="text-sm text-muted">
              Ritmo calculado: <span className="num">{fmt1(Number(v.durationMin) / Number(v.distanceKm))} min/km</span>
            </p>
          ) : null}

          {isStrength && (
            <fieldset className="space-y-2">
              <legend className="field-label">Séries</legend>
              {(exercises.data ?? []).length === 0 && <p className="text-sm text-faint">Cadastre exercícios na aba "Tipos e exercícios".</p>}
              {sets.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 gap-2 rounded-[var(--radius-sm)] border border-line p-2 sm:grid-cols-[1fr_5rem_6rem_5rem_auto] sm:items-end"
                >
                  <Select
                    className="col-span-2 sm:col-span-1"
                    label="Exercício"
                    value={s.exerciseId}
                    onChange={(e) => setRow(i, { exerciseId: e.target.value })}
                    placeholder="Selecione…"
                    error={form.errors[`sets.${i}.exerciseId`]}
                    options={(exercises.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                  />
                  <Input label="Reps" type="number" min={0} value={s.reps ?? ''} onChange={(e) => setRow(i, { reps: Number(e.target.value) })} />
                  <Input
                    label="Carga (kg)"
                    type="number"
                    min={0}
                    step="0.5"
                    value={s.weightKg ?? ''}
                    onChange={(e) => setRow(i, { weightKg: numOrNull(e.target.value) })}
                  />
                  <Input label="RIR" type="number" min={0} max={10} value={s.rir ?? ''} onChange={(e) => setRow(i, { rir: numOrNull(e.target.value) })} />
                  <div className="flex items-end gap-1 pb-0.5">
                    <Button
                      variant="ghost"
                      icon="plus"
                      aria-label="Duplicar série"
                      title="Duplicar série"
                      onClick={() => form.set('sets', [...sets.slice(0, i + 1), { ...s }, ...sets.slice(i + 1)])}
                    />
                    <Button
                      variant="ghost"
                      icon="trash"
                      aria-label="Remover série"
                      onClick={() =>
                        form.set(
                          'sets',
                          sets.filter((_, j) => j !== i),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                icon="plus"
                disabled={(exercises.data ?? []).length === 0}
                onClick={() =>
                  form.set('sets', [
                    ...sets,
                    { exerciseId: sets.at(-1)?.exerciseId ?? exercises.data?.[0]?.id ?? '', reps: 8, weightKg: sets.at(-1)?.weightKg ?? null, rir: null },
                  ])
                }
              >
                Adicionar série
              </Button>
              {sets.length > 0 && (
                <p className="text-xs text-faint">
                  Volume: <span className="num">{fmt(sets.reduce((a, s) => a + Number(s.reps ?? 0) * Number(s.weightKg ?? 0), 0))} kg</span> em {sets.length}{' '}
                  séries.
                </p>
              )}
            </fieldset>
          )}
          <Textarea label="Observações" value={v.notes ?? ''} onChange={(e) => form.set('notes', e.target.value || null)} rows={2} />
          {type && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-faint">
              Atributos deste tipo: <AttrWeights weights={type.attributeWeights} /> · intensidade ×{type.intensity}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onDone}>
              Ver atividades
            </Button>
            <Button type="submit" variant="primary" icon="check" loading={save.isPending}>
              Registrar atividade
            </Button>
          </div>
        </form>
      </Panel>
      <div className="space-y-4">
        <Panel title="Como o treino é recompensado" icon="info">
          <ul className="space-y-2 text-sm text-muted">
            <li>• XP por minuto com retornos decrescentes após 60 min e limite diário de treino: volume extra não gera mais recompensa.</li>
            <li>• Distância rende um bônus limitado; treinar além do razoável não é incentivado.</li>
            <li>• Descanso planejado faz parte do treinamento e nunca é tratado como falha.</li>
            <li>• Recordes pessoais são detectados automaticamente (maior corrida, ritmo, 1RM estimado).</li>
          </ul>
        </Panel>
        {records.length > 0 && (
          <Panel title="Recordes deste registro" icon="medal">
            <ul className="space-y-1 text-sm">
              {records.map((r) => (
                <li key={r} className="flex items-center gap-2 text-accent">
                  <Icon name="trending-up" size={14} /> {r}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Atividades

function ActivitiesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['activities'], queryFn: () => api.get<ActivityRow[]>('/api/activities?limit=200') });
  const prod = useQuery({
    queryKey: ['stats', 'productivity', 'training-90'],
    queryFn: () => api.get<Productivity>('/api/stats/productivity?granularity=week&days=90'),
  });
  const [open, setOpen] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/activities/${id}`),
    onSuccess: () => {
      toast.success('Atividade excluída e recompensa estornada');
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Treinos por semana (90 dias)" icon="bar-chart" className="lg:col-span-2">
          {prod.isLoading ? (
            <Loading />
          ) : prod.isError ? (
            <ErrorState error={prod.error} onRetry={() => prod.refetch()} />
          ) : (
            <>
              <TimeSeriesChart
                data={prod.data!.training}
                granularity="week"
                height={220}
                series={[
                  { key: 'trainingMinutes', label: 'Minutos', type: 'bar', unit: 'min' },
                  { key: 'trainingSessions', label: 'Sessões', type: 'line', axis: 'right' },
                ]}
              />
              <div className="divider my-3" />
              <p className="mb-1 text-xs text-faint">Distância semanal (km)</p>
              <TimeSeriesChart
                data={prod.data!.training}
                granularity="week"
                height={140}
                series={[{ key: 'distanceKm', label: 'Distância', type: 'area', unit: 'km' }]}
              />
            </>
          )}
        </Panel>
        <Panel title="Por tipo (90 dias)" icon="compass">
          {prod.data ? (
            <DonutChart data={prod.data.trainingByType.map((t) => ({ label: `${t.type} (${t.sessions})`, value: t.minutes }))} unit="min" height={190} />
          ) : (
            <Loading />
          )}
        </Panel>
      </div>

      <Panel title="Atividades registradas" icon="activity">
        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.length === 0 ? (
          <EmptyState icon="activity" title="Nenhuma atividade registrada">
            Registre um treino na aba "Registrar" ou conecte uma integração em Configurações.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {list.data!.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-faint">{fmtDate(a.localDate)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {a.title || a.typeName} <span className="text-faint">· {a.typeName}</span>
                  </span>
                  <span className="num text-sm">{a.durationMin} min</span>
                  {a.distanceKm != null && Number(a.distanceKm) > 0 && <span className="num text-sm">{fmt1(Number(a.distanceKm))} km</span>}
                  {a.pace != null && <span className="num text-sm text-muted">{fmt1(a.pace)} min/km</span>}
                  {a.volumeKg > 0 && <span className="num text-sm text-muted">{fmt(a.volumeKg)} kg</span>}
                  <Badge tone={a.source === 'manual' ? 'muted' : a.source === 'demo' ? 'warning' : 'info'}>{SOURCE_LABEL[a.source] ?? a.source}</Badge>
                  <div className="flex gap-1">
                    {(a.sets.length > 0 || a.notes) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={open === a.id ? 'chevron-down' : 'chevron-right'}
                        aria-expanded={open === a.id}
                        aria-label="Detalhes"
                        onClick={() => setOpen(open === a.id ? null : a.id)}
                      />
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label="Excluir atividade"
                      onClick={async () => {
                        const r = await confirm({
                          title: 'Excluir atividade',
                          message: 'A atividade será excluída e a recompensa correspondente (XP, atributos, maestria e moedas) será estornada no livro-razão.',
                          danger: true,
                          confirmLabel: 'Excluir',
                        });
                        if (r.ok) remove.mutate(a.id);
                      }}
                    />
                  </div>
                </div>
                {open === a.id && (
                  <div className="mt-2 ml-1 space-y-2 text-sm">
                    {a.sets.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Exercício</th>
                              <th>Reps</th>
                              <th>Carga</th>
                              <th>RIR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {a.sets.map((s) => (
                              <tr key={s.id}>
                                <td className="num">{s.setIndex}</td>
                                <td>{s.exerciseName}</td>
                                <td className="num">{s.reps}</td>
                                <td className="num">{s.weightKg != null ? `${fmt1(Number(s.weightKg))} kg` : '—'}</td>
                                <td className="num">{s.rir ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {a.notes && <p className="whitespace-pre-wrap text-muted">{a.notes}</p>}
                    {(a.avgHeartRate || a.perceivedEffort || a.elevationM) && (
                      <p className="text-xs text-faint">
                        {a.avgHeartRate ? `FC média ${a.avgHeartRate} bpm · ` : ''}
                        {a.perceivedEffort ? `esforço ${a.perceivedEffort}/10 · ` : ''}
                        {a.elevationM ? `elevação ${a.elevationM} m` : ''}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ Recordes

function RecordsTab() {
  const q = useQuery({ queryKey: ['records'], queryFn: () => api.get<RecordRow[]>('/api/records') });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data!;
  // Melhor marca atual por tipo/exercício + histórico de evolução.
  const best = new Map<string, RecordRow>();
  for (const r of rows) {
    const key = `${r.kind}:${r.exerciseName ?? ''}`;
    const cur = best.get(key);
    if (!cur || Number(r.value) > Number(cur.value)) best.set(key, r);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Melhores marcas" icon="medal">
        {best.size === 0 ? (
          <EmptyState icon="medal" title="Nenhum recorde ainda">
            Recordes aparecem automaticamente quando você supera uma marca anterior.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {[...best.values()].map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                <Icon name={r.kind === 'estimated_1rm' ? 'dumbbell' : 'footprints'} size={16} className="text-accent" />
                <span className="min-w-0 flex-1 truncate">
                  {RECORD_LABEL[r.kind] ?? r.kind}
                  {r.exerciseName && <span className="text-muted"> — {r.exerciseName}</span>}
                </span>
                <span className="num">{recordText(r)}</span>
                <span className="text-xs text-faint">{fmtDate(r.achievedOn)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Histórico de recordes" icon="history">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Sem registros.</p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Recorde</th>
                  <th>Marca</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDate(r.achievedOn)}</td>
                    <td>
                      {RECORD_LABEL[r.kind] ?? r.kind}
                      {r.exerciseName && <span className="text-muted"> — {r.exerciseName}</span>}
                    </td>
                    <td className="num">{recordText(r)}</td>
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

// ------------------------------------------------------------------ Tipos e exercícios

function TypesTab() {
  const [showArchived, setShowArchived] = useState(false);
  const types = useTypes(showArchived);
  const exercises = useExercises(showArchived);
  const lookups = useLookups();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editingType, setEditingType] = useState<ActivityType | 'new' | null>(null);
  const [editingEx, setEditingEx] = useState<Exercise | 'new' | null>(null);
  const archive = useMutation({
    mutationFn: ({ path, id, action }: { path: string; id: string; action: 'archive' | 'unarchive' }) => api.post(`/api/${path}/${id}/${action}`),
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: ({ path, id }: { path: string; id: string }) => api.del(`/api/${path}/${id}`),
    onSuccess: () => {
      toast.success('Excluído');
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e),
  });
  const askDelete = async (path: string, id: string, name: string) => {
    const r = await confirm({
      title: 'Excluir',
      message: `Excluir "${name}"? Se houver histórico vinculado, a exclusão será recusada — arquive em vez disso.`,
      danger: true,
      confirmLabel: 'Excluir',
    });
    if (r.ok) remove.mutate({ path, id });
  };
  const skillName = (id: string | null) => lookups.data?.skills.find((s) => s.id === id)?.name;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar arquivados
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Tipos de atividade"
          icon="activity"
          actions={
            <Button size="sm" icon="plus" onClick={() => setEditingType('new')}>
              Novo tipo
            </Button>
          }
        >
          {types.isLoading ? (
            <Loading />
          ) : types.isError ? (
            <ErrorState error={types.error} onRetry={() => types.refetch()} />
          ) : types.data!.length === 0 ? (
            <EmptyState icon="activity" title="Nenhum tipo cadastrado" />
          ) : (
            <ul className="divide-y divide-line">
              {types.data!.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Icon name={t.icon} size={18} className="text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {t.name} {t.archivedAt && <Badge>arquivado</Badge>}
                    </p>
                    <p className="flex flex-wrap items-center gap-1 text-xs text-faint">
                      {ACTIVITY_CATEGORY_LABELS[t.category]} · intensidade ×{t.intensity}
                      {skillName(t.skillId) && <> · maestria: {skillName(t.skillId)}</>}
                    </p>
                    <AttrWeights weights={t.attributeWeights} />
                  </div>
                  <Button size="sm" variant="ghost" icon="pencil" aria-label={`Editar ${t.name}`} onClick={() => setEditingType(t)} />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={t.archivedAt ? 'undo' : 'archive'}
                    aria-label={t.archivedAt ? 'Desarquivar' : 'Arquivar'}
                    title={t.archivedAt ? 'Desarquivar' : 'Arquivar'}
                    onClick={() => archive.mutate({ path: 'activity-types', id: t.id, action: t.archivedAt ? 'unarchive' : 'archive' })}
                  />
                  <Button size="sm" variant="ghost" icon="trash" aria-label={`Excluir ${t.name}`} onClick={() => askDelete('activity-types', t.id, t.name)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Exercícios"
          icon="dumbbell"
          actions={
            <Button size="sm" icon="plus" onClick={() => setEditingEx('new')}>
              Novo exercício
            </Button>
          }
        >
          {exercises.isLoading ? (
            <Loading />
          ) : exercises.isError ? (
            <ErrorState error={exercises.error} onRetry={() => exercises.refetch()} />
          ) : exercises.data!.length === 0 ? (
            <EmptyState icon="dumbbell" title="Nenhum exercício cadastrado" />
          ) : (
            <ul className="divide-y divide-line">
              {exercises.data!.map((x) => (
                <li key={x.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {x.name} {x.archivedAt && <Badge>arquivado</Badge>}
                    </p>
                    <p className="text-xs text-faint">{x.muscleGroup}</p>
                  </div>
                  <Button size="sm" variant="ghost" icon="pencil" aria-label={`Editar ${x.name}`} onClick={() => setEditingEx(x)} />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={x.archivedAt ? 'undo' : 'archive'}
                    aria-label={x.archivedAt ? 'Desarquivar' : 'Arquivar'}
                    title={x.archivedAt ? 'Desarquivar' : 'Arquivar'}
                    onClick={() => archive.mutate({ path: 'exercises', id: x.id, action: x.archivedAt ? 'unarchive' : 'archive' })}
                  />
                  <Button size="sm" variant="ghost" icon="trash" aria-label={`Excluir ${x.name}`} onClick={() => askDelete('exercises', x.id, x.name)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {editingType && (
        <TypeForm key={editingType === 'new' ? 'new' : editingType.id} type={editingType === 'new' ? null : editingType} onClose={() => setEditingType(null)} />
      )}
      {editingEx && (
        <ExerciseForm key={editingEx === 'new' ? 'new' : editingEx.id} exercise={editingEx === 'new' ? null : editingEx} onClose={() => setEditingEx(null)} />
      )}
    </div>
  );
}

function TypeForm({ type, onClose }: { type: ActivityType | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const lookups = useLookups();
  const form = useForm(
    activityTypeInput,
    type
      ? { name: type.name, category: type.category, icon: type.icon, skillId: type.skillId, intensity: type.intensity, attributeWeights: type.attributeWeights }
      : { name: '', category: 'other', icon: 'activity', skillId: null, intensity: 1, attributeWeights: {} },
  );
  const v = form.values;
  const save = useMutation({
    mutationFn: (data: unknown) => (type ? api.put(`/api/activity-types/${type.id}`, data) : api.post('/api/activity-types', data)),
    onSuccess: () => {
      toast.success('Tipo salvo');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => {
      form.applyServerError(e);
      toast.error(e);
    },
  });
  return (
    <Modal open onClose={onClose} title={type ? 'Editar tipo de atividade' : 'Novo tipo de atividade'} size="lg">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const data = form.validate();
          if (data) save.mutate(data);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Nome" value={v.name} onChange={(e) => form.set('name', e.target.value)} error={form.errors.name} />
          <Select
            label="Categoria"
            value={v.category}
            onChange={(e) => form.set('category', e.target.value as ActivityCategory)}
            options={ACTIVITY_CATEGORIES.map((c) => ({ value: c, label: ACTIVITY_CATEGORY_LABELS[c] }))}
          />
          <Select
            label="Ícone"
            value={v.icon ?? 'activity'}
            onChange={(e) => form.set('icon', e.target.value)}
            options={ICON_NAMES.map((n) => ({ value: n, label: n }))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Intensidade (0,5 – 1,5)"
            type="number"
            min={0.5}
            max={1.5}
            step={0.1}
            value={v.intensity ?? 1}
            onChange={(e) => form.set('intensity', Number(e.target.value))}
            error={form.errors.intensity}
            hint="Multiplica o XP por minuto. Use valores menores para atividades leves."
          />
          <Select
            label="Habilidade de maestria"
            value={v.skillId ?? ''}
            onChange={(e) => form.set('skillId', e.target.value || null)}
            placeholder="Nenhuma"
            options={(lookups.data?.skills ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <WeightsEditor value={v.attributeWeights ?? {}} onChange={(w) => form.set('attributeWeights', w)} />
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

function ExerciseForm({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm(exerciseInput, exercise ? { name: exercise.name, muscleGroup: exercise.muscleGroup } : { name: '', muscleGroup: 'geral' });
  const save = useMutation({
    mutationFn: (data: unknown) => (exercise ? api.put(`/api/exercises/${exercise.id}`, data) : api.post('/api/exercises', data)),
    onSuccess: () => {
      toast.success('Exercício salvo');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal open onClose={onClose} title={exercise ? 'Editar exercício' : 'Novo exercício'} size="sm">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const data = form.validate();
          if (data) save.mutate(data);
        }}
      >
        <Input label="Nome" value={form.values.name} onChange={(e) => form.set('name', e.target.value)} error={form.errors.name} autoFocus />
        <Input label="Grupo muscular" value={form.values.muscleGroup ?? ''} onChange={(e) => form.set('muscleGroup', e.target.value)} />
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}
