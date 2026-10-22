import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { areaInput, assessmentInput, resourceInput, studySessionInput, subjectInput, subjectMilestoneInput } from '@rpg/contracts';
import { STUDY_ACTIVITY_LABELS, STUDY_ACTIVITY_TYPES, type StudyActivityType } from '@rpg/engine';
import type { z } from 'zod';
import { api } from '../../lib/api';
import { fmt, fmt1, fmtDate, pct } from '../../lib/format';
import type { AfterAction, RewardOutcome, SeriesPoint } from '../../lib/types';
import { useSession } from '../../app/session';
import { FormActions, useForm } from '../../components/forms';
import { DonutChart, TimeSeriesChart } from '../../components/charts/Charts';
import { Icon } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Badge, Button, EmptyState, ErrorState, Input, Loading, PageHeader, Panel, ProgressBar, Select, Tabs, Textarea, cx } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type Tab = 'visao' | 'registrar' | 'sessoes' | 'avaliacoes' | 'marcos' | 'biblioteca';

interface SubjectOverview {
  id: string;
  name: string;
  description: string;
  color: string;
  areaId: string | null;
  skillId: string | null;
  archivedAt: string | null;
  minutes: number;
  sessions: number;
  lastSession: string | null;
  contentTotal: number;
  contentDone: number;
  assessmentAvg: number | null;
  assessmentCount: number;
  milestones: number;
  mastery: { level: number; xp: number; progress: number };
  prerequisiteIds: string[];
  prerequisitesMet: boolean;
}
interface Area {
  id: string;
  name: string;
  description: string;
  color: string;
  archivedAt: string | null;
}
type ResourceKind = 'course' | 'book' | 'module' | 'lesson' | 'chapter' | 'other';
interface Resource {
  id: string;
  subjectId: string;
  parentId: string | null;
  kind: ResourceKind;
  title: string;
  url: string | null;
  totalUnits: number;
  completedUnits: number;
  status: 'planned' | 'in_progress' | 'completed';
}
interface Session {
  id: string;
  subjectId: string;
  subjectName: string;
  resourceId: string | null;
  localDate: string;
  minutes: number;
  activityType: StudyActivityType;
  content: string;
  result: string | null;
  notes: string | null;
  evidenceUrl: string | null;
  unitsCompleted: number;
  source: string;
}
interface Assessment {
  id: string;
  subjectId: string;
  title: string;
  localDate: string;
  score: number;
  maxScore: number;
  notes: string | null;
}
interface Milestone {
  id: string;
  subjectId: string;
  title: string;
  description: string;
  evidenceUrl: string | null;
  achievedOn: string;
}
interface Productivity {
  study: SeriesPoint[];
  studyBySubject: Array<{ subject: string; color: string; minutes: number }>;
}

const KIND_LABEL: Record<ResourceKind, string> = { course: 'Curso', book: 'Livro', module: 'Módulo', lesson: 'Aula', chapter: 'Capítulo', other: 'Outro' };
const STATUS_LABEL = { planned: 'Planejado', in_progress: 'Em andamento', completed: 'Concluído' } as const;

const useOverview = () => useQuery({ queryKey: ['study', 'overview'], queryFn: () => api.get<SubjectOverview[]>('/api/study/overview') });
const useAreas = (includeArchived = false) =>
  useQuery({ queryKey: ['knowledge-areas', includeArchived], queryFn: () => api.get<Area[]>(`/api/knowledge-areas${includeArchived ? '?includeArchived=true' : ''}`) });
const useResources = () => useQuery({ queryKey: ['study-resources'], queryFn: () => api.get<Resource[]>('/api/study-resources') });

const hours = (min: number) => (min >= 60 ? `${fmt1(min / 60)} h` : `${fmt(min)} min`);
const nullIfEmpty = (s: string) => (s.trim() === '' ? null : s);

export function StudyPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) ?? 'visao';
  const setTab = (t: Tab) => setParams({ aba: t }, { replace: true });
  return (
    <>
      <PageHeader
        title="Estudos e conhecimento"
        icon="book-open"
        subtitle="Tempo investido, conteúdo concluído, desempenho em avaliações e domínio demonstrado são medidos separadamente: tempo, sozinho, não prova conhecimento."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setTab('registrar')}>
            Registrar sessão
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'visao', label: 'Visão geral', icon: 'library' },
          { value: 'registrar', label: 'Registrar', icon: 'plus' },
          { value: 'sessoes', label: 'Sessões', icon: 'clock' },
          { value: 'avaliacoes', label: 'Avaliações', icon: 'graduation-cap' },
          { value: 'marcos', label: 'Marcos de domínio', icon: 'award' },
          { value: 'biblioteca', label: 'Biblioteca', icon: 'settings' },
        ]}
      />
      {tab === 'visao' && <OverviewTab />}
      {tab === 'registrar' && <RegisterTab onDone={() => setTab('sessoes')} />}
      {tab === 'sessoes' && <SessionsTab />}
      {tab === 'avaliacoes' && <AssessmentsTab />}
      {tab === 'marcos' && <MilestonesTab />}
      {tab === 'biblioteca' && <LibraryTab />}
    </>
  );
}

