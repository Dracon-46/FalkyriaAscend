import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { EQUIPPABLE_KINDS, ITEM_KIND_LABELS, SINGLE_USE_KINDS } from '@rpg/engine';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { InventoryEntry } from '../../lib/types';
import { Coins, RarityBadge, rarityColor } from '../../components/ui/domain';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import { Badge, Button, EmptyState, ErrorState, Loading, PageHeader, Panel, Tabs, Textarea } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type Tab = 'all' | 'equipped' | 'permanent' | 'single' | 'titles' | 'used';

interface PurchaseRow {
  id: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: 'completed' | 'refunded';
  itemSnapshot: { name: string; kind: string; category: string };
  createdAt: string;
  refundedAt: string | null;
  refundReason: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  purchase: 'Compra na loja',
  achievement: 'Conquista',
  level: 'Marco de nível',
  season: 'Temporada',
  streak: 'Sequência',
  admin: 'Concedido pelo administrador',
};

const STATE_LABELS: Record<InventoryEntry['state'], { label: string; tone: 'success' | 'accent' | 'muted' | 'info' | 'danger' }> = {
  owned: { label: 'Possuído', tone: 'info' },
  equipped: { label: 'Equipado', tone: 'accent' },
  consumed: { label: 'Consumido', tone: 'muted' },
  redeemed: { label: 'Resgatado', tone: 'success' },
  revoked: { label: 'Revogado', tone: 'danger' },
};

const isUsed = (e: InventoryEntry) => e.state === 'consumed' || e.state === 'redeemed' || e.state === 'revoked';

export function InventoryPage() {
  const q = useQuery({ queryKey: ['inventory'], queryFn: () => api.get<InventoryEntry[]>('/api/inventory') });
  const purchases = useQuery({ queryKey: ['purchases'], queryFn: () => api.get<PurchaseRow[]>('/api/purchases') });
  const [tab, setTab] = useState<Tab>('all');
  const [redeeming, setRedeeming] = useState<InventoryEntry | null>(null);

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const all = q.data;
  const filters: Record<Tab, (e: InventoryEntry) => boolean> = {
    all: (e) => !isUsed(e),
    equipped: (e) => e.state === 'equipped',
    permanent: (e) => !isUsed(e) && !SINGLE_USE_KINDS.includes(e.item.kind),
    single: (e) => !isUsed(e) && SINGLE_USE_KINDS.includes(e.item.kind),
    titles: (e) => !isUsed(e) && e.item.kind === 'title',
    used: isUsed,
  };
  const list = all.filter(filters[tab]);
  const count = (t: Tab) => all.filter(filters[t]).length;

  return (
    <>
      <PageHeader
        title="Inventário"
        icon="package"
        subtitle="Possuir, equipar, consumir e resgatar são ações diferentes: cosméticos e títulos são equipados (um por espaço); consumíveis são usados; recompensas reais são resgatadas."
        actions={
          <Link to="/loja" className="btn btn-secondary">
            <Icon name="shopping-bag" size={16} /> Loja
          </Link>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: `Todos (${count('all')})`, icon: 'package' },
          { value: 'equipped', label: `Equipados (${count('equipped')})`, icon: 'shield-check' },
          { value: 'permanent', label: `Permanentes (${count('permanent')})`, icon: 'gem' },
          { value: 'single', label: `Consumíveis e recompensas reais (${count('single')})`, icon: 'gift' },
          { value: 'titles', label: `Títulos (${count('titles')})`, icon: 'scroll' },
          { value: 'used', label: `Usados (${count('used')})`, icon: 'history' },
        ]}
      />
      {list.length === 0 ? (
        <Panel>
          <EmptyState
            icon="package"
            title="Nada aqui ainda"
            action={
              <Link to="/loja" className="btn btn-secondary btn-sm">
                Ir à loja
              </Link>
            }
          >
            Itens chegam por compras, conquistas, marcos de nível e temporadas.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((e) => (
            <InventoryCard key={e.id} entry={e} onRedeem={() => setRedeeming(e)} />
          ))}
        </div>
      )}

      <Panel title="Histórico de aquisições na loja" icon="history" className="mt-6">
        {purchases.isLoading ? (
          <Loading />
        ) : purchases.isError ? (
          <ErrorState error={purchases.error} onRetry={() => purchases.refetch()} />
        ) : purchases.data!.length === 0 ? (
          <EmptyState icon="shopping-bag" title="Nenhuma compra ainda" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Item</th>
                  <th>Qtd.</th>
                  <th>Preço pago</th>
                  <th>Total</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {purchases.data!.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap text-muted">{fmtDateTime(p.createdAt)}</td>
                    <td>
                      {p.itemSnapshot.name}
                      <span className="block text-xs text-faint">{p.itemSnapshot.category}</span>
                    </td>
                    <td className="num">{p.quantity}</td>
                    <td>
                      <Coins value={p.unitPrice} />
                    </td>
                    <td>
                      <Coins value={p.total} />
                    </td>
                    <td>
                      {p.status === 'refunded' ? (
                        <Badge tone="warning" title={p.refundReason ?? undefined}>
                          Reembolsada
                        </Badge>
                      ) : (
                        <Badge tone="success">Concluída</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-faint">O preço exibido é o valor efetivamente pago na época, gravado em cada compra.</p>
      </Panel>
      {redeeming && <RedeemModal entry={redeeming} onClose={() => setRedeeming(null)} />}
    </>
  );
}

function useInventoryAction() {
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'equip' | 'unequip' | 'consume' | 'redeem'; note?: string | null }) =>
      api.post<InventoryEntry>(`/api/inventory/${id}/action`, { action, note: note ?? null }),
    onSuccess: (_r, v) => {
      const msg = { equip: 'Item equipado', unequip: 'Item desequipado', consume: 'Item consumido', redeem: 'Recompensa resgatada' }[v.action];
      toast.success(msg);
      toast.reward(null, null);
    },
    onError: (e) => toast.error(e),
  });
}

