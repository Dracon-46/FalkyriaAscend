import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OBJECTIVE_METRIC_LABELS, OBJECTIVE_METRIC_VALUES, templateInput, type MissionInput } from '@rpg/contracts';
import { DIFFICULTIES, DIFFICULTY_LABELS, MISSION_TYPES, MISSION_TYPE_LABELS } from '@rpg/engine';
import type { z } from 'zod';
import { api, qs } from '../../lib/api';
import { fmtDate, pct } from '../../lib/format';
import type { AfterAction, Mission, RewardOutcome } from '../../lib/types';
import { useSession } from '../../app/session';
import { CategorySelect, FormActions, PenaltyRulesPicker, useForm, WeekdayPicker, WeightsEditor } from '../../components/forms';
import { DifficultyBadge, StatusBadge, TypeBadge } from '../../components/ui/domain';
import { Icon } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Badge, Button, Checkbox, EmptyState, ErrorState, Input, Loading, PageHeader, Panel, ProgressBar, Select, Tabs, Textarea } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';
import { emptyMission, MissionForm } from './MissionForm';

type Tab = 'active' | 'done' | 'failed' | 'other' | 'templates' | 'suggestions';
const STATUS_BY_TAB: Record<Exclude<Tab, 'templates' | 'suggestions'>, string> = {
  active: 'available,in_progress',
  done: 'completed',
  failed: 'failed,expired',
  other: 'cancelled,suspended',
};

export function MissionsPage() {
  const me = useSession();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('aba') as Tab) ?? 'active');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(params.get('nova') === '1');
  const [prefill, setPrefill] = useState<MissionInput | null>(null);

  const list = useQuery({
    queryKey: ['missions', tab, type, q],
    queryFn: () => api.get<Mission[]>(`/api/missions${qs({ status: STATUS_BY_TAB[tab as keyof typeof STATUS_BY_TAB], type, q })}`),
    enabled: tab !== 'templates' && tab !== 'suggestions',
  });

  const closeCreate = () => {
    setCreating(false);
    setPrefill(null);
    if (params.get('nova')) setParams({}, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Missões"
        icon="swords"
        subtitle="Tarefas, desafios e projetos com recompensas explícitas. Dificuldade, prazos e penalidades seguem regras verificáveis."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Nova missão
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'active', label: 'Ativas', icon: 'play' },
          { value: 'done', label: 'Concluídas', icon: 'check-circle' },
          { value: 'failed', label: 'Falhas e expiradas', icon: 'alert-triangle' },
          { value: 'other', label: 'Suspensas e canceladas', icon: 'pause' },
          { value: 'templates', label: 'Modelos e recorrência', icon: 'refresh' },
          { value: 'suggestions', label: 'Sugestões', icon: 'compass' },
        ]}
      />
      {tab === 'templates' ? (
        <TemplatesTab />
      ) : tab === 'suggestions' ? (
        <SuggestionsTab
          onAccept={(m) => {
            setPrefill(m);
            setCreating(true);
          }}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Input className="!w-64" placeholder="Buscar por nome…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar missões" />
            <Select className="!w-48" value={type} onChange={(e) => setType(e.target.value)} placeholder="Todos os tipos" options={MISSION_TYPES.map((t) => ({ value: t, label: MISSION_TYPE_LABELS[t] }))} aria-label="Filtrar por tipo" />
          </div>
          {list.isLoading ? (
            <Loading />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data!.length === 0 ? (
            <Panel>
              <EmptyState icon="map" title="Nenhuma missão aqui" action={tab === 'active' ? <Button onClick={() => setCreating(true)}>Criar missão</Button> : undefined}>
                {tab === 'active' ? 'Crie missões únicas, recorrentes, de projeto ou desafios compostos.' : 'Nada neste filtro.'}
              </EmptyState>
            </Panel>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.data!.map((m) => (
                <MissionCard key={m.id} m={m} />
              ))}
            </div>
          )}
        </>
      )}
      {creating && <MissionForm key={prefill ? 'prefill' : 'new'} open onClose={closeCreate} initial={prefill ?? emptyMission(me.today)} title={prefill ? 'Nova missão (sugestão)' : 'Nova missão'} />}
    </>
  );
}

