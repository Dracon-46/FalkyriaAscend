import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { habitInput, unavailabilityInput } from '@rpg/contracts';
import { CHECKIN_STATUS_LABELS, DIFFICULTY_LABELS, PENALTY_TYPE_LABELS, UNAVAILABILITY_REASONS, UNAVAILABILITY_REASON_LABELS, daysFromMask } from '@rpg/engine';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import type { AfterAction, Habit, PenaltyApplication, RewardOutcome } from '../../lib/types';
import { useSession } from '../../app/session';
import { CategorySelect, FormActions, PenaltyRulesPicker, useForm, useLookups, WeekdayPicker, WeightsEditor } from '../../components/forms';
import { StatusStrip } from '../../components/charts/Charts';
import { AttrWeights } from '../../components/ui/domain';
import { Icon } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Badge, Button, Checkbox, EmptyState, ErrorState, Input, Loading, PageHeader, Panel, ProgressBar, Select, Textarea } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type HabitForm = z.input<typeof habitInput>;
type Unavailability = { id: string; startDate: string; endDate: string; reason: (typeof UNAVAILABILITY_REASONS)[number]; note: string | null; categoryId: string | null };
type HabitsResponse = { today: string; habits: Habit[]; archived: Habit[] };
type HabitDetail = Habit & {
  history: Array<{ id: string; localDate: string; status: keyof typeof CHECKIN_STATUS_LABELS; note: string | null; source: string; grantId: string | null }>;
  streak: { current: number; best: number; totalDone: number; interruptions: Array<{ date: string; lengthBefore: number }> };
  penalties: PenaltyApplication[];
};

const WEEKDAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const SUGGESTIONS: Array<Partial<HabitForm> & { title: string }> = [
  { title: 'Planejar o dia', description: 'Definir as 3 prioridades do dia.', attributeWeights: { ORG: 1 }, timeOfDay: '08:00', completionCriteria: 'Lista de prioridades escrita' },
  { title: 'Leitura (20 páginas)', attributeWeights: { INT: 0.7, DIS: 0.3 }, completionCriteria: '20 páginas lidas' },
  { title: 'Arrumar o ambiente', attributeWeights: { ORG: 0.6, DIS: 0.4 }, completionCriteria: 'Mesa e quarto organizados' },
  { title: 'Registrar despesas', attributeWeights: { ORG: 1 }, timeOfDay: '21:00', completionCriteria: 'Gastos do dia lançados' },
  { title: 'Rotina noturna', attributeWeights: { DIS: 0.6, VIT: 0.4 }, timeOfDay: '22:30', completionCriteria: 'Telas desligadas e preparação para o sono' },
  { title: 'Revisar metas', frequency: 'weekdays', weekdaysMask: 1, attributeWeights: { ORG: 0.6, EXE: 0.4 }, completionCriteria: 'Metas da semana revisadas' },
];

const emptyHabit = (today: string): HabitForm => ({
  title: '',
  description: '',
  categoryId: null,
  difficulty: 'routine',
  frequency: 'daily',
  weekdaysMask: 127,
  timesPerWeek: 3,
  timeOfDay: null,
  completionCriteria: '',
  startDate: today,
  endDate: null,
  tolerancePerWeek: 1,
  isBasicNeed: false,
  notify: true,
  sortOrder: 0,
  attributeWeights: {},
  penaltyRuleIds: [],
});

function habitToForm(h: Habit): HabitForm {
  return {
    title: h.title,
    description: h.description,
    categoryId: h.categoryId,
    difficulty: h.difficulty as HabitForm['difficulty'],
    frequency: h.frequency,
    weekdaysMask: h.weekdaysMask,
    timesPerWeek: h.timesPerWeek,
    timeOfDay: h.timeOfDay,
    completionCriteria: h.completionCriteria,
    startDate: h.startDate,
    endDate: h.endDate,
    tolerancePerWeek: h.tolerancePerWeek,
    isBasicNeed: h.isBasicNeed,
    notify: h.notify,
    sortOrder: h.sortOrder,
    attributeWeights: h.attributeWeights,
    penaltyRuleIds: h.penaltyRuleIds ?? [],
  };
}

