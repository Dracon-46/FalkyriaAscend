import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { seasonInput } from '@rpg/contracts';
import { XP_SOURCE_LABELS, type XpSource } from '@rpg/engine';
import type { z } from 'zod';
import { api } from '../../lib/api';
import { fmt, fmtDate } from '../../lib/format';
import type { Item, Season, SeasonReward, SeasonStats } from '../../lib/types';
import { useSession } from '../../app/session';
import { DonutChart } from '../../components/charts/Charts';
import { FormActions, useForm } from '../../components/forms';
import { Icon } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Badge, Button, EmptyState, ErrorState, Input, Loading, PageHeader, Panel, ProgressBar, Select, Stat, Textarea } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type SeasonView = Season & { stats: SeasonStats | null; rewards: SeasonReward[] };
type SeasonInput = z.input<typeof seasonInput>;

export function SeasonsPage() {
  const me = useSession();
  const q = useQuery({ queryKey: ['seasons'], queryFn: () => api.get<SeasonView[]>('/api/seasons') });
  const [editing, setEditing] = useState<SeasonView | 'new' | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const active = q.data!.filter((s) => s.status === 'active');
  const planned = q.data!.filter((s) => s.status === 'planned');
  const closed = q.data!.filter((s) => s.status === 'closed');
  return (
    <>
      <PageHeader
        title="Temporadas"
        icon="hourglass"
        subtitle="Ciclos com tema, objetivos e recompensas próprias. O XP sazonal é uma visão do período; encerrar uma temporada nunca apaga XP vitalício, moedas, conquistas ou histórico."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            Nova temporada
          </Button>
        }
      />
      {active.length === 0 && (
        <Panel className="mb-4">
          <EmptyState icon="hourglass" title="Nenhuma temporada ativa" action={<Button onClick={() => setEditing('new')}>Criar temporada</Button>}>
            Temporadas mensais ou trimestrais ajudam a renovar objetivos.
          </EmptyState>
        </Panel>
      )}
      {active.map((s) => (
        <ActiveSeason key={s.id} s={s} today={me.today} onEdit={() => setEditing(s)} />
      ))}
      {planned.length > 0 && (
        <section className="mt-6">
          <h2 className="panel-title">Planejadas</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {planned.map((s) => (
              <div key={s.id} className="panel">
                <p className="font-display">{s.name}</p>
                <p className="text-sm text-faint">
                  {fmtDate(s.startDate)} — {fmtDate(s.endDate)}
                </p>
                <p className="mt-1 text-sm text-muted">{s.description}</p>
                <Button size="sm" variant="ghost" icon="pencil" className="mt-2" onClick={() => setEditing(s)}>
                  Editar
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {closed.length > 0 && (
        <section className="mt-6">
          <h2 className="panel-title">Encerradas</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {closed.map((s) => (
              <div key={s.id} className="panel">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display">{s.name}</p>
                  <Badge>Encerrada</Badge>
                </div>
                <p className="text-sm text-faint">
                  {fmtDate(s.startDate)} — {fmtDate(s.endDate)}
                </p>
                {s.summary && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Stat label="XP" value={fmt(s.summary.seasonXp)} />
                    <Stat label="Missões" value={fmt(s.summary.missionsCompleted)} />
                    <Stat label="Hábitos" value={fmt(s.summary.habitsDone)} />
                  </div>
                )}
                <p className="mt-2 text-xs text-faint">
                  {s.rewards.filter((r) => r.claimedAt).length} de {s.rewards.length} recompensas sazonais obtidas
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      {editing && <SeasonForm season={editing === 'new' ? null : editing} today={me.today} onClose={() => setEditing(null)} />}
    </>
  );
}

function ActiveSeason({ s, today, onEdit }: { s: SeasonView; today: string; onEdit: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const close = useMutation({
    mutationFn: () => api.post(`/api/seasons/${s.id}/close`),
    onSuccess: () => {
      toast.success('Temporada encerrada. Seu progresso vitalício permanece intacto.');
      toast.reward(null, null);
    },
    onError: (e) => toast.error(e),
  });
  const stats = s.stats;
  const total = Math.max(1, Math.round((Date.parse(s.endDate) - Date.parse(s.startDate)) / 86_400_000) + 1);
  const elapsed = Math.min(total, Math.max(0, Math.round((Date.parse(today) - Date.parse(s.startDate)) / 86_400_000) + 1));
  return (
    <Panel title="Temporada atual" icon="hourglass">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <h2 className="text-2xl">{s.name}</h2>
          <p className="text-sm text-faint">
            {fmtDate(s.startDate)} — {fmtDate(s.endDate)} · dia {elapsed} de {total}
          </p>
          {s.description && <p className="mt-2 text-muted">{s.description}</p>}
          <ProgressBar value={elapsed / total} className="mt-3" label="Tempo da temporada" />
          {stats && (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="XP sazonal" value={fmt(stats.seasonXp)} />
              <Stat label="Moedas" value={fmt(stats.seasonCoins)} />
              <Stat label="Missões" value={fmt(stats.missionsCompleted)} />
              <Stat label="Hábitos" value={fmt(stats.habitsDone)} />
            </div>
          )}
          <h3 className="panel-title mt-5">Recompensas sazonais</h3>
          {s.rewards.length === 0 ? (
            <p className="text-sm text-muted">Sem recompensas definidas. Edite a temporada para adicionar marcos de XP sazonal.</p>
          ) : (
            <ul className="space-y-2">
              {s.rewards.map((r) => (
                <li key={r.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className={r.claimedAt ? 'text-success' : ''}>
                      {r.claimedAt && <Icon name="check" size={13} className="mr-1 inline" />}
                      {r.title}
                    </span>
                    <span className="num text-faint">
                      {fmt(r.thresholdXp)} XP{r.coins > 0 && ` · +${fmt(r.coins)} moedas`}
                      {r.itemId && ' · item'}
                    </span>
                  </div>
                  <ProgressBar value={(stats?.seasonXp ?? 0) / r.thresholdXp} className="mt-1 !h-1.5" label={r.title} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="ghost" icon="pencil" onClick={onEdit}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon="flag"
              loading={close.isPending}
              onClick={async () => {
                const c = await confirm({
                  title: 'Encerrar temporada',
                  message: 'A temporada termina ontem e o resumo final é gravado. Nada do progresso vitalício é perdido.',
                  confirmLabel: 'Encerrar',
                });
                if (c.ok) close.mutate();
              }}
            >
              Encerrar agora
            </Button>
          </div>
        </div>
        <div>
          <p className="field-label">XP sazonal por origem</p>
          <DonutChart data={(stats?.bySource ?? []).map((b) => ({ label: XP_SOURCE_LABELS[b.source as XpSource] ?? b.source, value: b.xp }))} height={200} />
        </div>
      </div>
    </Panel>
  );
}

function SeasonForm({ season, today, onClose }: { season: SeasonView | null; today: string; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const items = useQuery({ queryKey: ['items'], queryFn: () => api.get<Item[]>('/api/items') });
  const plusDays = (n: number) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);
  const initial: SeasonInput = season
    ? {
        name: season.name,
        description: season.description,
        theme: season.theme,
        startDate: season.startDate,
        endDate: season.endDate,
        rewards: season.rewards.map((r) => ({ id: r.id, title: r.title, thresholdXp: r.thresholdXp, coins: r.coins, itemId: r.itemId })),
      }
    : {
        name: '',
        description: '',
        theme: null,
        startDate: today,
        endDate: plusDays(89),
        rewards: [{ title: 'Bronze', thresholdXp: 2000, coins: 100, itemId: null }],
      };
  const form = useForm(seasonInput, initial);
  const v = form.values;
  const save = useMutation({
    mutationFn: (d: unknown) => (season ? api.put(`/api/seasons/${season.id}`, d) : api.post('/api/seasons', d)),
    onSuccess: () => {
      toast.success('Temporada salva');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const rewards = v.rewards ?? [];
  const claimed = new Set(season?.rewards.filter((r) => r.claimedAt).map((r) => r.id) ?? []);
  const setR = (i: number, patch: Partial<(typeof rewards)[number]>) =>
    form.set(
      'rewards',
      rewards.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );
  return (
    <Modal open onClose={onClose} title={season ? 'Editar temporada' : 'Nova temporada'} size="lg">
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const d = form.validate();
          if (d) save.mutate(d);
        }}
      >
        <Input label="Nome" value={v.name} onChange={(e) => form.set('name', e.target.value)} error={form.errors.name} />
        <Textarea label="Descrição e objetivos" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={3} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Início" type="date" value={v.startDate} onChange={(e) => form.set('startDate', e.target.value)} error={form.errors.startDate} />
          <Input label="Fim" type="date" value={v.endDate} onChange={(e) => form.set('endDate', e.target.value)} error={form.errors.endDate} />
          <Select
            label="Duração rápida"
            value=""
            onChange={(e) =>
              e.target.value && form.set('endDate', new Date(Date.parse(v.startDate) + (Number(e.target.value) - 1) * 86_400_000).toISOString().slice(0, 10))
            }
            placeholder="Personalizada"
            options={[
              { value: '30', label: 'Mensal (30 dias)' },
              { value: '90', label: 'Trimestral (90 dias)' },
              { value: '182', label: 'Semestral' },
            ]}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="field-label">Recompensas por XP sazonal</legend>
          {rewards.map((r, i) => {
            const locked = r.id ? claimed.has(r.id) : false;
            return (
              <div key={r.id ?? i} className="grid gap-2 sm:grid-cols-[1fr_7rem_6rem_10rem_auto] sm:items-end">
                <Input label="Título" value={r.title} disabled={locked} onChange={(e) => setR(i, { title: e.target.value })} />
                <Input
                  label="XP sazonal"
                  type="number"
                  min={1}
                  disabled={locked}
                  value={r.thresholdXp}
                  onChange={(e) => setR(i, { thresholdXp: Number(e.target.value) })}
                />
                <Input
                  label="Moedas"
                  type="number"
                  min={0}
                  disabled={locked}
                  value={r.coins ?? 0}
                  onChange={(e) => setR(i, { coins: Number(e.target.value) })}
                />
                <Select
                  label="Item"
                  disabled={locked}
                  value={r.itemId ?? ''}
                  onChange={(e) => setR(i, { itemId: e.target.value || null })}
                  placeholder="Nenhum"
                  options={(items.data ?? []).map((it) => ({ value: it.id, label: it.name }))}
                />
                <Button
                  variant="ghost"
                  icon="trash"
                  aria-label="Remover"
                  disabled={locked}
                  onClick={() =>
                    form.set(
                      'rewards',
                      rewards.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
            );
          })}
          <Button size="sm" icon="plus" onClick={() => form.set('rewards', [...rewards, { title: '', thresholdXp: 5000, coins: 200, itemId: null }])}>
            Adicionar recompensa
          </Button>
          {claimed.size > 0 && <p className="text-xs text-faint">Recompensas já obtidas não podem ser alteradas.</p>}
        </fieldset>
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}