function MissionCard({ m }: { m: Mission }) {
  const toast = useToast();
  const complete = useMutation({
    mutationFn: () => api.post<{ reward: RewardOutcome | null; after: AfterAction }>(`/api/missions/${m.id}/action`, { action: 'complete' }),
    onSuccess: (r) => toast.reward(r.reward, r.after, 'Missão concluída'),
    onError: (e) => toast.error(e),
  });
  const required = m.objectives.filter((o) => !o.optional);
  const progress = required.length ? required.reduce((a, o) => a + Math.min(1, Number(o.current) / Number(o.target)), 0) / required.length : null;
  const active = m.status === 'available' || m.status === 'in_progress';
  return (
    <article className="panel panel-hover flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/missoes/${m.id}`} className="min-w-0 font-display text-[1.02rem] hover:text-accent">
          {m.hidden && <Icon name="lock" size={14} className="mr-1 inline text-faint" />}
          {m.title}
        </Link>
        <StatusBadge value={m.status} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <DifficultyBadge value={m.difficulty} />
        <TypeBadge value={m.type} />
        {m.dueDate && <Badge tone={m.dueDate < new Date().toISOString().slice(0, 10) && active ? 'danger' : 'muted'}>Prazo {fmtDate(m.dueDate)}</Badge>}
        {m.priority > 0 && <Badge tone="accent">{'★'.repeat(m.priority)}</Badge>}
      </div>
      {progress !== null && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>
              {required.filter((o) => Number(o.current) >= Number(o.target)).length}/{required.length} objetivos
            </span>
            <span className="num">{pct(progress)}</span>
          </div>
          <ProgressBar value={progress} label="Progresso da missão" />
        </div>
      )}
      {active && (
        <div className="mt-auto flex gap-2">
          <Button size="sm" variant="primary" icon="check" disabled={progress !== null && progress < 1} loading={complete.isPending} onClick={() => complete.mutate()}>
            Concluir
          </Button>
          <Link to={`/missoes/${m.id}`} className="btn btn-ghost btn-sm">
            Detalhes
          </Link>
        </div>
      )}
    </article>
  );
}

interface Suggestion {
  reason: string;
  mission: MissionInput;
}

