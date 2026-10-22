import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { goalInput, OBJECTIVE_METRIC_LABELS, OBJECTIVE_METRIC_VALUES } from '@rpg/contracts';
import { DIFFICULTIES, DIFFICULTY_LABELS } from '@rpg/engine';
import type { z } from 'zod';
import { api } from '../../lib/api';
import { fmt, fmtDate, pct } from '../../lib/format';
import type { AfterAction, RewardOutcome } from '../../lib/types';
import { CategorySelect, FormActions, useForm } from '../../components/forms';
import { DifficultyBadge, StatusBadge } from '../../components/ui/domain';
import { Icon } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Badge, Button, Checkbox, EmptyState, ErrorState, Input, Loading, PageHeader, Panel, ProgressBar, Select, Textarea } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type GoalInput = z.input<typeof goalInput>;
interface Milestone {
  id: string;
  title: string;
  weight: number;
  dueDate: string | null;
  doneAt: string | null;
  sortOrder: number;
}
interface Goal {
  id: string;
  title: string;
  description: string;
  categoryId: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  difficulty: GoalInput['difficulty'] & string;
  status: 'active' | 'paused' | 'completed' | 'abandoned' | 'cancelled';
  startDate: string | null;
  deadline: string | null;
  progressMode: 'milestones' | 'missions' | 'metric';
  metric: (typeof OBJECTIVE_METRIC_VALUES)[number] | null;
  metricRefId: string | null;
  metricStart: number | null;
  metricTarget: number | null;
  metricCurrent: number | null;
  unit: string | null;
  completedAt: string | null;
  progress: number;
  milestones: Milestone[];
  missions: Array<{ id: string; title: string; status: string }>;
  metricCurrentComputed?: number | null;
  blockedBy: Array<{ id: string; title: string; status: string }>;
  dependsOn: string[];
}

const PRIORITY = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' } as const;
const STATUS = { active: 'Ativa', paused: 'Pausada', completed: 'Concluída', abandoned: 'Abandonada', cancelled: 'Cancelada' } as const;
const MODE = { milestones: 'Etapas ponderadas', missions: 'Missões vinculadas', metric: 'Métrica' } as const;

export function GoalsPage() {
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ['goals'], queryFn: () => api.get<Goal[]>('/api/goals') });
  const [editing, setEditing] = useState<Goal | 'new' | null>(params.get('nova') === '1' ? 'new' : null);
  const close = () => {
    setEditing(null);
    if (params.get('nova')) setParams({}, { replace: true });
  };
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const goals = q.data!;
  const groups: Array<[string, Goal[]]> = [
    ['Ativas', goals.filter((g) => g.status === 'active')],
    ['Pausadas', goals.filter((g) => g.status === 'paused')],
    ['Concluídas', goals.filter((g) => g.status === 'completed')],
    ['Encerradas', goals.filter((g) => g.status === 'abandoned' || g.status === 'cancelled')],
  ];
  return (
    <>
      <PageHeader
        title="Metas e projetos"
        icon="target"
        subtitle="Objetivos de dias a anos. O progresso vem de critérios explícitos — etapas ponderadas, missões vinculadas ou uma métrica medida — nunca de uma porcentagem digitada."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            Nova meta
          </Button>
        }
      />
      {goals.length === 0 ? (
        <Panel>
          <EmptyState icon="target" title="Nenhuma meta ainda" action={<Button onClick={() => setEditing('new')}>Criar meta</Button>}>
            Ex.: concluir uma formação, dominar uma disciplina, correr uma maratona, entregar um projeto.
          </EmptyState>
        </Panel>
      ) : (
        groups
          .filter(([, list]) => list.length > 0)
          .map(([label, list]) => (
            <section key={label} className="mb-6">
              <h2 className="panel-title">{label}</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {list.map((g) => (
                  <GoalCard key={g.id} g={g} all={goals} onEdit={() => setEditing(g)} />
                ))}
              </div>
            </section>
          ))
      )}
      {editing && <GoalForm key={editing === 'new' ? 'new' : editing.id} goal={editing === 'new' ? null : editing} all={goals} onClose={close} />}
    </>
  );
}

