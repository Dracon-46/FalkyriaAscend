import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { achievementInput } from '@rpg/contracts';
import { ACHIEVEMENT_METRICS, ACHIEVEMENT_METRIC_LABELS, RARITIES, RARITY_LABELS, type AchievementMetric } from '@rpg/engine';
import type { z } from 'zod';
import { api } from '../../lib/api';
import { fmt, fmt1, fmtDateTime } from '../../lib/format';
import type { AchievementView, Item } from '../../lib/types';
import { FormActions, useForm } from '../../components/forms';
import { RarityBadge, rarityColor } from '../../components/ui/domain';
import { Icon, ICON_NAMES } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import {
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  Loading,
  PageHeader,
  Panel,
  ProgressBar,
  Segmented,
  Select,
  Tabs,
  Textarea,
  cx,
} from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type AchInput = z.input<typeof achievementInput>;
interface Definition extends AchInput {
  id: string;
  archivedAt: string | null;
}

export function AchievementsPage() {
  const [tab, setTab] = useState<'colecao' | 'gerenciar'>('colecao');
  return (
    <>
      <PageHeader
        title="Conquistas"
        icon="trophy"
        subtitle="Avaliadas pelo motor central a partir dos seus registros. Recompensas são concedidas uma única vez."
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'colecao', label: 'Coleção', icon: 'trophy' },
          { value: 'gerenciar', label: 'Gerenciar definições', icon: 'settings' },
        ]}
      />
      {tab === 'colecao' ? <Collection /> : <Definitions />}
    </>
  );
}