function SuggestionsTab({ onAccept }: { onAccept: (m: MissionInput) => void }) {
  const q = useQuery({ queryKey: ['mission-suggestions'], queryFn: () => api.get<Suggestion[]>('/api/missions/suggestions') });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        Sugestões baseadas em áreas negligenciadas, metas sem missões, hábitos com baixa adesão e ritmo de estudo. Nada é criado automaticamente e nenhuma sugestão vem com penalidade.
      </p>
      {q.data!.length === 0 ? (
        <Panel>
          <EmptyState icon="compass" title="Nenhuma sugestão no momento">
            Seu ritmo está equilibrado nas áreas acompanhadas.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data!.map((s, i) => (
            <div key={i} className="panel flex flex-col gap-2">
              <p className="font-display">{s.mission.title}</p>
              <p className="text-sm text-muted">{s.reason}</p>
              <div className="flex flex-wrap gap-1.5">
                <DifficultyBadge value={s.mission.difficulty} />
                <TypeBadge value={s.mission.type} />
              </div>
              <div className="mt-auto">
                <Button size="sm" icon="plus" onClick={() => onAccept(s.mission)}>
                  Revisar e criar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

type TemplateInput = z.input<typeof templateInput>;
interface Template extends TemplateInput {
  id: string;
}

const RECURRENCE_LABELS = { none: 'Sem recorrência', daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal' } as const;

function TemplatesTab() {
  const q = useQuery({ queryKey: ['mission-templates'], queryFn: () => api.get<Template[]>('/api/mission-templates') });
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const toggle = useMutation({
    mutationFn: (t: Template) => api.put(`/api/mission-templates/${t.id}`, { ...t, active: !t.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mission-templates'] }),
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/mission-templates/${id}`),
    onSuccess: () => {
      toast.success('Modelo excluído');
      void qc.invalidateQueries({ queryKey: ['mission-templates'] });
    },
    onError: (e) => toast.error(e),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Modelos ativos com recorrência geram uma missão por período (dia, semana ou mês) — nunca duplicada.</p>
        <Button icon="plus" onClick={() => setEditing('new')}>
          Novo modelo
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {q.data!.map((t) => (
          <div key={t.id} className="panel flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display">{t.title}</p>
              <Badge tone={t.active ? 'success' : 'muted'}>{t.active ? 'Ativo' : 'Inativo'}</Badge>
            </div>
            <p className="text-sm text-muted">{t.description}</p>
            <div className="flex flex-wrap gap-1.5">
              <DifficultyBadge value={t.difficulty} />
              <TypeBadge value={t.type} />
              <Badge>{RECURRENCE_LABELS[t.recurrence ?? 'none']}</Badge>
              {(t.objectives?.length ?? 0) > 0 && <Badge>{t.objectives!.length} objetivos</Badge>}
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button size="sm" icon={t.active ? 'pause' : 'play'} onClick={() => toggle.mutate(t)}>
                {t.active ? 'Desativar' : 'Ativar'}
              </Button>
              <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(t)}>
                Editar
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon="trash"
                onClick={async () => {
                  const r = await confirm({ title: 'Excluir modelo', message: `Excluir "${t.title}"? Missões já geradas permanecem.`, danger: true, confirmLabel: 'Excluir' });
                  if (r.ok) remove.mutate(t.id);
                }}
              >
                Excluir
              </Button>
            </div>
          </div>
        ))}
      </div>
      {editing && <TemplateForm template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TemplateForm({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm(
    templateInput,
    template ?? { title: '', description: '', type: 'weekly', difficulty: 'moderate', categoryId: null, recurrence: 'weekly', weekdaysMask: 127, durationDays: 7, attributeWeights: {}, objectives: [], penaltyRuleIds: [], active: true },
  );
  const v = form.values;
  const save = useMutation({
    mutationFn: (data: unknown) => (template ? api.put(`/api/mission-templates/${template.id}`, data) : api.post('/api/mission-templates', data)),
    onSuccess: () => {
      toast.success('Modelo salvo');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const objectives = v.objectives ?? [];
  return (
    <Modal open onClose={onClose} title={template ? 'Editar modelo' : 'Novo modelo de missão'} size="lg">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const data = form.validate();
          if (data) save.mutate(data);
        }}
      >
        <Input label="Nome" value={v.title} onChange={(e) => form.set('title', e.target.value)} error={form.errors.title} />
        <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <div className="grid gap-3 sm:grid-cols-4">
          <Select label="Tipo" value={v.type} onChange={(e) => form.set('type', e.target.value as TemplateInput['type'])} options={MISSION_TYPES.map((t) => ({ value: t, label: MISSION_TYPE_LABELS[t] }))} />
          <Select label="Dificuldade" value={v.difficulty} onChange={(e) => form.set('difficulty', e.target.value as TemplateInput['difficulty'])} options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))} />
          <Select label="Recorrência" value={v.recurrence ?? 'none'} onChange={(e) => form.set('recurrence', e.target.value as TemplateInput['recurrence'])} options={Object.entries(RECURRENCE_LABELS).map(([value, label]) => ({ value, label }))} />
          <CategorySelect value={v.categoryId} onChange={(c) => form.set('categoryId', c)} />
        </div>
        {v.recurrence === 'daily' && (
          <div>
            <p className="field-label">Dias em que a missão é gerada</p>
            <WeekdayPicker mask={v.weekdaysMask ?? 127} onChange={(m) => form.set('weekdaysMask', m)} />
          </div>
        )}
        <fieldset className="space-y-2">
          <legend className="field-label">Objetivos (copiados para cada missão gerada)</legend>
          {objectives.map((o, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_12rem_6rem_auto] sm:items-end">
              <Input label="Objetivo" value={o.title} onChange={(e) => form.set('objectives', objectives.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Select
                label="Medido por"
                value={o.metric}
                onChange={(e) => form.set('objectives', objectives.map((x, j) => (j === i ? { ...x, metric: e.target.value as typeof o.metric } : x)))}
                options={OBJECTIVE_METRIC_VALUES.map((m) => ({ value: m, label: OBJECTIVE_METRIC_LABELS[m] }))}
              />
              <Input label="Meta" type="number" value={o.target} onChange={(e) => form.set('objectives', objectives.map((x, j) => (j === i ? { ...x, target: Number(e.target.value) } : x)))} />
              <Button variant="ghost" icon="trash" aria-label="Remover" onClick={() => form.set('objectives', objectives.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" icon="plus" onClick={() => form.set('objectives', [...objectives, { title: '', metric: 'manual', target: 1 }])}>
            Adicionar objetivo
          </Button>
        </fieldset>
        <WeightsEditor value={v.attributeWeights ?? {}} onChange={(w) => form.set('attributeWeights', w)} />
        <PenaltyRulesPicker value={v.penaltyRuleIds ?? []} onChange={(ids) => form.set('penaltyRuleIds', ids)} />
        <Checkbox label="Modelo ativo" checked={v.active ?? true} onChange={(c) => form.set('active', c)} />
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