function InventoryCard({ entry, onRedeem }: { entry: InventoryEntry; onRedeem: () => void }) {
  const act = useInventoryAction();
  const item = entry.item;
  const equippable = EQUIPPABLE_KINDS.includes(item.kind);
  const used = isUsed(entry);
  const state = STATE_LABELS[entry.state];
  return (
    <article className={`panel flex flex-col gap-3 ${used ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)] border"
          style={{ borderColor: rarityColor(item.rarity), color: rarityColor(item.rarity) }}
        >
          <Icon name={item.icon} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-[1.02rem]">{item.name}</h3>
            <Badge tone={state.tone}>{state.label}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <RarityBadge value={item.rarity} />
            <Badge>{ITEM_KIND_LABELS[item.kind]}</Badge>
          </div>
        </div>
      </div>
      {item.description && <p className="text-sm text-muted">{item.description}</p>}
      <p className="text-xs text-faint">
        {SOURCE_LABELS[entry.source] ?? entry.source} · {fmtDateTime(entry.acquiredAt)}
        {entry.usedAt && used && <> · usado em {fmtDateTime(entry.usedAt)}</>}
      </p>
      {entry.note && <p className="text-xs text-muted">Nota: {entry.note}</p>}
      {!used && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
          {equippable &&
            (entry.state === 'equipped' ? (
              <Button size="sm" icon="x" loading={act.isPending} onClick={() => act.mutate({ id: entry.id, action: 'unequip' })}>
                Desequipar
              </Button>
            ) : (
              <Button size="sm" variant="primary" icon="shield-check" loading={act.isPending} onClick={() => act.mutate({ id: entry.id, action: 'equip' })}>
                Equipar
              </Button>
            ))}
          {item.kind === 'consumable' && (
            <Button size="sm" variant="primary" icon="zap" loading={act.isPending} onClick={() => act.mutate({ id: entry.id, action: 'consume' })}>
              Consumir
            </Button>
          )}
          {item.kind === 'real_reward' && (
            <Button size="sm" variant="primary" icon="gift" onClick={onRedeem}>
              Resgatar
            </Button>
          )}
          {!equippable && item.kind !== 'consumable' && item.kind !== 'real_reward' && (
            <p className="text-xs text-faint">Item de coleção: permanece no inventário.</p>
          )}
        </div>
      )}
      {equippable && entry.state !== 'equipped' && !used && (
        <p className="-mt-1 text-xs text-faint">Equipar substitui o item atual do espaço “{ITEM_KIND_LABELS[item.kind]}”.</p>
      )}
    </article>
  );
}

function RedeemModal({ entry, onClose }: { entry: InventoryEntry; onClose: () => void }) {
  const act = useInventoryAction();
  const [note, setNote] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={`Resgatar: ${entry.item.name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon="gift"
            loading={act.isPending}
            onClick={() => act.mutate({ id: entry.id, action: 'redeem', note: note.trim() || null }, { onSuccess: onClose })}
          >
            Confirmar resgate
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">Resgatar registra que você usou esta recompensa real. O item sai da lista de disponíveis e fica no histórico.</p>
      <Textarea label="Como/quando foi usado (opcional)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} />
    </Modal>
  );
}
