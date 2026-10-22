import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { itemInput } from '@rpg/contracts';
import { ITEM_KINDS, ITEM_KIND_LABELS, RARITIES, RARITY_LABELS, SINGLE_USE_KINDS, type ItemKind } from '@rpg/engine';
import type { z } from 'zod';
import { api } from '../../lib/api';
import { fmt, fmtDate, uid } from '../../lib/format';
import type { AfterAction, Item, ShopItem } from '../../lib/types';
import { FormActions, useForm } from '../../components/forms';
import { Coins, RarityBadge, rarityColor } from '../../components/ui/domain';
import { Icon, ICON_NAMES } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Badge, Button, Checkbox, EmptyState, ErrorState, Input, Loading, PageHeader, Panel, Select, Tabs, Textarea, cx } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type Tab = 'shop' | 'manage';

interface ShopResponse {
  balance: number;
  items: ShopItem[];
}

interface EconomyProjection {
  projection: { assumption: string; items: Array<{ id: string; name: string; price: number; days: number | null }> };
}

const CATEGORY_SUGGESTIONS = [
  'Lazer',
  'Recompensas pessoais',
  'Itens cosméticos',
  'Títulos',
  'Insígnias',
  'Molduras',
  'Temas',
  'Efeitos visuais',
  'Itens colecionáveis',
  'Recompensas especiais',
  'Desbloqueios de desafios',
];

/** Itens que podem ser comprados em mais de uma unidade por vez. */
const MULTI_QTY: readonly ItemKind[] = ['consumable', 'real_reward', 'collectible'];

export function ShopPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('aba') === 'gerenciar' ? 'manage' : 'shop');
  return (
    <>
      <PageHeader
        title="Loja"
        icon="shopping-bag"
        subtitle="Troque moedas por recompensas que você mesmo definiu. Necessidades básicas (descanso, alimentação, cuidados) nunca ficam presas atrás de moedas."
      />
      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          setParams(t === 'manage' ? { aba: 'gerenciar' } : {}, { replace: true });
        }}
        tabs={[
          { value: 'shop', label: 'Vitrine', icon: 'shopping-bag' },
          { value: 'manage', label: 'Gerenciar itens', icon: 'pencil' },
        ]}
      />
      {tab === 'shop' ? <ShopTab /> : <ManageTab />}
    </>
  );
}

// ------------------------------------------------------------------ Vitrine

function ShopTab() {
  const q = useQuery({ queryKey: ['shop'], queryFn: () => api.get<ShopResponse>('/api/shop') });
  const projection = useQuery({ queryKey: ['stats', 'economy', 30], queryFn: () => api.get<EconomyProjection>('/api/stats/economy?days=30') });
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState('');
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [buying, setBuying] = useState<ShopItem | null>(null);

  const categories = useMemo(() => [...new Set((q.data?.items ?? []).map((i) => i.category))].sort(), [q.data]);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { balance, items } = q.data;
  const filtered = items.filter((i) => (!category || i.category === category) && (!kind || i.kind === kind) && (!onlyAffordable || (i.price ?? 0) <= balance));
  const daysFor = (id: string) => projection.data?.projection.items.find((p) => p.id === id)?.days;

  return (
    <>
      <div className="panel mb-4 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs text-faint uppercase" style={{ letterSpacing: '0.08em' }}>
            Saldo disponível
          </p>
          <Coins value={balance} className="text-2xl" />
        </div>
        {projection.data && (
          <p className="max-w-xl flex-1 text-xs text-faint">Estimativas de prazo: {projection.data.projection.assumption} Não são promessas.</p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por categoria">
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => setCategory('')}
            className={cx('badge !py-1 text-[0.8rem]', !category && '!border-accent !text-accent')}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(category === c ? '' : c)}
              className={cx('badge !py-1 text-[0.8rem]', category === c && '!border-accent !text-accent')}
            >
              {c}
            </button>
          ))}
        </div>
        <Select
          className="!w-52"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          placeholder="Todos os tipos"
          aria-label="Filtrar por tipo"
          options={ITEM_KINDS.map((k) => ({ value: k, label: ITEM_KIND_LABELS[k] }))}
        />
        <Checkbox label="Somente o que posso comprar" checked={onlyAffordable} onChange={setOnlyAffordable} />
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState icon="shopping-bag" title={items.length === 0 ? 'A loja está vazia' : 'Nenhum item neste filtro'}>
            {items.length === 0 ? 'Cadastre recompensas em "Gerenciar itens".' : 'Ajuste os filtros acima.'}
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((i) => (
            <ShopCard key={i.id} item={i} balance={balance} days={daysFor(i.id)} onBuy={() => setBuying(i)} />
          ))}
        </div>
      )}
      {buying && (
        <PurchaseModal
          key={buying.id}
          item={buying}
          balance={balance}
          days={daysFor(buying.id)}
          assumption={projection.data?.projection.assumption}
          onClose={() => setBuying(null)}
        />
      )}
    </>
  );
}