function GoalCard({ g, all, onEdit }: { g: Goal; all: Goal[]; onEdit: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (mid: string) => api.post<{ completedReward: RewardOutcome | null }>(`/api/goals/${g.id}/milestones/${mid}/toggle`),
    onSuccess: (r) => {
      if (r.completedReward) toast.reward(r.completedReward, null as AfterAction | null, `Meta concluída: ${g.title}`);
      else toast.reward(null, null);
    },
    onError: (e) => toast.error(e),
  });
  const status = useMutation({
    mutationFn: (s: 'active' | 'paused' | 'abandoned' | 'cancelled') => api.patch(`/api/goals/${g.id}/status`, { status: s }),
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/goals/${g.id}`),
    onSuccess: () => {
      toast.success('Meta excluída');
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e),
  });
  const active = g.status === 'active';
  return (
    <article className="panel flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg">{g.title}</p>
          {g.description && <p className="text-sm text-muted">{g.description}</p>}
        </div>
        <Badge tone={g.status === 'completed' ? 'success' : g.status === 'active' ? 'accent' : 'muted'}>{STATUS[g.status]}</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={g.priority === 'critical' ? 'danger' : g.priority === 'high' ? 'warning' : 'muted'}>Prioridade {PRIORITY[g.priority]}</Badge>
        <DifficultyBadge value={g.difficulty} />
        <Badge>{MODE[g.progressMode]}</Badge>
        {g.deadline && <Badge>Prazo {fmtDate(g.deadline)}</Badge>}
      </div>
      <div>
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-muted">Progresso</span>
          <span className="num">{pct(g.progress)}</span>
        </div>
        <ProgressBar value={g.progress} label={`Progresso de ${g.title}`} />
      </div>
      {g.progressMode === 'milestones' && (
        <ul className="space-y-1">
          {g.milestones.map((m) => (
            <li key={m.id}>
              <Checkbox
                label={
                  <span className={m.doneAt ? 'text-faint line-through' : ''}>
                    {m.title} <span className="text-xs text-faint">(peso {m.weight}{m.dueDate ? ` · ${fmtDate(m.dueDate)}` : ''})</span>
                  </span>
                }
                checked={Boolean(m.doneAt)}
                disabled={!active || toggle.isPending}
                onChange={() => toggle.mutate(m.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {g.progressMode === 'metric' && (
        <p className="text-sm text-muted">
          {OBJECTIVE_METRIC_LABELS[g.metric ?? 'manual']}: <span className="num">{fmt(Number(g.metricCurrent ?? 0))}</span> de <span className="num">{fmt(Number(g.metricTarget ?? 0))}</span> {g.unit ?? ''}
          {g.metric === 'manual' && ' (atualize editando a meta)'}
        </p>
      )}
      {g.missions.length > 0 && (
        <div>
          <p className="text-xs text-faint">Missões vinculadas</p>
          <ul className="mt-1 space-y-1">
            {g.missions.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <Link to={`/missoes/${m.id}`} className="truncate hover:text-accent">
                  {m.title}
                </Link>
                <StatusBadge value={m.status as never} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {g.blockedBy.length > 0 && (
        <p className="flex gap-1.5 text-sm text-warning">
          <Icon name="lock" size={15} className="mt-0.5 shrink-0" />
          Só pode ser concluída após: {g.blockedBy.map((b) => b.title).join(', ')}
        </p>
      )}
      {g.dependsOn.length > 0 && g.blockedBy.length === 0 && <p className="text-xs text-faint">Dependências concluídas: {g.dependsOn.map((d) => all.find((x) => x.id === d)?.title).join(', ')}</p>}
      {g.status !== 'completed' && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
          <Button size="sm" variant="ghost" icon="pencil" onClick={onEdit}>
            Editar
          </Button>
          {active ? (
            <Button size="sm" variant="ghost" icon="pause" onClick={() => status.mutate('paused')}>
              Pausar
            </Button>
          ) : (
            <Button size="sm" variant="ghost" icon="play" onClick={() => status.mutate('active')}>
              Reativar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon="x"
            onClick={async () => {
              const c = await confirm({ title: 'Abandonar meta', message: 'A meta fica no histórico como abandonada (sem penalidade).', confirmLabel: 'Abandonar' });
              if (c.ok) status.mutate('abandoned');
            }}
          >
            Abandonar
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon="trash"
            onClick={async () => {
              const c = await confirm({ title: 'Excluir meta', message: `Excluir "${g.title}" permanentemente? Missões vinculadas permanecem.`, danger: true, confirmLabel: 'Excluir' });
              if (c.ok) remove.mutate();
            }}
          >
            Excluir
          </Button>
        </div>
      )}
    </article>
  );
}

function GoalForm({ goal, all, onClose }: { goal: Goal | null; all: Goal[]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const initial: GoalInput = goal
    ? {
        title: goal.title,
        description: goal.description,
        categoryId: goal.categoryId,
        priority: goal.priority,
        difficulty: goal.difficulty,
        startDate: goal.startDate,
        deadline: goal.deadline,
        progressMode: goal.progressMode,
        metric: goal.metric,
        metricRefId: goal.metricRefId,
        metricStart: goal.metricStart != null ? Number(goal.metricStart) : null,
        metricTarget: goal.metricTarget != null ? Number(goal.metricTarget) : null,
        metricCurrent: goal.metricCurrent != null ? Number(goal.metricCurrent) : null,
        unit: goal.unit,
        milestones: goal.milestones.map((m) => ({ id: m.id, title: m.title, weight: m.weight, dueDate: m.dueDate, done: Boolean(m.doneAt) })),
        dependsOn: goal.dependsOn,
      }
    : { title: '', description: '', categoryId: null, priority: 'medium', difficulty: 'hard', startDate: null, deadline: null, progressMode: 'milestones', milestones: [{ title: '', weight: 1, dueDate: null, done: false }], dependsOn: [] };
  const form = useForm(goalInput, initial);
  const v = form.values;
  const save = useMutation({
    mutationFn: (d: unknown) => (goal ? api.put(`/api/goals/${goal.id}`, d) : api.post('/api/goals', d)),
    onSuccess: () => {
      toast.success(goal ? 'Meta atualizada' : 'Meta criada');
      toast.reward(null, null);
      onClose();
    },
    onError: (e) => {
      form.applyServerError(e);
      toast.error(e);
    },
  });
  const milestones = v.milestones ?? [];
  const setMs = (i: number, patch: Partial<(typeof milestones)[number]>) => form.set('milestones', milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const others = all.filter((g) => g.id !== goal?.id);
  return (
    <Modal open onClose={onClose} title={goal ? 'Editar meta' : 'Nova meta'} size="lg">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const d = form.validate();
          if (d) save.mutate(d);
          void qc;
        }}
      >
        <Input label="Nome" value={v.title} onChange={(e) => form.set('title', e.target.value)} error={form.errors.title} autoFocus />
        <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Prioridade" value={v.priority ?? 'medium'} onChange={(e) => form.set('priority', e.target.value as GoalInput['priority'])} options={Object.entries(PRIORITY).map(([value, label]) => ({ value, label }))} />
          <Select label="Dificuldade (recompensa)" value={v.difficulty ?? 'hard'} onChange={(e) => form.set('difficulty', e.target.value as GoalInput['difficulty'])} options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))} />
          <CategorySelect value={v.categoryId} onChange={(c) => form.set('categoryId', c)} />
          <Input label="Início" type="date" value={v.startDate ?? ''} onChange={(e) => form.set('startDate', e.target.value || null)} />
          <Input label="Prazo" type="date" value={v.deadline ?? ''} onChange={(e) => form.set('deadline', e.target.value || null)} />
          <Select label="Como medir o progresso" value={v.progressMode ?? 'milestones'} onChange={(e) => form.set('progressMode', e.target.value as GoalInput['progressMode'])} options={Object.entries(MODE).map(([value, label]) => ({ value, label }))} />
        </div>

        {v.progressMode === 'milestones' && (
          <fieldset className="space-y-2">
            <legend className="field-label">Etapas (o progresso é a soma dos pesos das etapas concluídas)</legend>
            {milestones.map((m, i) => (
              <div key={m.id ?? i} className="grid gap-2 sm:grid-cols-[1fr_5rem_9rem_auto_auto] sm:items-end">
                <Input label="Etapa" value={m.title} onChange={(e) => setMs(i, { title: e.target.value })} error={form.errors[`milestones.${i}.title`]} />
                <Input label="Peso" type="number" min={1} value={m.weight ?? 1} onChange={(e) => setMs(i, { weight: Number(e.target.value) })} />
                <Input label="Data" type="date" value={m.dueDate ?? ''} onChange={(e) => setMs(i, { dueDate: e.target.value || null })} />
                <div className="pb-2">
                  <Checkbox label="Feita" checked={m.done ?? false} onChange={(c) => setMs(i, { done: c })} />
                </div>
                <Button variant="ghost" icon="trash" aria-label="Remover etapa" onClick={() => form.set('milestones', milestones.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button size="sm" icon="plus" onClick={() => form.set('milestones', [...milestones, { title: '', weight: 1, dueDate: null, done: false }])}>
              Adicionar etapa
            </Button>
          </fieldset>
        )}
        {v.progressMode === 'missions' && <p className="text-sm text-muted">Vincule missões a esta meta pelo campo “Meta vinculada” no formulário de cada missão. O progresso é a fração de missões concluídas, ignorando as canceladas.</p>}
        {v.progressMode === 'metric' && (
          <div className="grid gap-3 sm:grid-cols-4">
            <Select label="Métrica" value={v.metric ?? 'manual'} onChange={(e) => form.set('metric', e.target.value as GoalInput['metric'])} options={OBJECTIVE_METRIC_VALUES.map((m) => ({ value: m, label: OBJECTIVE_METRIC_LABELS[m] }))} />
            <Input label="Valor inicial" type="number" value={v.metricStart ?? ''} onChange={(e) => form.set('metricStart', e.target.value === '' ? null : Number(e.target.value))} />
            <Input label="Alvo" type="number" value={v.metricTarget ?? ''} onChange={(e) => form.set('metricTarget', e.target.value === '' ? null : Number(e.target.value))} />
            <Input label="Unidade" value={v.unit ?? ''} onChange={(e) => form.set('unit', e.target.value || null)} />
            {v.metric === 'manual' && <Input label="Valor atual (manual)" type="number" value={v.metricCurrent ?? ''} onChange={(e) => form.set('metricCurrent', e.target.value === '' ? null : Number(e.target.value))} />}
            <p className="text-xs text-faint sm:col-span-4">Métricas automáticas (estudo, treino, distância, hábitos) são somadas dos registros entre o início e o prazo da meta.</p>
          </div>
        )}

        {others.length > 0 && (
          <fieldset>
            <legend className="field-label">Depende de (só conclui após estas)</legend>
            <div className="flex flex-wrap gap-2">
              {others.map((o) => {
                const on = (v.dependsOn ?? []).includes(o.id);
                return (
                  <button key={o.id} type="button" aria-pressed={on} className={`badge !py-1 ${on ? '!border-accent !text-accent' : ''}`} onClick={() => form.set('dependsOn', on ? (v.dependsOn ?? []).filter((x) => x !== o.id) : [...(v.dependsOn ?? []), o.id])}>
                    <Icon name={on ? 'check' : 'plus'} size={12} />
                    {o.title}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        <FormActions onCancel={onClose} loading={save.isPending} submitLabel={goal ? 'Salvar meta' : 'Criar meta'} />
      </form>
    </Modal>
  );
}
