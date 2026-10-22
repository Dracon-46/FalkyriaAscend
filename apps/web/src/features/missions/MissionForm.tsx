import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { missionInput, OBJECTIVE_METRIC_LABELS, OBJECTIVE_METRIC_VALUES, type MissionInput } from '@rpg/contracts';
import { DIFFICULTIES, DIFFICULTY_LABELS, MISSION_TYPES, MISSION_TYPE_LABELS, validateDifficulty, type GameConfig } from '@rpg/engine';
import { api } from '../../lib/api';
import { fmt } from '../../lib/format';
import type { Mission } from '../../lib/types';
import { CategorySelect, FormActions, PenaltyRulesPicker, useForm, WeightsEditor } from '../../components/forms';
import { Modal } from '../../components/ui/Modal';
import { Button, Checkbox, Input, Select, Textarea } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';
import { Icon } from '../../components/ui/Icon';

export function useGameConfig() {
  return useQuery({ queryKey: ['config'], queryFn: () => api.get<{ active: { version: number; config: GameConfig } }>('/api/config'), staleTime: 60_000 });
}

export const emptyMission = (today: string): MissionInput => ({
  title: '',
  description: '',
  type: 'one_time',
  difficulty: 'moderate',
  categoryId: null,
  goalId: null,
  seasonId: null,
  parentId: null,
  startDate: today,
  dueDate: null,
  completionMode: 'manual',
  rewardXpOverride: null,
  rewardCoinsOverride: null,
  isSecret: false,
  evidenceRequired: false,
  priority: 0,
  attributeWeights: {},
  objectives: [],
  penaltyRuleIds: [],
});

export function missionToInput(m: Mission & { penaltyRuleIds?: string[] }): MissionInput {
  return {
    title: m.title,
    description: m.description,
    type: m.type,
    difficulty: m.difficulty,
    categoryId: m.categoryId,
    goalId: m.goalId,
    seasonId: m.seasonId,
    parentId: m.parentId,
    startDate: m.startDate,
    dueDate: m.dueDate,
    completionMode: m.completionMode,
    rewardXpOverride: m.rewardXpOverride,
    rewardCoinsOverride: m.rewardCoinsOverride,
    isSecret: m.isSecret,
    evidenceRequired: m.evidenceRequired,
    priority: m.priority,
    attributeWeights: m.attributeWeights,
    objectives: m.objectives.map((o) => ({
      id: o.id,
      title: o.title,
      metric: o.metric as MissionInput['objectives'][number]['metric'],
      metricRefId: o.metricRefId,
      target: Number(o.target),
      current: Number(o.current),
      unit: o.unit,
      optional: o.optional,
    })),
    penaltyRuleIds: m.penaltyRuleIds ?? [],
  };
}