function Requirements({ item }: { item: Item }) {
  const reqs: string[] = [];
  if (item.minLevel) reqs.push(`Nível ${item.minLevel}+`);
  if (item.requiredAchievementId) reqs.push('Requer conquista');
  if (item.cooldownDays) reqs.push(`Recarga de ${item.cooldownDays} dia(s)`);
  if (item.purchaseLimit) reqs.push(`Limite: ${item.purchaseLimit}`);
  if (item.availableFrom) reqs.push(`Desde ${fmtDate(item.availableFrom.slice(0, 10))}`);
  if (item.availableUntil) reqs.push(`Até ${fmtDate(item.availableUntil.slice(0, 10))}`);
  if (reqs.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {reqs.map((r) => (
        <Badge key={r}>{r}</Badge>
      ))}
    </div>
  );
}

function ShopCard({ item, balance, days, onBuy }: { item: ShopItem; balance: number; days: number | null | undefined; onBuy: () => void }) {
  const a = item.availability;
  const price = item.price ?? 0;
  return (
    <article className="panel panel-hover flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)] border"
          style={{ borderColor: rarityColor(item.rarity), color: rarityColor(item.rarity) }}
        >
          <Icon name={item.icon} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[1.02rem]">{item.name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <RarityBadge value={item.rarity} />
            <Badge>{ITEM_KIND_LABELS[item.kind]}</Badge>
            <Badge>{item.category}</Badge>
          </div>
        </div>
      </div>
      {item.description && <p className="text-sm text-muted">{item.description}</p>}
      <Requirements item={item} />
      {a.owned > 0 && (
        <p className="text-xs text-success">
          Você possui {a.owned} {a.owned === 1 ? 'unidade' : 'unidades'}.
        </p>
      )}
      {!a.canBuy && a.blockers.length > 0 && (
        <ul className="space-y-0.5 text-xs text-warning">
          {a.blockers.map((b) => (
            <li key={b} className="flex gap-1">
              <Icon name="lock" size={12} className="mt-0.5 shrink-0" />
              {b}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
        <div>
          <Coins value={price} className="text-lg" />
          {price > balance && days !== undefined && (
            <p className="text-xs text-faint">{days === null ? 'Sem ritmo de ganho recente para estimar' : `≈ ${days} dia(s) no ritmo atual (estimativa)`}</p>
          )}
        </div>
        <Button variant="primary" size="sm" icon="shopping-bag" disabled={!a.canBuy} onClick={onBuy} title={a.canBuy ? undefined : a.blockers.join('; ')}>
          Comprar
        </Button>
      </div>
    </article>
  );
}

function PurchaseModal({
  item,
  balance,
  days,
  assumption,
  onClose,
}: {
  item: ShopItem;
  balance: number;
  days: number | null | undefined;
  assumption?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  // Uma chave por modal aberto: cliques duplos e novas tentativas nunca cobram duas vezes.
  const [key] = useState(() => `compra-${uid()}`);
  const [qty, setQty] = useState(1);
  const price = item.price ?? 0;
  const allowQty = MULTI_QTY.includes(item.kind);
  const total = price * qty;
  const after = balance - total;
  const buy = useMutation({
    mutationFn: () =>
      api.post<{ replayed: boolean; after: AfterAction | null }>('/api/shop/purchase', { itemId: item.id, quantity: qty }, { 'idempotency-key': key }),
    onSuccess: (body) => {
      if (body.replayed) toast.info('Esta compra já havia sido registrada: nenhuma cobrança duplicada.');
      else toast.success(`Compra realizada: ${item.name}`, `−${fmt(total)} moedas. O item está no seu inventário.`);
      toast.reward(null, body.after);
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e, 'Não foi possível concluir a compra'),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Confirmar compra"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon="check" loading={buy.isPending} disabled={after < 0} onClick={() => buy.mutate()}>
            Comprar por {fmt(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Icon name={item.icon} size={26} style={{ color: rarityColor(item.rarity) }} />
          <div>
            <p className="font-display">{item.name}</p>
            <p className="text-xs text-faint">
              {ITEM_KIND_LABELS[item.kind]} · {RARITY_LABELS[item.rarity]}
            </p>
          </div>
        </div>
        {allowQty && (
          <Input
            label="Quantidade"
            type="number"
            min={1}
            max={99}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))))}
            hint={SINGLE_USE_KINDS.includes(item.kind) ? 'Cada unidade é consumida ou resgatada separadamente no inventário.' : undefined}
          />
        )}
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-faint">Saldo atual</dt>
            <dd>
              <Coins value={balance} />
            </dd>
          </div>
          <div>
            <dt className="text-faint">Total</dt>
            <dd>
              <Coins value={total} />
            </dd>
          </div>
          <div>
            <dt className="text-faint">Saldo após</dt>
            <dd className={after < 0 ? 'text-danger' : ''}>
              <span className="num">{fmt(after)}</span>
            </dd>
          </div>
        </dl>
        {after < 0 && (
          <p className="text-sm text-danger" role="alert">
            Saldo insuficiente.
            {days !== undefined &&
              qty === 1 &&
              (days === null ? ' Ainda não há ritmo de ganho recente para estimar o prazo.' : ` Estimativa: cerca de ${days} dia(s) no ritmo atual.`)}
          </p>
        )}
        {assumption && after < 0 && <p className="text-xs text-faint">Premissa da estimativa: {assumption}</p>}
        <p className="text-xs text-faint">O preço pago fica registrado na compra; mudanças futuras de preço não alteram este histórico.</p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Gerenciamento

type ItemForm = z.input<typeof itemInput>;

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local (horário local) → ISO 8601 com deslocamento de fuso. */
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${v.length === 16 ? `${v}:00` : v}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

function ManageTab() {
  const q = useQuery({ queryKey: ['items', 'all'], queryFn: () => api.get<Item[]>('/api/items?includeArchived=true') });
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const archive = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.post(`/api/items/${id}/${on ? 'archive' : 'unarchive'}`),
    onSuccess: (_r, v) => {
      toast.success(v.on ? 'Item arquivado' : 'Item restaurado');
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const list = q.data.filter((i) => showArchived || !i.archivedAt);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm text-muted">
            Itens sem preço não aparecem na vitrine (ex.: títulos concedidos por conquistas e níveis). Itens com histórico são arquivados, não excluídos.
          </p>
          <Checkbox label="Mostrar arquivados" checked={showArchived} onChange={setShowArchived} />
        </div>
        <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
          Novo item
        </Button>
      </div>
      {list.length === 0 ? (
        <Panel>
          <EmptyState icon="gem" title="Nenhum item cadastrado" />
        </Panel>
      ) : (
        <div className="panel overflow-x-auto !p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Tipo</th>
                <th>Categoria</th>
                <th>Preço</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className={i.archivedAt ? 'opacity-60' : ''}>
                  <td>
                    <span className="flex items-center gap-2">
                      <Icon name={i.icon} size={16} style={{ color: rarityColor(i.rarity) }} />
                      {i.name}
                    </span>
                  </td>
                  <td>{ITEM_KIND_LABELS[i.kind]}</td>
                  <td className="text-muted">{i.category}</td>
                  <td>{i.price == null ? <span className="text-faint">não vendido</span> : <Coins value={i.price} />}</td>
                  <td>{i.archivedAt ? <Badge>Arquivado</Badge> : i.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="muted">Inativo</Badge>}</td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" icon="pencil" aria-label={`Editar ${i.name}`} onClick={() => setEditing(i)} />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={i.archivedAt ? 'undo' : 'archive'}
                      aria-label={i.archivedAt ? `Restaurar ${i.name}` : `Arquivar ${i.name}`}
                      onClick={async () => {
                        if (!i.archivedAt) {
                          const r = await confirm({
                            title: 'Arquivar item',
                            message: `"${i.name}" deixará de aparecer na loja. Compras e inventário existentes são preservados.`,
                            confirmLabel: 'Arquivar',
                          });
                          if (!r.ok) return;
                        }
                        archive.mutate({ id: i.id, on: !i.archivedAt });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ItemFormModal key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const emptyItem: ItemForm = {
  name: '',
  description: '',
  icon: 'gem',
  category: 'Recompensas pessoais',
  kind: 'real_reward',
  rarity: 'common',
  price: 100,
  active: true,
  availableFrom: null,
  availableUntil: null,
  minLevel: null,
  requiredAchievementId: null,
  purchaseLimit: null,
  cooldownDays: null,
  payload: {},
  sortOrder: 0,
};

const PAYLOAD_HINT: Partial<Record<ItemKind, string>> = {
  title: 'Ex.: {"title": "O Persistente"} — texto exibido no perfil.',
  frame: 'Ex.: {"color": "#c0c0c0"} — cor da moldura do avatar.',
  theme: 'Obrigatório: {"theme": "vampire"} (medieval, vampire, angel ou system).',
  effect: 'Ex.: {"effect": "aura-gold"}.',
  badge: 'Ex.: {"badge": "runner"}.',
};

function ItemFormModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const achievements = useQuery({
    queryKey: ['achievement-definitions'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/api/achievement-definitions'),
  });
  const form = useForm(
    itemInput,
    item
      ? {
          name: item.name,
          description: item.description,
          icon: item.icon,
          category: item.category,
          kind: item.kind,
          rarity: item.rarity,
          price: item.price,
          active: item.active,
          availableFrom: item.availableFrom,
          availableUntil: item.availableUntil,
          minLevel: item.minLevel,
          requiredAchievementId: item.requiredAchievementId,
          purchaseLimit: item.purchaseLimit,
          cooldownDays: item.cooldownDays,
          payload: item.payload,
          sortOrder: item.sortOrder,
        }
      : emptyItem,
  );
  const v = form.values;
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(v.payload ?? {}, null, 2));
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (data: unknown) => (item ? api.put(`/api/items/${item.id}`, data) : api.post('/api/items', data)),
    onSuccess: () => {
      toast.success(item ? 'Item atualizado' : 'Item criado');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => {
      form.applyServerError(e);
      toast.error(e);
    },
  });
  const numOrNull = (s: string) => (s === '' ? null : Math.floor(Number(s)));

  return (
    <Modal open onClose={onClose} title={item ? `Editar: ${item.name}` : 'Novo item'} size="lg">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          let payload: unknown;
          try {
            payload = JSON.parse(payloadText || '{}');
          } catch {
            setPayloadError('JSON inválido');
            return;
          }
          if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
            setPayloadError('O payload deve ser um objeto JSON, ex.: {"title": "..."}');
            return;
          }
          setPayloadError(null);
          form.setValues((cur) => ({ ...cur, payload: payload as Record<string, unknown> }));
          const r = itemInput.safeParse({ ...v, payload });
          if (!r.success) {
            form.validate();
            return;
          }
          save.mutate(r.data);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Input label="Nome" value={v.name} onChange={(e) => form.set('name', e.target.value)} error={form.errors.name} autoFocus />
          <div>
            <Select
              label="Ícone"
              value={v.icon ?? 'gem'}
              onChange={(e) => form.set('icon', e.target.value)}
              options={ICON_NAMES.map((n) => ({ value: n, label: n }))}
            />
            <p className="mt-1 flex items-center gap-1 text-xs text-faint">
              Prévia: <Icon name={v.icon ?? 'gem'} size={16} className="text-accent" />
            </p>
          </div>
        </div>
        <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Input
              label="Categoria"
              list="item-categories"
              value={v.category ?? ''}
              onChange={(e) => form.set('category', e.target.value)}
              error={form.errors.category}
            />
            <datalist id="item-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <Select
            label="Tipo"
            value={v.kind}
            onChange={(e) => form.set('kind', e.target.value as ItemKind)}
            options={ITEM_KINDS.map((k) => ({ value: k, label: ITEM_KIND_LABELS[k] }))}
          />
          <Select
            label="Raridade"
            value={v.rarity ?? 'common'}
            onChange={(e) => form.set('rarity', e.target.value as ItemForm['rarity'])}
            options={RARITIES.map((r) => ({ value: r, label: RARITY_LABELS[r] }))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Input
            label="Preço (moedas)"
            type="number"
            min={0}
            value={v.price ?? ''}
            onChange={(e) => form.set('price', numOrNull(e.target.value))}
            error={form.errors.price}
            hint="Vazio = não vendido na loja."
          />
          <Input
            label="Nível mínimo"
            type="number"
            min={1}
            value={v.minLevel ?? ''}
            onChange={(e) => form.set('minLevel', numOrNull(e.target.value))}
            error={form.errors.minLevel}
          />
          <Input
            label="Limite de compras"
            type="number"
            min={1}
            value={v.purchaseLimit ?? ''}
            onChange={(e) => form.set('purchaseLimit', numOrNull(e.target.value))}
            error={form.errors.purchaseLimit}
          />
          <Input
            label="Recarga (dias)"
            type="number"
            min={1}
            value={v.cooldownDays ?? ''}
            onChange={(e) => form.set('cooldownDays', numOrNull(e.target.value))}
            error={form.errors.cooldownDays}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Disponível a partir de"
            type="datetime-local"
            value={toLocalInput(v.availableFrom)}
            onChange={(e) => form.set('availableFrom', fromLocalInput(e.target.value))}
            error={form.errors.availableFrom}
          />
          <Input
            label="Disponível até"
            type="datetime-local"
            value={toLocalInput(v.availableUntil)}
            onChange={(e) => form.set('availableUntil', fromLocalInput(e.target.value))}
            error={form.errors.availableUntil}
          />
          <Select
            label="Conquista exigida"
            value={v.requiredAchievementId ?? ''}
            onChange={(e) => form.set('requiredAchievementId', e.target.value || null)}
            placeholder="Nenhuma"
            options={(achievements.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
          />
        </div>
        <Textarea
          label="Dados do tipo (JSON)"
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
          rows={3}
          className="font-mono text-sm"
          error={payloadError ?? form.errors.payload}
          hint={PAYLOAD_HINT[v.kind] ?? 'Opcional. Objeto JSON com dados específicos do item.'}
        />
        <Checkbox label="Ativo (visível na loja quando tiver preço)" checked={v.active ?? true} onChange={(c) => form.set('active', c)} />
        {item && <p className="text-xs text-faint">Alterar o preço não altera compras anteriores: o valor pago fica gravado em cada compra.</p>}
        <FormActions onCancel={onClose} loading={save.isPending} submitLabel={item ? 'Salvar alterações' : 'Criar item'} />
      </form>
    </Modal>
  );
}