function Collection() {
  const q = useQuery({ queryKey: ['achievements'], queryFn: () => api.get<AchievementView[]>('/api/achievements') });
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const all = q.data!;
  const unlocked = all.filter((a) => a.unlockedAt).length;
  const list = all.filter((a) => (filter === 'all' ? true : filter === 'unlocked' ? a.unlockedAt : !a.unlockedAt));
  const categories = [...new Set(list.map((a) => a.category))];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <p className="text-sm text-muted">
            <span className="num text-accent">{unlocked}</span> de {all.length} desbloqueadas
          </p>
          <ProgressBar value={unlocked / Math.max(1, all.length)} className="mt-1 max-w-sm" label="Conquistas desbloqueadas" />
        </div>
        <Segmented
          label="Filtrar"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'unlocked', label: 'Desbloqueadas' },
            { value: 'locked', label: 'Bloqueadas' },
          ]}
        />
      </div>
      {categories.length === 0 && (
        <Panel>
          <EmptyState icon="trophy" title="Nada neste filtro" />
        </Panel>
      )}
      {categories.map((cat) => (
        <section key={cat} className="mb-6">
          <h2 className="panel-title">{cat}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list
              .filter((a) => a.category === cat)
              .map((a) => (
                <article
                  key={a.id}
                  className={cx('panel flex gap-3', !a.unlockedAt && 'opacity-80')}
                  style={a.unlockedAt ? { borderColor: `color-mix(in srgb, ${rarityColor(a.rarity)} 55%, transparent)` } : undefined}
                >
                  <span
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full border"
                    style={{
                      color: a.unlockedAt ? rarityColor(a.rarity) : 'var(--text-faint)',
                      borderColor: a.unlockedAt ? rarityColor(a.rarity) : 'var(--border)',
                      boxShadow: a.unlockedAt ? 'var(--glow)' : undefined,
                    }}
                  >
                    <Icon name={a.icon} size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display">{a.name}</p>
                      <RarityBadge value={a.rarity} />
                    </div>
                    <p className="text-sm text-muted">{a.description}</p>
                    {a.unlockedAt ? (
                      <p className="mt-1 text-xs text-success">
                        <Icon name="check" size={12} className="mr-1 inline" />
                        Desbloqueada em {fmtDateTime(a.unlockedAt)}
                      </p>
                    ) : (
                      !a.hidden && (
                        <div className="mt-2 space-y-1">
                          {a.conditions.map((c) => (
                            <div key={c.metric}>
                              <div className="flex justify-between text-xs text-faint">
                                <span>{ACHIEVEMENT_METRIC_LABELS[c.metric as AchievementMetric] ?? c.metric}</span>
                                <span className="num">
                                  {fmt1(c.current)} / {fmt1(c.target)}
                                </span>
                              </div>
                              <ProgressBar value={c.current / c.target} className="!h-1.5" label={c.metric} />
                            </div>
                          ))}
                        </div>
                      )
                    )}
                    {(a.rewardXp > 0 || a.rewardCoins > 0) && !a.hidden && (
                      <p className="mt-1 text-xs text-faint">
                        Recompensa: {a.rewardXp > 0 && `${fmt(a.rewardXp)} XP`} {a.rewardCoins > 0 && `· ${fmt(a.rewardCoins)} moedas`}
                      </p>
                    )}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

function Definitions() {
  const q = useQuery({ queryKey: ['achievement-defs'], queryFn: () => api.get<Definition[]>('/api/achievement-definitions?includeArchived=true') });
  const items = useQuery({ queryKey: ['items'], queryFn: () => api.get<Item[]>('/api/items') });
  const [editing, setEditing] = useState<Definition | 'new' | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const archive = useMutation({
    mutationFn: (d: Definition) => api.post(`/api/achievement-definitions/${d.id}/${d.archivedAt ? 'unarchive' : 'archive'}`),
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e) => toast.error(e),
  });
  if (q.isLoading) return <Loading />;
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button icon="plus" onClick={() => setEditing('new')}>
          Nova conquista
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Conquista</th>
              <th>Critérios</th>
              <th>Raridade</th>
              <th>Recompensa</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data!.map((d) => (
              <tr key={d.id} className={d.archivedAt ? 'opacity-50' : ''}>
                <td>
                  <span className="inline-flex items-center gap-2">
                    <Icon name={d.icon ?? 'trophy'} size={16} />
                    {d.name}
                  </span>
                  <p className="font-mono text-xs text-faint">
                    {d.key}
                    {d.secret ? ' · secreta' : ''}
                  </p>
                </td>
                <td className="text-xs">{d.criteria.all.map((c) => `${ACHIEVEMENT_METRIC_LABELS[c.metric]} ≥ ${c.gte}`).join(' e ')}</td>
                <td>
                  <RarityBadge value={d.rarity ?? 'common'} />
                </td>
                <td className="num text-xs">
                  {d.rewardXp ?? 0} XP · {d.rewardCoins ?? 0} moedas
                </td>
                <td className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" icon="pencil" aria-label="Editar" onClick={() => setEditing(d)} />
                  <Button size="sm" variant="ghost" icon="archive" aria-label={d.archivedAt ? 'Desarquivar' : 'Arquivar'} onClick={() => archive.mutate(d)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <DefinitionForm def={editing === 'new' ? null : editing} items={items.data ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

function DefinitionForm({ def, items, onClose }: { def: Definition | null; items: Item[]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const form = useForm(
    achievementInput,
    def ?? {
      key: '',
      name: '',
      description: '',
      category: 'Consistência',
      icon: 'trophy',
      rarity: 'common',
      criteria: { all: [{ metric: 'missions_completed', gte: 10 }] },
      secret: false,
      rewardXp: 50,
      rewardCoins: 20,
      rewardItemId: null,
      sortOrder: 0,
    },
  );
  const v = form.values;
  const save = useMutation({
    mutationFn: (d: unknown) => (def ? api.put(`/api/achievement-definitions/${def.id}`, d) : api.post('/api/achievement-definitions', d)),
    onSuccess: () => {
      toast.success('Conquista salva; será avaliada na próxima ação');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const conds = v.criteria.all;
  const setCond = (i: number, patch: Partial<(typeof conds)[number]>) => form.set('criteria', { all: conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <Modal open onClose={onClose} title={def ? 'Editar conquista' : 'Nova conquista'} size="lg">
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const d = form.validate();
          if (d) save.mutate(d);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Chave"
            value={v.key}
            disabled={Boolean(def)}
            onChange={(e) => form.set('key', e.target.value)}
            error={form.errors.key}
            hint="Imutável. Ex.: leitura_50"
          />
          <Input className="sm:col-span-2" label="Nome" value={v.name} onChange={(e) => form.set('name', e.target.value)} error={form.errors.name} />
        </div>
        <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="Categoria" value={v.category ?? ''} onChange={(e) => form.set('category', e.target.value)} />
          <Select
            label="Ícone"
            value={v.icon ?? 'trophy'}
            onChange={(e) => form.set('icon', e.target.value)}
            options={ICON_NAMES.map((n) => ({ value: n, label: n }))}
          />
          <Select
            label="Raridade"
            value={v.rarity ?? 'common'}
            onChange={(e) => form.set('rarity', e.target.value as AchInput['rarity'])}
            options={RARITIES.map((r) => ({ value: r, label: RARITY_LABELS[r] }))}
          />
          <div className="flex items-end pb-2">
            <Checkbox label="Secreta" checked={v.secret ?? false} onChange={(c) => form.set('secret', c)} />
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="field-label">Critérios (todos precisam ser atendidos)</legend>
          {conds.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
              <Select
                label="Métrica"
                value={c.metric}
                onChange={(e) => setCond(i, { metric: e.target.value as AchievementMetric })}
                options={ACHIEVEMENT_METRICS.map((m) => ({ value: m, label: ACHIEVEMENT_METRIC_LABELS[m] }))}
              />
              <Input label="Mínimo" type="number" min={0} step="any" value={c.gte} onChange={(e) => setCond(i, { gte: Number(e.target.value) })} />
              <Button
                variant="ghost"
                icon="trash"
                aria-label="Remover critério"
                disabled={conds.length === 1}
                onClick={() => form.set('criteria', { all: conds.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          {conds.length < 5 && (
            <Button size="sm" icon="plus" onClick={() => form.set('criteria', { all: [...conds, { metric: 'character_level', gte: 10 }] })}>
              Adicionar critério
            </Button>
          )}
          <p className="text-xs text-faint">Prefira critérios que valorizem consistência e dificuldade, não só quantidade bruta.</p>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="XP de recompensa" type="number" min={0} value={v.rewardXp ?? 0} onChange={(e) => form.set('rewardXp', Number(e.target.value))} />
          <Input
            label="Moedas de recompensa"
            type="number"
            min={0}
            value={v.rewardCoins ?? 0}
            onChange={(e) => form.set('rewardCoins', Number(e.target.value))}
          />
          <Select
            label="Item de recompensa"
            value={v.rewardItemId ?? ''}
            onChange={(e) => form.set('rewardItemId', e.target.value || null)}
            placeholder="Nenhum"
            options={items.map((i) => ({ value: i.id, label: i.name }))}
          />
        </div>
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}