// ------------------------------------------------------------------ Visão geral

function Dimension({ label, value, hint, progress, icon }: { label: string; value: string; hint?: string; progress?: number | null; icon: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[0.7rem] text-faint uppercase" style={{ letterSpacing: '0.06em' }}>
        <Icon name={icon} size={12} /> {label}
      </p>
      <p className="num truncate">{value}</p>
      {progress != null && <ProgressBar value={progress} className="mt-1 !h-1.5" label={label} />}
      {hint && <p className="truncate text-xs text-faint">{hint}</p>}
    </div>
  );
}

function OverviewTab() {
  const overview = useOverview();
  const areas = useAreas();
  const prod = useQuery({ queryKey: ['stats', 'productivity', 'study-90'], queryFn: () => api.get<Productivity>('/api/stats/productivity?granularity=week&days=90') });
  if (overview.isLoading) return <Loading />;
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;
  const subjects = overview.data!;
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const groups = [...(areas.data ?? []).map((a) => ({ area: a as Area | null, items: subjects.filter((s) => s.areaId === a.id) })), { area: null, items: subjects.filter((s) => !s.areaId || !(areas.data ?? []).some((a) => a.id === s.areaId)) }].filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className="space-y-4">
      {subjects.length === 0 ? (
        <Panel>
          <EmptyState icon="book-open" title="Nenhuma disciplina cadastrada">
            Crie áreas e disciplinas na aba "Biblioteca".
          </EmptyState>
        </Panel>
      ) : (
        groups.map((g) => (
          <section key={g.area?.id ?? 'sem-area'}>
            <h2 className="panel-title" style={g.area ? { color: g.area.color } : undefined}>
              <Icon name="git-branch" size={15} />
              {g.area?.name ?? 'Sem área'}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map((s) => (
                <article key={s.id} className="panel">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-2 font-display">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </p>
                    <Badge tone="accent" title={`Maestria: ${fmt(s.mastery.xp)} XP`}>
                      Maestria nv {s.mastery.level}
                    </Badge>
                  </div>
                  <ProgressBar value={s.mastery.progress} xp className="mt-2" label={`Progresso de maestria em ${s.name}`} />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Dimension icon="clock" label="Tempo investido" value={hours(s.minutes)} hint={`${s.sessions} sessões${s.lastSession ? ` · última ${fmtDate(s.lastSession)}` : ''}`} />
                    <Dimension
                      icon="list-checks"
                      label="Conteúdo concluído"
                      value={s.contentTotal ? `${fmt(s.contentDone)}/${fmt(s.contentTotal)}` : '—'}
                      progress={s.contentTotal ? s.contentDone / s.contentTotal : null}
                      hint={s.contentTotal ? undefined : 'sem recursos cadastrados'}
                    />
                    <Dimension
                      icon="graduation-cap"
                      label="Desempenho"
                      value={s.assessmentAvg != null ? pct(s.assessmentAvg) : '—'}
                      hint={`${s.assessmentCount} avaliações`}
                      progress={s.assessmentAvg}
                    />
                    <Dimension icon="award" label="Domínio demonstrado" value={`${s.milestones} marcos`} hint="projetos, certificações, provas" />
                  </div>
                  {s.prerequisiteIds.length > 0 && (
                    <p className="mt-3 flex flex-wrap items-center gap-1 text-xs">
                      <span className={s.prerequisitesMet ? 'text-success' : 'text-warning'}>
                        <Icon name={s.prerequisitesMet ? 'check' : 'lock'} size={12} className="mr-0.5 inline" />
                        Pré-requisitos{s.prerequisitesMet ? ' atendidos' : ' pendentes'}:
                      </span>
                      {s.prerequisiteIds.map((p) => {
                        const pre = byId.get(p);
                        return (
                          <Badge key={p} tone={pre && pre.mastery.level >= 3 ? 'success' : 'muted'} title="Atendido com maestria nível 3">
                            {pre?.name ?? 'Disciplina'} (nv {pre?.mastery.level ?? 0}/3)
                          </Badge>
                        );
                      })}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Minutos de estudo por semana (90 dias)" icon="bar-chart" className="lg:col-span-2">
          {prod.data ? (
            <TimeSeriesChart
              data={prod.data.study}
              granularity="week"
              height={220}
              series={[
                { key: 'studyMinutes', label: 'Minutos', type: 'bar', unit: 'min' },
                { key: 'studySessions', label: 'Sessões', type: 'line', axis: 'right' },
              ]}
            />
          ) : prod.isError ? (
            <ErrorState error={prod.error} onRetry={() => prod.refetch()} />
          ) : (
            <Loading />
          )}
        </Panel>
        <Panel title="Tempo por disciplina" icon="compass">
          {prod.data ? <DonutChart data={prod.data.studyBySubject.map((s) => ({ label: s.subject, value: s.minutes, color: s.color }))} unit="min" height={190} /> : <Loading />}
          <p className="mt-2 text-xs text-faint">Tempo investido é apenas uma das dimensões do conhecimento.</p>
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Registrar sessão

function RegisterTab({ onDone }: { onDone: () => void }) {
  const me = useSession();
  const toast = useToast();
  const overview = useOverview();
  const resources = useResources();
  const initial: z.input<typeof studySessionInput> = {
    subjectId: '',
    resourceId: null,
    date: me.today,
    minutes: 45,
    activityType: 'reading',
    content: '',
    result: null,
    notes: null,
    evidenceUrl: null,
    unitsCompleted: 0,
  };
  const form = useForm(studySessionInput, initial);
  const v = form.values;
  const subjectResources = (resources.data ?? []).filter((r) => r.subjectId === v.subjectId);
  const resource = subjectResources.find((r) => r.id === v.resourceId);
  const save = useMutation({
    mutationFn: (data: unknown) => api.post<{ reward: RewardOutcome | null; after: AfterAction; duplicate: boolean }>('/api/study/sessions', data),
    onSuccess: (r) => {
      if (r.duplicate) toast.info('Sessão equivalente já registrada: nenhuma recompensa duplicada.');
      toast.reward(r.reward, r.after, 'Sessão de estudo');
      form.setValues({ ...initial, subjectId: v.subjectId });
    },
    onError: (e) => {
      form.applyServerError(e);
      toast.error(e);
    },
  });
  if (overview.isLoading) return <Loading />;
  if ((overview.data ?? []).length === 0)
    return (
      <Panel>
        <EmptyState icon="book-open" title="Cadastre uma disciplina primeiro">
          Use a aba "Biblioteca" para criar áreas, disciplinas e recursos.
        </EmptyState>
      </Panel>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Nova sessão de estudo" icon="clock" className="lg:col-span-2">
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const data = form.validate();
            if (data) save.mutate(data);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Disciplina"
              value={v.subjectId}
              onChange={(e) => form.setValues({ ...v, subjectId: e.target.value, resourceId: null })}
              placeholder="Selecione…"
              error={form.errors.subjectId}
              options={(overview.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
            <Select
              label="Recurso (opcional)"
              value={v.resourceId ?? ''}
              onChange={(e) => form.set('resourceId', e.target.value || null)}
              placeholder={subjectResources.length ? 'Nenhum' : 'Sem recursos nesta disciplina'}
              disabled={!v.subjectId || subjectResources.length === 0}
              options={subjectResources.map((r) => ({ value: r.id, label: `${KIND_LABEL[r.kind]}: ${r.title} (${r.completedUnits}/${r.totalUnits})` }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Data" type="date" max={me.today} value={v.date ?? ''} onChange={(e) => form.set('date', e.target.value || null)} error={form.errors.date} />
            <Input label="Duração (min)" type="number" min={1} max={1440} value={v.minutes ?? ''} onChange={(e) => form.set('minutes', Number(e.target.value))} error={form.errors.minutes} />
            <Select
              label="Tipo de atividade"
              value={v.activityType ?? 'reading'}
              onChange={(e) => form.set('activityType', e.target.value as StudyActivityType)}
              options={STUDY_ACTIVITY_TYPES.map((t) => ({ value: t, label: STUDY_ACTIVITY_LABELS[t] }))}
            />
          </div>
          <Input label="Conteúdo estudado" value={v.content ?? ''} onChange={(e) => form.set('content', e.target.value)} placeholder="Ex.: Capítulo 3 — oferta e demanda" error={form.errors.content} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Resultado (opcional)" value={v.result ?? ''} onChange={(e) => form.set('result', nullIfEmpty(e.target.value))} placeholder="Ex.: resumo pronto, 20 exercícios" />
            <Input
              label="Unidades concluídas"
              type="number"
              min={0}
              max={1000}
              value={v.unitsCompleted ?? 0}
              onChange={(e) => form.set('unitsCompleted', Number(e.target.value))}
              hint={resource ? `Avança o recurso "${resource.title}" e concede maestria por conteúdo.` : 'Aulas, capítulos ou módulos terminados nesta sessão.'}
            />
          </div>
          <Input label="Evidência (link, opcional)" type="url" value={v.evidenceUrl ?? ''} onChange={(e) => form.set('evidenceUrl', nullIfEmpty(e.target.value))} error={form.errors.evidenceUrl} />
          <Textarea label="Observações" value={v.notes ?? ''} onChange={(e) => form.set('notes', nullIfEmpty(e.target.value))} rows={2} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onDone}>
              Ver sessões
            </Button>
            <Button type="submit" variant="primary" icon="check" loading={save.isPending}>
              Registrar sessão
            </Button>
          </div>
        </form>
      </Panel>
      <Panel title="Como o estudo é recompensado" icon="info">
        <ul className="space-y-2 text-sm text-muted">
          <li>• XP por minuto com retornos decrescentes após 60 min e limite diário: sessões muito longas não rendem mais.</li>
          <li>• Maestria da disciplina vem do tempo (limitado), de conteúdos concluídos, do desempenho em avaliações e de marcos de domínio.</li>
          <li>• Tempo de estudo sozinho não é interpretado como prova de conhecimento.</li>
          <li>• Sessões importadas equivalentes a registros manuais não recebem recompensa duplicada.</li>
        </ul>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ Sessões

function SessionsTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['study', 'sessions'], queryFn: () => api.get<Session[]>('/api/study/sessions?limit=300') });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/study/sessions/${id}`),
    onSuccess: () => {
      toast.success('Sessão excluída e recompensa estornada');
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <Panel title="Sessões registradas" icon="clock">
      {q.data!.length === 0 ? (
        <EmptyState icon="clock" title="Nenhuma sessão registrada" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Disciplina</th>
                <th>Atividade</th>
                <th>Duração</th>
                <th>Conteúdo</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {q.data!.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap">{fmtDate(s.localDate)}</td>
                  <td>{s.subjectName}</td>
                  <td className="whitespace-nowrap">{STUDY_ACTIVITY_LABELS[s.activityType]}</td>
                  <td className="num whitespace-nowrap">{s.minutes} min</td>
                  <td className="min-w-48">
                    {s.content || <span className="text-faint">—</span>}
                    {s.result && <span className="block text-xs text-muted">Resultado: {s.result}</span>}
                    {s.unitsCompleted > 0 && <span className="block text-xs text-muted">{s.unitsCompleted} unidade(s) concluída(s)</span>}
                    {s.evidenceUrl && (
                      <a className="link block text-xs" href={s.evidenceUrl} target="_blank" rel="noreferrer noopener">
                        Evidência
                      </a>
                    )}
                    {s.source !== 'manual' && <Badge className="mt-1">{s.source === 'demo' ? 'Demonstração' : s.source}</Badge>}
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label="Excluir sessão"
                      onClick={async () => {
                        const r = await confirm({ title: 'Excluir sessão', message: 'A sessão será excluída e sua recompensa (XP, atributos, maestria e moedas) será estornada.', danger: true, confirmLabel: 'Excluir' });
                        if (r.ok) remove.mutate(s.id);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ Avaliações

function AssessmentsTab() {
  const me = useSession();
  const toast = useToast();
  const overview = useOverview();
  const q = useQuery({ queryKey: ['study', 'assessments'], queryFn: () => api.get<Assessment[]>('/api/study/assessments') });
  const initial: z.input<typeof assessmentInput> = { subjectId: '', title: '', date: me.today, score: 0, maxScore: 10, notes: null };
  const form = useForm(assessmentInput, initial);
  const v = form.values;
  const save = useMutation({
    mutationFn: (data: unknown) => api.post<{ reward: RewardOutcome; after: AfterAction }>('/api/study/assessments', data),
    onSuccess: (r) => {
      toast.reward(r.reward, r.after, 'Avaliação registrada');
      form.setValues({ ...initial, subjectId: v.subjectId });
    },
    onError: (e) => {
      form.applyServerError(e);
      toast.error(e);
    },
  });
  const subjectName = (id: string) => overview.data?.find((s) => s.id === id)?.name ?? '—';
  const ratio = v.maxScore ? Number(v.score) / Number(v.maxScore) : 0;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Registrar avaliação" icon="graduation-cap">
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const data = form.validate();
            if (!data) return;
            if (data.score > data.maxScore) {
              toast.error(new Error('A nota não pode exceder a nota máxima.'));
              return;
            }
            save.mutate(data);
          }}
        >
          <Select label="Disciplina" value={v.subjectId} onChange={(e) => form.set('subjectId', e.target.value)} placeholder="Selecione…" error={form.errors.subjectId} options={(overview.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          <Input label="Título" value={v.title} onChange={(e) => form.set('title', e.target.value)} error={form.errors.title} placeholder="Ex.: Simulado de Macroeconomia" />
          <Input label="Data" type="date" max={me.today} value={v.date ?? ''} onChange={(e) => form.set('date', e.target.value || null)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nota" type="number" min={0} step="0.1" value={v.score} onChange={(e) => form.set('score', Number(e.target.value))} error={form.errors.score} />
            <Input label="Nota máxima" type="number" min={0.1} step="0.1" value={v.maxScore} onChange={(e) => form.set('maxScore', Number(e.target.value))} error={form.errors.maxScore} />
          </div>
          {v.maxScore ? (
            <p className={cx('text-sm', ratio >= 0.7 ? 'text-success' : 'text-muted')}>
              Desempenho: <span className="num">{pct(ratio)}</span> {ratio >= 0.7 ? '(aprovado)' : '(abaixo de 70%)'} — a maestria é proporcional ao percentual.
            </p>
          ) : null}
          <Textarea label="Observações" value={v.notes ?? ''} onChange={(e) => form.set('notes', nullIfEmpty(e.target.value))} rows={2} />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" icon="check" loading={save.isPending}>
              Registrar
            </Button>
          </div>
        </form>
      </Panel>
      <Panel title="Avaliações" icon="list-checks" className="lg:col-span-2">
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data!.length === 0 ? (
          <EmptyState icon="graduation-cap" title="Nenhuma avaliação registrada">
            Avaliações medem desempenho — uma dimensão diferente do tempo investido.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Disciplina</th>
                  <th>Avaliação</th>
                  <th>Nota</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {q.data!.map((a) => {
                  const p = Number(a.score) / Number(a.maxScore);
                  return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">{fmtDate(a.localDate)}</td>
                      <td>{subjectName(a.subjectId)}</td>
                      <td>
                        {a.title}
                        {a.notes && <span className="block text-xs text-muted">{a.notes}</span>}
                      </td>
                      <td className="num whitespace-nowrap">
                        {fmt1(Number(a.score))}/{fmt1(Number(a.maxScore))}
                      </td>
                      <td className="num" style={{ color: p >= 0.7 ? 'var(--success)' : 'var(--warning)' }}>
                        {pct(p)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ Marcos de domínio

function MilestonesTab() {
  const me = useSession();
  const toast = useToast();
  const overview = useOverview();
  const q = useQuery({ queryKey: ['study', 'milestones'], queryFn: () => api.get<Milestone[]>('/api/study/milestones') });
  const initial: z.input<typeof subjectMilestoneInput> = { subjectId: '', title: '', description: '', evidenceUrl: null, achievedOn: me.today };
  const form = useForm(subjectMilestoneInput, initial);
  const v = form.values;
  const save = useMutation({
    mutationFn: (data: unknown) => api.post<{ reward: RewardOutcome; after: AfterAction }>('/api/study/milestones', data),
    onSuccess: (r) => {
      toast.reward(r.reward, r.after, 'Marco de domínio');
      form.setValues({ ...initial, subjectId: v.subjectId });
    },
    onError: (e) => {
      form.applyServerError(e);
      toast.error(e);
    },
  });
  const subjectName = (id: string) => overview.data?.find((s) => s.id === id)?.name ?? '—';
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Registrar domínio demonstrado" icon="award">
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const data = form.validate();
            if (data) save.mutate(data);
          }}
        >
          <Select label="Disciplina" value={v.subjectId} onChange={(e) => form.set('subjectId', e.target.value)} placeholder="Selecione…" error={form.errors.subjectId} options={(overview.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          <Input label="Marco" value={v.title} onChange={(e) => form.set('title', e.target.value)} error={form.errors.title} placeholder="Ex.: Projeto entregue, certificação obtida" />
          <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
          <Input label="Evidência (link)" type="url" value={v.evidenceUrl ?? ''} onChange={(e) => form.set('evidenceUrl', nullIfEmpty(e.target.value))} error={form.errors.evidenceUrl} />
          <Input label="Data" type="date" max={me.today} value={v.achievedOn ?? ''} onChange={(e) => form.set('achievedOn', e.target.value || null)} />
          <p className="text-xs text-faint">Marcos representam conhecimento aplicado e verificável — a evidência mais forte de domínio.</p>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" icon="check" loading={save.isPending}>
              Registrar marco
            </Button>
          </div>
        </form>
      </Panel>
      <Panel title="Marcos registrados" icon="award" className="lg:col-span-2">
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data!.length === 0 ? (
          <EmptyState icon="award" title="Nenhum marco de domínio ainda" />
        ) : (
          <ul className="divide-y divide-line">
            {q.data!.map((m) => (
              <li key={m.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name="award" size={16} className="text-accent" />
                  <span className="flex-1">{m.title}</span>
                  <Badge>{subjectName(m.subjectId)}</Badge>
                  <span className="text-xs text-faint">{fmtDate(m.achievedOn)}</span>
                </div>
                {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
                {m.evidenceUrl && (
                  <a className="link text-xs" href={m.evidenceUrl} target="_blank" rel="noreferrer noopener">
                    Ver evidência
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ Biblioteca (áreas, disciplinas, recursos)

function LibraryTab() {
  const [showArchived, setShowArchived] = useState(false);
  const areas = useAreas(showArchived);
  const overview = useOverview();
  const subjectsAll = useQuery({
    queryKey: ['subjects', showArchived],
    queryFn: () => api.get<Array<{ id: string; name: string; description: string; color: string; areaId: string | null; archivedAt: string | null }>>(`/api/subjects${showArchived ? '?includeArchived=true' : ''}`),
  });
  const resources = useResources();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [area, setArea] = useState<Area | 'new' | null>(null);
  const [subject, setSubject] = useState<{ id: string; name: string; description: string; color: string; areaId: string | null } | 'new' | null>(null);
  const [resource, setResource] = useState<Resource | 'new' | null>(null);
  const mutate = useMutation({
    mutationFn: ({ method, url }: { method: 'post' | 'del'; url: string }) => (method === 'del' ? api.del(url) : api.post(url)),
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e) => toast.error(e),
  });
  const askDelete = async (url: string, name: string) => {
    const r = await confirm({ title: 'Excluir', message: `Excluir "${name}"? Registros com histórico não podem ser excluídos — arquive-os.`, danger: true, confirmLabel: 'Excluir' });
    if (r.ok) mutate.mutate({ method: 'del', url });
  };
  const subjectName = (id: string) => subjectsAll.data?.find((s) => s.id === id)?.name ?? '—';
  const prereqOf = (id: string) => overview.data?.find((s) => s.id === id)?.prerequisiteIds ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar arquivados
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Áreas de conhecimento" icon="git-branch" actions={<Button size="sm" icon="plus" onClick={() => setArea('new')}>Nova área</Button>}>
          {areas.isLoading ? (
            <Loading />
          ) : (areas.data ?? []).length === 0 ? (
            <EmptyState icon="git-branch" title="Nenhuma área" />
          ) : (
            <ul className="divide-y divide-line">
              {areas.data!.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                  <span className="min-w-0 flex-1 truncate">
                    {a.name} {a.archivedAt && <Badge>arquivada</Badge>}
                  </span>
                  <Button size="sm" variant="ghost" icon="pencil" aria-label={`Editar ${a.name}`} onClick={() => setArea(a)} />
                  <Button size="sm" variant="ghost" icon={a.archivedAt ? 'undo' : 'archive'} aria-label={a.archivedAt ? 'Desarquivar' : 'Arquivar'} title={a.archivedAt ? 'Desarquivar' : 'Arquivar'} onClick={() => mutate.mutate({ method: 'post', url: `/api/knowledge-areas/${a.id}/${a.archivedAt ? 'unarchive' : 'archive'}` })} />
                  <Button size="sm" variant="ghost" icon="trash" aria-label={`Excluir ${a.name}`} onClick={() => askDelete(`/api/knowledge-areas/${a.id}`, a.name)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Disciplinas" icon="book-open" actions={<Button size="sm" icon="plus" onClick={() => setSubject('new')}>Nova disciplina</Button>}>
          {subjectsAll.isLoading ? (
            <Loading />
          ) : (subjectsAll.data ?? []).length === 0 ? (
            <EmptyState icon="book-open" title="Nenhuma disciplina" />
          ) : (
            <ul className="divide-y divide-line">
              {subjectsAll.data!.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {s.name} {s.archivedAt && <Badge>arquivada</Badge>}
                    </p>
                    <p className="truncate text-xs text-faint">
                      {areas.data?.find((a) => a.id === s.areaId)?.name ?? 'Sem área'}
                      {prereqOf(s.id).length > 0 && <> · requer {prereqOf(s.id).map(subjectName).join(', ')}</>}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" icon="pencil" aria-label={`Editar ${s.name}`} onClick={() => setSubject(s)} />
                  <Button size="sm" variant="ghost" icon={s.archivedAt ? 'undo' : 'archive'} aria-label={s.archivedAt ? 'Desarquivar' : 'Arquivar'} title={s.archivedAt ? 'Desarquivar' : 'Arquivar'} onClick={() => mutate.mutate({ method: 'post', url: `/api/subjects/${s.id}/${s.archivedAt ? 'unarchive' : 'archive'}` })} />
                  <Button size="sm" variant="ghost" icon="trash" aria-label={`Excluir ${s.name}`} onClick={() => askDelete(`/api/subjects/${s.id}`, s.name)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <Panel title="Recursos (cursos, livros, módulos, aulas)" icon="library" actions={<Button size="sm" icon="plus" disabled={(subjectsAll.data ?? []).length === 0} onClick={() => setResource('new')}>Novo recurso</Button>}>
        {resources.isLoading ? (
          <Loading />
        ) : (resources.data ?? []).length === 0 ? (
          <EmptyState icon="library" title="Nenhum recurso cadastrado">
            Cadastre livros e cursos com o total de unidades para medir conteúdo concluído.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {resources.data!.map((r) => (
              <li key={r.id} className="rounded-[var(--radius)] border border-line p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {r.title}
                    </p>
                    <p className="text-xs text-faint">
                      {KIND_LABEL[r.kind]} · {subjectName(r.subjectId)} · {STATUS_LABEL[r.status]}
                    </p>
                  </div>
                  {r.url && (
                    <a className="btn btn-ghost btn-sm btn-icon" href={r.url} target="_blank" rel="noreferrer noopener" aria-label="Abrir link">
                      <Icon name="arrow-right" size={14} />
                    </a>
                  )}
                  <Button size="sm" variant="ghost" icon="pencil" aria-label={`Editar ${r.title}`} onClick={() => setResource(r)} />
                  <Button size="sm" variant="ghost" icon="trash" aria-label={`Excluir ${r.title}`} onClick={() => askDelete(`/api/study-resources/${r.id}`, r.title)} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <ProgressBar value={r.completedUnits / r.totalUnits} className="flex-1" label={`Progresso de ${r.title}`} />
                  <span className="num text-xs text-faint">
                    {r.completedUnits}/{r.totalUnits}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {area && <AreaForm key={area === 'new' ? 'new' : area.id} area={area === 'new' ? null : area} onClose={() => setArea(null)} />}
      {subject && (
        <SubjectForm
          key={subject === 'new' ? 'new' : subject.id}
          subject={subject === 'new' ? null : { ...subject, prerequisiteIds: prereqOf(subject.id) }}
          areas={areas.data ?? []}
          subjects={subjectsAll.data ?? []}
          onClose={() => setSubject(null)}
        />
      )}
      {resource && <ResourceForm key={resource === 'new' ? 'new' : resource.id} resource={resource === 'new' ? null : resource} subjects={subjectsAll.data ?? []} resources={resources.data ?? []} onClose={() => setResource(null)} />}
    </div>
  );
}

function useSave(url: string, id: string | null, onClose: () => void, label: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: unknown) => (id ? api.put(`${url}/${id}`, data) : api.post(url, data)),
    onSuccess: () => {
      toast.success(`${label} salvo(a)`);
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
}

function AreaForm({ area, onClose }: { area: Area | null; onClose: () => void }) {
  const form = useForm(areaInput, area ? { name: area.name, description: area.description, color: area.color } : { name: '', description: '', color: '#6b7fd7' });
  const save = useSave('/api/knowledge-areas', area?.id ?? null, onClose, 'Área');
  return (
    <Modal open onClose={onClose} title={area ? 'Editar área' : 'Nova área de conhecimento'} size="sm">
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const d = form.validate();
          if (d) save.mutate(d);
        }}
      >
        <Input label="Nome" value={form.values.name} onChange={(e) => form.set('name', e.target.value)} error={form.errors.name} autoFocus />
        <Textarea label="Descrição" value={form.values.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <Input label="Cor" type="color" value={form.values.color ?? '#6b7fd7'} onChange={(e) => form.set('color', e.target.value)} className="!h-10 !p-1" error={form.errors.color} />
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

function SubjectForm({
  subject,
  areas,
  subjects,
  onClose,
}: {
  subject: { id: string; name: string; description: string; color: string; areaId: string | null; prerequisiteIds: string[] } | null;
  areas: Area[];
  subjects: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const form = useForm(
    subjectInput,
    subject
      ? { name: subject.name, description: subject.description, areaId: subject.areaId, color: subject.color, prerequisiteIds: subject.prerequisiteIds }
      : { name: '', description: '', areaId: null, color: '#6b7fd7', prerequisiteIds: [] },
  );
  const v = form.values;
  const save = useSave('/api/subjects', subject?.id ?? null, onClose, 'Disciplina');
  const prereqs = v.prerequisiteIds ?? [];
  return (
    <Modal open onClose={onClose} title={subject ? 'Editar disciplina' : 'Nova disciplina'}>
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const d = form.validate();
          if (d) save.mutate(d);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
          <Input label="Nome" value={v.name} onChange={(e) => form.set('name', e.target.value)} error={form.errors.name} autoFocus />
          <Input label="Cor" type="color" value={v.color ?? '#6b7fd7'} onChange={(e) => form.set('color', e.target.value)} className="!h-10 !p-1" />
        </div>
        <Select label="Área de conhecimento" value={v.areaId ?? ''} onChange={(e) => form.set('areaId', e.target.value || null)} placeholder="Sem área" options={areas.filter((a) => !a.archivedAt).map((a) => ({ value: a.id, label: a.name }))} />
        <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <fieldset>
          <legend className="field-label">Pré-requisitos</legend>
          <div className="flex flex-wrap gap-2">
            {subjects
              .filter((s) => s.id !== subject?.id)
              .map((s) => {
                const on = prereqs.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    className={cx('badge !py-1 text-[0.8rem]', on && '!border-accent !text-accent')}
                    onClick={() => form.set('prerequisiteIds', on ? prereqs.filter((x) => x !== s.id) : [...prereqs, s.id])}
                  >
                    <Icon name={on ? 'check' : 'plus'} size={12} />
                    {s.name}
                  </button>
                );
              })}
          </div>
          <p className="mt-1 text-xs text-faint">Um pré-requisito é considerado atendido quando a disciplina exigida atinge maestria nível 3.</p>
        </fieldset>
        {!subject && <p className="text-xs text-faint">Uma habilidade de maestria é criada automaticamente na árvore "Conhecimento".</p>}
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

function ResourceForm({ resource, subjects, resources, onClose }: { resource: Resource | null; subjects: Array<{ id: string; name: string }>; resources: Resource[]; onClose: () => void }) {
  const form = useForm(
    resourceInput,
    resource
      ? { subjectId: resource.subjectId, parentId: resource.parentId, kind: resource.kind, title: resource.title, url: resource.url, totalUnits: resource.totalUnits }
      : { subjectId: subjects[0]?.id ?? '', parentId: null, kind: 'book', title: '', url: null, totalUnits: 1 },
  );
  const v = form.values;
  const save = useSave('/api/study-resources', resource?.id ?? null, onClose, 'Recurso');
  const parents = resources.filter((r) => r.subjectId === v.subjectId && r.id !== resource?.id);
  return (
    <Modal open onClose={onClose} title={resource ? 'Editar recurso' : 'Novo recurso de estudo'}>
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const d = form.validate();
          if (d) save.mutate(d);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Disciplina" value={v.subjectId} onChange={(e) => form.setValues({ ...v, subjectId: e.target.value, parentId: null })} error={form.errors.subjectId} options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
          <Select label="Tipo" value={v.kind} onChange={(e) => form.set('kind', e.target.value as ResourceKind)} options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} />
        </div>
        <Input label="Título" value={v.title} onChange={(e) => form.set('title', e.target.value)} error={form.errors.title} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Total de unidades" type="number" min={1} value={v.totalUnits ?? 1} onChange={(e) => form.set('totalUnits', Number(e.target.value))} error={form.errors.totalUnits} hint="Capítulos, aulas ou módulos." />
          <Select label="Faz parte de (opcional)" value={v.parentId ?? ''} onChange={(e) => form.set('parentId', e.target.value || null)} placeholder="Nenhum" options={parents.map((r) => ({ value: r.id, label: r.title }))} />
        </div>
        <Input label="Link (opcional)" type="url" value={v.url ?? ''} onChange={(e) => form.set('url', nullIfEmpty(e.target.value))} error={form.errors.url} />
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}