function scheduleText(h: Habit) {
  if (h.frequency === 'daily') return 'Todos os dias';
  if (h.frequency === 'times_per_week') return `${h.timesPerWeek}× por semana`;
  return daysFromMask(h.weekdaysMask).map((d) => WEEKDAY_NAMES[d]).join(', ');
}

export function HabitsPage() {
  const me = useSession();
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ['habits'], queryFn: () => api.get<HabitsResponse>('/api/habits') });
  const [editing, setEditing] = useState<{ key: string; id?: string; initial: HabitForm } | null>(
    params.get('novo') === '1' ? { key: 'new', initial: emptyHabit(me.today) } : null,
  );
  const [detail, setDetail] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.post('/api/habits/reorder', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits'] }),
    onError: (e) => toast.error(e),
  });

  const closeForm = () => {
    setEditing(null);
    if (params.get('novo')) setParams({}, { replace: true });
  };

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const habits = q.data.habits;
  const today = q.data.today;
  const scheduled = habits.filter((h) => h.scheduledToday && h.status === 'active');
  const doneToday = scheduled.filter((h) => h.todayStatus === 'done').length;

  const move = (index: number, dir: -1 | 1) => {
    const ids = habits.map((h) => h.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    reorder.mutate(ids);
  };

  return (
    <>
      <PageHeader
        title="Hábitos"
        icon="flame"
        subtitle="Cada hábito tem sua própria frequência, tolerância e sequência. Descanso programado e indisponibilidade nunca contam como falha."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing({ key: `new-${Date.now()}`, initial: emptyHabit(today) })}>
            Novo hábito
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title={`Hoje — ${fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}`} icon="calendar-check">
            {scheduled.length > 0 && (
              <div className="mb-4 flex items-center gap-3">
                <ProgressBar value={doneToday / scheduled.length} className="flex-1" label="Hábitos cumpridos hoje" />
                <span className="num text-sm text-muted">
                  {doneToday}/{scheduled.length}
                </span>
              </div>
            )}
            {habits.length === 0 ? (
              <EmptyState icon="flame" title="Nenhum hábito cadastrado" action={<Button onClick={() => setEditing({ key: 'new', initial: emptyHabit(today) })}>Criar hábito</Button>}>
                Comece com poucos hábitos essenciais. Use as sugestões ao lado para preencher o formulário.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {habits.map((h, i) => (
                  <HabitRow
                    key={h.id}
                    h={h}
                    today={today}
                    first={i === 0}
                    last={i === habits.length - 1}
                    onMove={(dir) => move(i, dir)}
                    onEdit={() => setEditing({ key: h.id, id: h.id, initial: habitToForm(h) })}
                    onDetail={() => setDetail(h.id)}
                  />
                ))}
              </ul>
            )}
          </Panel>

          {q.data.archived.length > 0 && (
            <Panel title="Arquivados" icon="archive" actions={<Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Ocultar' : `Mostrar (${q.data.archived.length})`}</Button>}>
              {showArchived ? (
                <ul className="divide-y divide-line">
                  {q.data.archived.map((h) => (
                    <ArchivedRow key={h.id} h={h} onDetail={() => setDetail(h.id)} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-faint">Hábitos arquivados preservam histórico e sequências, mas não são avaliados.</p>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Sugestões" icon="compass">
            <p className="mb-3 text-sm text-muted">Preenchem o formulário para você revisar. Nada é criado automaticamente.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  className="badge !py-1 text-[0.82rem] hover:border-accent"
                  onClick={() => setEditing({ key: `sug-${s.title}`, initial: { ...emptyHabit(today), ...s } })}
                >
                  <Icon name="plus" size={12} />
                  {s.title}
                </button>
              ))}
            </div>
          </Panel>
          <UnavailabilityPanel today={today} />
          <Panel title="Como funcionam as falhas" icon="info">
            <ul className="space-y-1.5 text-sm text-muted">
              <li>• O dia é fechado às 04:00 (horário local): até lá você ainda pode registrar o dia anterior.</li>
              <li>• A tolerância semanal transforma as primeiras falhas em "falha tolerada", sem penalidade e sem quebrar a sequência.</li>
              <li>• Só se aplicam as penalidades escolhidas em cada hábito. Necessidades básicas nunca são penalizadas.</li>
              <li>• Modo de recuperação e suspensão de penalidades ficam em Configurações → Penalidades.</li>
            </ul>
          </Panel>
        </div>
      </div>

      {editing && <HabitFormModal key={editing.key} habitId={editing.id} initial={editing.initial} onClose={closeForm} />}
      {detail && <HabitDetailModal id={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function HabitRow({ h, today, first, last, onMove, onEdit, onDetail }: { h: Habit; today: string; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onEdit: () => void; onDetail: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const checkin = useMutation({
    mutationFn: (status: 'done' | 'rest' | 'excused') =>
      api.post<{ reward: RewardOutcome | null; after: AfterAction; streak: { current: number; milestones: number[] } | null }>(`/api/habits/${h.id}/checkins`, { status }),
    onSuccess: (r, status) => {
      if (status === 'done') toast.reward(r.reward, r.after, h.title);
      else {
        toast.success(status === 'rest' ? 'Dia marcado como descanso' : 'Dia dispensado');
        toast.reward(null, null);
      }
      for (const m of r.streak?.milestones ?? []) toast.success(`Marco de sequência: ${m} seguidas em "${h.title}"`);
    },
    onError: (e) => toast.error(e),
  });
  const undo = useMutation({
    mutationFn: () => api.del(`/api/habits/${h.id}/checkins/${today}`),
    onSuccess: () => {
      toast.info('Registro de hoje desfeito (recompensa estornada).');
      toast.reward(null, null);
    },
    onError: (e) => toast.error(e),
  });
  const status = useMutation({
    mutationFn: (body: { status: 'active' | 'paused' | 'archived'; pausedUntil?: string | null }) => api.patch(`/api/habits/${h.id}/status`, body),
    onSuccess: (_r, body) => {
      toast.success(body.status === 'paused' ? 'Hábito pausado' : body.status === 'archived' ? 'Hábito arquivado' : 'Hábito retomado');
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/habits/${h.id}`),
    onSuccess: () => {
      toast.success('Hábito excluído');
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e),
  });
  const [pausing, setPausing] = useState(false);
  const done = h.todayStatus === 'done';
  const canCheck = h.status === 'active' && h.scheduledToday && h.todayStatus === null;

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <button
          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] border transition-colors ${done ? 'border-success bg-success/15' : 'border-line-strong hover:border-accent'} disabled:cursor-not-allowed disabled:opacity-60`}
          aria-label={done ? `${h.title}: cumprido hoje` : `Marcar ${h.title} como cumprido`}
          aria-pressed={done}
          disabled={!canCheck || checkin.isPending}
          onClick={() => checkin.mutate('done')}
        >
          {done ? <Icon name="check" size={16} className="text-success" /> : h.todayStatus ? <Icon name="minus" size={14} className="text-faint" /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button className="text-left font-display hover:text-accent" onClick={onDetail}>
              {h.title}
            </button>
            {h.status === 'paused' && <Badge tone="warning">Pausado{h.pausedUntil ? ` até ${fmtDate(h.pausedUntil)}` : ''}</Badge>}
            {h.isBasicNeed && <Badge tone="info" title="Necessidade básica: nunca gera penalidade">Necessidade básica</Badge>}
            {h.todayStatus && h.todayStatus !== 'done' && <Badge>{CHECKIN_STATUS_LABELS[h.todayStatus]}</Badge>}
            {!h.scheduledToday && h.status === 'active' && <Badge>Não programado hoje</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-faint">
            {scheduleText(h)}
            {h.timeOfDay && ` · ${h.timeOfDay}`} · {DIFFICULTY_LABELS[h.difficulty]} · tolerância {h.tolerancePerWeek}/sem.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusStrip days={h.last14} />
            {h.frequency === 'times_per_week' && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <ProgressBar value={h.weekDone / h.timesPerWeek} className="!h-1.5 w-20" label="Meta semanal" />
                <span className="num">
                  {h.weekDone}/{h.timesPerWeek} na semana
                </span>
              </span>
            )}
            <span className="num inline-flex items-center gap-1 text-xs text-warning" title="Sequência atual / melhor">
              <Icon name="flame" size={13} />
              {h.currentStreak}
              <span className="text-faint">/ melhor {h.bestStreak}</span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {canCheck && (
              <>
                <Button size="sm" variant="ghost" icon="moon" onClick={() => checkin.mutate('rest')}>
                  Descanso
                </Button>
                <Button size="sm" variant="ghost" icon="shield" onClick={() => checkin.mutate('excused')}>
                  Dispensar
                </Button>
              </>
            )}
            {h.todayStatus && (
              <Button size="sm" variant="ghost" icon="undo" loading={undo.isPending} onClick={() => undo.mutate()}>
                Desfazer hoje
              </Button>
            )}
            <Button size="sm" variant="ghost" icon="pencil" onClick={onEdit}>
              Editar
            </Button>
            {h.status === 'active' ? (
              <Button size="sm" variant="ghost" icon="pause" onClick={() => setPausing(true)}>
                Pausar
              </Button>
            ) : (
              <Button size="sm" variant="ghost" icon="play" onClick={() => status.mutate({ status: 'active' })}>
                Retomar
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon="archive"
              onClick={async () => {
                const r = await confirm({ title: 'Arquivar hábito', message: `Arquivar "${h.title}"? O histórico e as sequências são preservados.`, confirmLabel: 'Arquivar' });
                if (r.ok) status.mutate({ status: 'archived' });
              }}
            >
              Arquivar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="trash"
              onClick={async () => {
                const r = await confirm({ title: 'Excluir hábito', message: `Excluir "${h.title}"? Só é possível se não houver histórico; caso contrário, arquive.`, danger: true, confirmLabel: 'Excluir' });
                if (r.ok) remove.mutate();
              }}
            >
              Excluir
            </Button>
          </div>
        </div>
        <div className="flex shrink-0 flex-col">
          <Button size="sm" variant="ghost" icon="arrow-left" className="rotate-90" aria-label="Mover para cima" disabled={first} onClick={() => onMove(-1)} />
          <Button size="sm" variant="ghost" icon="arrow-right" className="rotate-90" aria-label="Mover para baixo" disabled={last} onClick={() => onMove(1)} />
        </div>
      </div>
      {pausing && (
        <PauseModal
          title={h.title}
          onClose={() => setPausing(false)}
          onConfirm={(until) => {
            status.mutate({ status: 'paused', pausedUntil: until });
            setPausing(false);
          }}
        />
      )}
    </li>
  );
}

function ArchivedRow({ h, onDetail }: { h: Habit; onDetail: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const restore = useMutation({
    mutationFn: () => api.patch(`/api/habits/${h.id}/status`, { status: 'active' }),
    onSuccess: () => {
      toast.success('Hábito restaurado');
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <li className="flex items-center gap-3 py-2">
      <button className="min-w-0 flex-1 truncate text-left hover:text-accent" onClick={onDetail}>
        {h.title}
      </button>
      <span className="text-xs text-faint">melhor sequência {h.bestStreak}</span>
      <Button size="sm" icon="rotate-ccw" loading={restore.isPending} onClick={() => restore.mutate()}>
        Restaurar
      </Button>
    </li>
  );
}

function PauseModal({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: (until: string | null) => void }) {
  const [until, setUntil] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={`Pausar "${title}"`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon="pause" onClick={() => onConfirm(until || null)}>
            Pausar
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">Dias pausados ficam como "dispensado": sem falha, sem penalidade e sem quebrar a sequência.</p>
      <Input label="Pausar até (opcional)" type="date" value={until} onChange={(e) => setUntil(e.target.value)} hint="Sem data, o hábito fica pausado até você retomá-lo." />
    </Modal>
  );
}

function HabitFormModal({ habitId, initial, onClose }: { habitId?: string; initial: HabitForm; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const lookups = useLookups();
  const form = useForm(habitInput, initial);
  const v = form.values;
  const category = lookups.data?.categories.find((c) => c.id === v.categoryId);
  const basicNeed = Boolean(v.isBasicNeed || category?.isBasicNeed);
  const save = useMutation({
    mutationFn: (data: z.output<typeof habitInput>) => (habitId ? api.put(`/api/habits/${habitId}`, data) : api.post('/api/habits', data)),
    onSuccess: () => {
      toast.success(habitId ? 'Hábito atualizado' : 'Hábito criado');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => {
      form.applyServerError(e);
      toast.error(e);
    },
  });
  return (
    <Modal open onClose={onClose} title={habitId ? 'Editar hábito' : 'Novo hábito'} size="lg">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const data = form.validate();
          if (data) save.mutate(basicNeed ? { ...data, penaltyRuleIds: [] } : data);
        }}
      >
        <Input label="Nome" value={v.title} onChange={(e) => form.set('title', e.target.value)} error={form.errors.title} autoFocus />
        <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <div className="grid gap-3 sm:grid-cols-3">
          <CategorySelect value={v.categoryId} onChange={(c) => form.set('categoryId', c)} />
          <Select
            label="Dificuldade"
            value={v.difficulty ?? 'routine'}
            onChange={(e) => form.set('difficulty', e.target.value as HabitForm['difficulty'])}
            options={(['routine', 'easy', 'moderate'] as const).map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
            hint="Hábitos admitem até Moderada."
          />
          <Input label="Horário (opcional)" type="time" value={v.timeOfDay ?? ''} onChange={(e) => form.set('timeOfDay', e.target.value || null)} error={form.errors.timeOfDay} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Frequência"
            value={v.frequency ?? 'daily'}
            onChange={(e) => form.set('frequency', e.target.value as HabitForm['frequency'])}
            options={[
              { value: 'daily', label: 'Todos os dias' },
              { value: 'weekdays', label: 'Dias específicos da semana' },
              { value: 'times_per_week', label: 'N vezes por semana' },
            ]}
          />
          {v.frequency === 'weekdays' && (
            <div>
              <p className="field-label">Dias programados (os demais são descanso)</p>
              <WeekdayPicker mask={v.weekdaysMask ?? 127} onChange={(m) => form.set('weekdaysMask', m)} />
            </div>
          )}
          {v.frequency === 'times_per_week' && (
            <Input
              label="Vezes por semana"
              type="number"
              min={1}
              max={7}
              value={v.timesPerWeek ?? 3}
              onChange={(e) => form.set('timesPerWeek', Number(e.target.value))}
              error={form.errors.timesPerWeek}
              hint="Avaliado no domingo; dias dispensados reduzem a meta proporcionalmente."
            />
          )}
        </div>
        <Input label="Critério de conclusão" value={v.completionCriteria ?? ''} onChange={(e) => form.set('completionCriteria', e.target.value)} placeholder="Ex.: 20 páginas lidas" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Início" type="date" value={v.startDate} onChange={(e) => form.set('startDate', e.target.value)} error={form.errors.startDate} />
          <Input label="Fim (opcional)" type="date" value={v.endDate ?? ''} onChange={(e) => form.set('endDate', e.target.value || null)} error={form.errors.endDate} />
          <Input
            label="Tolerância (falhas/semana)"
            type="number"
            min={0}
            max={7}
            value={v.tolerancePerWeek ?? 1}
            onChange={(e) => form.set('tolerancePerWeek', Number(e.target.value))}
            hint="Falhas toleradas não penalizam nem quebram a sequência."
          />
        </div>
        <Checkbox
          label="Necessidade básica (sono, alimentação, descanso)"
          hint="Pode ser registrada e recompensada, mas nunca gera penalidade."
          checked={v.isBasicNeed ?? false}
          onChange={(c) => form.set('isBasicNeed', c)}
        />
        <WeightsEditor value={v.attributeWeights ?? {}} onChange={(w) => form.set('attributeWeights', w)} />
        <PenaltyRulesPicker
          value={basicNeed ? [] : (v.penaltyRuleIds ?? [])}
          onChange={(ids) => form.set('penaltyRuleIds', ids)}
          disabled={basicNeed}
          disabledReason="Necessidades básicas não admitem penalidades."
        />
        <Checkbox label="Receber lembretes deste hábito" checked={v.notify ?? true} onChange={(c) => form.set('notify', c)} />
        <FormActions onCancel={onClose} loading={save.isPending} submitLabel={habitId ? 'Salvar alterações' : 'Criar hábito'} />
      </form>
    </Modal>
  );
}

function HabitDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['habit', id], queryFn: () => api.get<HabitDetail>(`/api/habits/${id}`) });
  const lookups = useLookups();
  const h = q.data;
  const rules = (lookups.data?.penaltyRules ?? []).filter((r) => h?.penaltyRuleIds?.includes(r.id));
  const tone: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'muted'> = { done: 'success', missed: 'danger', tolerated: 'warning', excused: 'info', rest: 'info', skipped: 'muted' };
  return (
    <Modal open onClose={onClose} title={h?.title ?? 'Hábito'} size="lg">
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !h ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-5">
          {h.description && <p className="text-muted">{h.description}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-faint uppercase">Sequência atual</p>
              <p className="num text-xl text-warning">{h.streak.current}</p>
            </div>
            <div>
              <p className="text-xs text-faint uppercase">Melhor sequência</p>
              <p className="num text-xl">{Math.max(h.streak.best, h.bestStreak)}</p>
            </div>
            <div>
              <p className="text-xs text-faint uppercase">Total cumprido</p>
              <p className="num text-xl">{h.streak.totalDone}</p>
            </div>
            <div>
              <p className="text-xs text-faint uppercase">Interrupções</p>
              <p className="num text-xl">{h.streak.interruptions.length}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <AttrWeights weights={h.attributeWeights} />
            {h.completionCriteria && <Badge>Critério: {h.completionCriteria}</Badge>}
          </div>
          <div>
            <p className="field-label">Penalidades configuradas</p>
            {rules.length === 0 ? <p className="text-sm text-faint">Nenhuma: falhas são apenas registradas.</p> : <p className="text-sm">{rules.map((r) => `${r.name} (${PENALTY_TYPE_LABELS[r.type]})`).join(' · ')}</p>}
          </div>
          {h.streak.interruptions.length > 0 && (
            <div>
              <p className="field-label">Interrupções de sequência</p>
              <ul className="flex flex-wrap gap-1.5 text-xs">
                {h.streak.interruptions.slice(-10).map((i) => (
                  <li key={i.date} className="badge">
                    {fmtDate(i.date)}: sequência de {i.lengthBefore}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {h.penalties.length > 0 && (
            <div>
              <p className="field-label">Penalidades aplicadas</p>
              <ul className="divide-y divide-line text-sm">
                {h.penalties.map((p) => (
                  <li key={p.id} className="py-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{fmtDate(p.localDate)}</span>
                      <span className="text-muted">{PENALTY_TYPE_LABELS[p.type]}</span>
                      {p.amount > 0 && <span className="num text-danger">−{p.amount}</span>}
                      {p.status === 'reversed' && <Badge>revertida{p.reversalReason ? `: ${p.reversalReason}` : ''}</Badge>}
                    </div>
                    <p className="text-xs text-faint">{p.explanation.join(' · ')}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="field-label">Histórico de registros</p>
            {h.history.length === 0 ? (
              <p className="text-sm text-faint">Nenhum registro ainda.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Situação</th>
                      <th>Origem</th>
                      <th>Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.history.map((c) => (
                      <tr key={c.id}>
                        <td>{fmtDate(c.localDate, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td>
                          <Badge tone={tone[c.status] ?? 'muted'}>{CHECKIN_STATUS_LABELS[c.status]}</Badge>
                        </td>
                        <td className="text-xs text-faint">{c.source === 'evaluation' ? 'avaliação diária' : c.source === 'user' ? 'você' : c.source}</td>
                        <td className="text-xs text-muted">{c.note ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function UnavailabilityPanel({ today }: { today: string }) {
  const q = useQuery({ queryKey: ['unavailability'], queryFn: () => api.get<Unavailability[]>('/api/unavailability') });
  const lookups = useLookups();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/unavailability/${id}`),
    onSuccess: () => {
      toast.success('Período removido');
      void qc.invalidateQueries({ queryKey: ['unavailability'] });
    },
    onError: (e) => toast.error(e),
  });
  const list = [...(q.data ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return (
    <Panel title="Indisponibilidade e descanso" icon="bed" actions={<Button size="sm" icon="plus" onClick={() => setAdding(true)}>Registrar</Button>}>
      <p className="mb-3 text-sm text-muted">Doença, lesão, viagem, emergência ou descanso planejado: os dias do período ficam dispensados, sem falha nem penalidade.</p>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <p className="text-sm text-faint">Nenhum período registrado.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((u) => {
            const current = u.startDate <= today && u.endDate >= today;
            const cat = lookups.data?.categories.find((c) => c.id === u.categoryId);
            return (
              <li key={u.id} className="flex items-start gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p>
                    {UNAVAILABILITY_REASON_LABELS[u.reason]} {current && <Badge tone="info">em vigor</Badge>}
                  </p>
                  <p className="text-xs text-faint">
                    {fmtDate(u.startDate)} — {fmtDate(u.endDate)} · {cat ? cat.name : 'todas as áreas'}
                    {u.note && ` · ${u.note}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  aria-label="Remover período"
                  onClick={async () => {
                    const r = await confirm({ title: 'Remover período', message: 'Dias já avaliados permanecem como estão; apenas avaliações futuras são afetadas.', danger: true, confirmLabel: 'Remover' });
                    if (r.ok) remove.mutate(u.id);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
      {adding && <UnavailabilityForm today={today} onClose={() => setAdding(false)} />}
    </Panel>
  );
}

function UnavailabilityForm({ today, onClose }: { today: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm(unavailabilityInput, { startDate: today, endDate: today, reason: 'illness', note: null, categoryId: null });
  const v = form.values;
  const save = useMutation({
    mutationFn: (data: z.output<typeof unavailabilityInput>) => api.post('/api/unavailability', data),
    onSuccess: () => {
      toast.success('Período registrado');
      void qc.invalidateQueries({ queryKey: ['unavailability'] });
      onClose();
    },
    onError: (e) => {
      form.applyServerError(e);
      toast.error(e);
    },
  });
  return (
    <Modal open onClose={onClose} title="Registrar indisponibilidade" size="sm">
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const data = form.validate();
          if (data) save.mutate(data);
        }}
      >
        <Select label="Motivo" value={v.reason} onChange={(e) => form.set('reason', e.target.value as typeof v.reason)} options={UNAVAILABILITY_REASONS.map((r) => ({ value: r, label: UNAVAILABILITY_REASON_LABELS[r] }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="De" type="date" value={v.startDate} onChange={(e) => form.set('startDate', e.target.value)} error={form.errors.startDate} />
          <Input label="Até" type="date" value={v.endDate} onChange={(e) => form.set('endDate', e.target.value)} error={form.errors.endDate} />
        </div>
        <CategorySelect label="Área afetada" value={v.categoryId} onChange={(c) => form.set('categoryId', c)} />
        <p className="-mt-2 text-xs text-faint">Sem categoria, vale para todos os hábitos e missões.</p>
        <Input label="Observação (opcional)" value={v.note ?? ''} onChange={(e) => form.set('note', e.target.value || null)} />
        <FormActions onCancel={onClose} loading={save.isPending} submitLabel="Registrar" />
      </form>
    </Modal>
  );
}