/** Formulário de missão: validação local (mesmo esquema da API) + regras de dificuldade do motor. */
export function MissionForm({
  open,
  onClose,
  initial,
  missionId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  initial: MissionInput;
  missionId?: string;
  title: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const form = useForm(missionInput, initial);
  const cfg = useGameConfig().data?.active.config;
  const v = form.values;
  const save = useMutation({
    mutationFn: (data: MissionInput) => (missionId ? api.put<Mission>(`/api/missions/${missionId}`, data) : api.post<Mission>('/api/missions', data)),
    onSuccess: () => {
      toast.success(missionId ? 'Missão atualizada' : 'Missão criada');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => {
      form.applyServerError(e);
      toast.error(e);
    },
  });
  const objectives = v.objectives ?? [];
  const diffErrors = cfg
    ? validateDifficulty(
        {
          type: v.type,
          difficulty: v.difficulty,
          startDate: v.startDate ?? null,
          dueDate: v.dueDate ?? null,
          objectiveCount: objectives.filter((o) => !o.optional).length,
        },
        cfg,
      )
    : [];
  const table = cfg?.difficulty[v.difficulty];
  const setObjective = (i: number, patch: Partial<(typeof objectives)[number]>) =>
    form.set(
      'objectives',
      objectives.map((o, j) => (j === i ? { ...o, ...patch } : o)),
    );

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const data = form.validate();
          if (data) save.mutate(data);
        }}
      >
        <Input label="Nome" value={v.title} onChange={(e) => form.set('title', e.target.value)} error={form.errors.title} autoFocus />
        <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Tipo"
            value={v.type}
            onChange={(e) => form.set('type', e.target.value as MissionInput['type'])}
            options={MISSION_TYPES.map((t) => ({ value: t, label: MISSION_TYPE_LABELS[t] }))}
          />
          <Select
            label="Dificuldade"
            value={v.difficulty}
            onChange={(e) => form.set('difficulty', e.target.value as MissionInput['difficulty'])}
            options={DIFFICULTIES.map((d) => ({ value: d, label: `${DIFFICULTY_LABELS[d]}${cfg ? ` — ${cfg.difficulty[d].xp} XP` : ''}` }))}
          />
          <CategorySelect value={v.categoryId} onChange={(c) => form.set('categoryId', c)} />
        </div>
        {diffErrors.length > 0 ? (
          <ul className="space-y-1 rounded-[var(--radius-sm)] border border-warning/50 p-2 text-sm text-warning" role="alert">
            {diffErrors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        ) : (
          table && (
            <p className="text-sm text-muted">
              Recompensa base: <span className="num text-accent">{fmt(v.rewardXpOverride ?? table.xp)} XP</span> ·{' '}
              <span className="num" style={{ color: 'var(--coin)' }}>
                {fmt(v.rewardCoinsOverride ?? table.coins)} moedas
              </span>{' '}
              (antes de multiplicadores e limites diários).
            </p>
          )
        )}
        <GoalSelect value={v.goalId} onChange={(g) => form.set('goalId', g)} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Início"
            type="date"
            value={v.startDate ?? ''}
            onChange={(e) => form.set('startDate', e.target.value || null)}
            error={form.errors.startDate}
          />
          <Input
            label="Prazo"
            type="date"
            value={v.dueDate ?? ''}
            onChange={(e) => form.set('dueDate', e.target.value || null)}
            error={form.errors.dueDate}
            hint="Opcional. Após o prazo, a missão expira."
          />
          <Select
            label="Prioridade"
            value={String(v.priority ?? 0)}
            onChange={(e) => form.set('priority', Number(e.target.value))}
            options={[0, 1, 2, 3, 4, 5].map((p) => ({ value: String(p), label: p === 0 ? 'Normal' : `${'★'.repeat(p)}` }))}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="field-label">Objetivos (missão composta)</legend>
          {objectives.length === 0 && <p className="text-sm text-faint">Sem objetivos: a missão é concluída manualmente com um clique.</p>}
          {objectives.map((o, i) => (
            <div key={o.id ?? i} className="grid gap-2 rounded-[var(--radius-sm)] border border-line p-2 sm:grid-cols-[1fr_12rem_6rem_5rem_auto] sm:items-end">
              <Input
                label="Objetivo"
                value={o.title}
                onChange={(e) => setObjective(i, { title: e.target.value })}
                error={form.errors[`objectives.${i}.title`]}
              />
              <Select
                label="Medido por"
                value={o.metric ?? 'manual'}
                onChange={(e) => setObjective(i, { metric: e.target.value as (typeof OBJECTIVE_METRIC_VALUES)[number] })}
                options={OBJECTIVE_METRIC_VALUES.map((m) => ({ value: m, label: OBJECTIVE_METRIC_LABELS[m] }))}
              />
              <Input
                label="Meta"
                type="number"
                min={1}
                value={o.target ?? ''}
                onChange={(e) => setObjective(i, { target: Number(e.target.value) })}
                error={form.errors[`objectives.${i}.target`]}
              />
              <Input label="Unidade" value={o.unit ?? ''} onChange={(e) => setObjective(i, { unit: e.target.value || null })} />
              <div className="flex items-center gap-2 pb-1">
                <Checkbox label="Opcional" checked={o.optional ?? false} onChange={(c) => setObjective(i, { optional: c })} />
                <Button
                  variant="ghost"
                  icon="trash"
                  aria-label="Remover objetivo"
                  onClick={() =>
                    form.set(
                      'objectives',
                      objectives.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" icon="plus" onClick={() => form.set('objectives', [...objectives, { title: '', metric: 'manual', target: 1, optional: false }])}>
              Adicionar objetivo
            </Button>
            {objectives.length > 0 && (
              <Checkbox
                label="Concluir automaticamente quando todos os objetivos obrigatórios forem atingidos"
                checked={v.completionMode === 'auto'}
                onChange={(c) => form.set('completionMode', c ? 'auto' : 'manual')}
              />
            )}
          </div>
          <p className="text-xs text-faint">
            <Icon name="info" size={12} className="mr-1 inline" />
            Objetivos automáticos (estudo, treino, hábitos) são calculados a partir dos seus registros no período da missão.
          </p>
        </fieldset>

        <WeightsEditor value={v.attributeWeights ?? {}} onChange={(w) => form.set('attributeWeights', w)} />
        <PenaltyRulesPicker value={v.penaltyRuleIds ?? []} onChange={(ids) => form.set('penaltyRuleIds', ids)} />

        <details className="rounded-[var(--radius-sm)] border border-line p-3">
          <summary className="cursor-pointer text-sm text-muted">Opções avançadas</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="XP personalizado (máx. 2× a tabela)"
              type="number"
              min={0}
              value={v.rewardXpOverride ?? ''}
              onChange={(e) => form.set('rewardXpOverride', e.target.value === '' ? null : Number(e.target.value))}
            />
            <Input
              label="Moedas personalizadas (máx. 2× a tabela)"
              type="number"
              min={0}
              value={v.rewardCoinsOverride ?? ''}
              onChange={(e) => form.set('rewardCoinsOverride', e.target.value === '' ? null : Number(e.target.value))}
            />
            <Checkbox label="Exigir evidência para concluir" checked={v.evidenceRequired ?? false} onChange={(c) => form.set('evidenceRequired', c)} />
            <Checkbox label="Missão secreta (oculta até a conclusão)" checked={v.isSecret ?? false} onChange={(c) => form.set('isSecret', c)} />
          </div>
        </details>

        <FormActions onCancel={onClose} loading={save.isPending} submitLabel={missionId ? 'Salvar alterações' : 'Criar missão'} />
      </form>
    </Modal>
  );
}

function GoalSelect({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) {
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api.get<Array<{ id: string; title: string; status: string }>>('/api/goals') });
  const options = (goals.data ?? []).filter((g) => g.status === 'active' || g.id === value).map((g) => ({ value: g.id, label: g.title }));
  if (options.length === 0) return null;
  return (
    <Select
      label="Meta vinculada (opcional)"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder="Nenhuma"
      options={options}
      hint="Metas medidas por missões contam a conclusão desta missão."
    />
  );
}
