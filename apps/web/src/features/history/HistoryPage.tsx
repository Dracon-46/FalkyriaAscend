import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import {
  COIN_TX_KIND_LABELS,
  MISSION_STATUS_LABELS,
  PENALTY_TYPE_LABELS,
  XP_SOURCE_LABELS,
  XP_SOURCES,
  type CoinTxKind,
  type MissionStatus,
} from '@rpg/engine';
import { api, qs } from '../../lib/api';
import { fmt, fmtDate, fmtDateTime, signed } from '../../lib/format';
import type { Grant, PenaltyApplication } from '../../lib/types';
import { useSession } from '../../app/session';
import { useConfirm } from '../../components/ui/Modal';
import { Badge, Button, EmptyState, ErrorState, Input, Loading, PageHeader, Panel, Select, Tabs } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type Tab = 'recompensas' | 'moedas' | 'penalidades' | 'missoes' | 'auditoria';
const PAGE = 50;

function usePaged<T>(key: unknown[], url: (offset: number) => string) {
  return useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<T[]>(url(pageParam)),
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.length * PAGE : undefined),
  });
}

function More({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  if (!q.hasNextPage) return null;
  return (
    <div className="mt-3 flex justify-center">
      <Button loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
        Carregar mais
      </Button>
    </div>
  );
}

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) ?? 'recompensas';
  return (
    <>
      <PageHeader
        title="Histórico e auditoria"
        icon="history"
        subtitle="Cada ganho, gasto, penalidade, estorno e alteração fica registrado de forma imutável, com origem, data e motivo."
      />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ aba: t }, { replace: true })}
        tabs={[
          { value: 'recompensas', label: 'Recompensas', icon: 'sparkles' },
          { value: 'moedas', label: 'Moedas', icon: 'coins' },
          { value: 'penalidades', label: 'Penalidades', icon: 'skull' },
          { value: 'missoes', label: 'Missões', icon: 'swords' },
          { value: 'auditoria', label: 'Auditoria', icon: 'shield-check' },
        ]}
      />
      {tab === 'recompensas' && <Grants />}
      {tab === 'moedas' && <Coins />}
      {tab === 'penalidades' && <Penalties />}
      {tab === 'missoes' && <MissionEvents />}
      {tab === 'auditoria' && <Audit />}
    </>
  );
}

function Grants() {
  const me = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState({ source: '', from: '', to: '' });
  const q = usePaged<Grant>(['history-grants', f], (offset) => `/api/history/grants${qs({ ...f, limit: PAGE, offset })}`);
  const reverse = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/api/history/grants/${id}/reverse`, { reason }),
    onSuccess: () => {
      toast.success('Recompensa estornada (lançamento compensatório criado)');
      toast.reward(null, null);
    },
    onError: (e) => toast.error(e),
  });
  const rows = q.data?.pages.flat() ?? [];
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select
          className="!w-48"
          value={f.source}
          onChange={(e) => setF({ ...f, source: e.target.value })}
          placeholder="Todas as origens"
          options={XP_SOURCES.map((s) => ({ value: s, label: XP_SOURCE_LABELS[s] }))}
          aria-label="Origem"
        />
        <Input className="!w-40" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="De" />
        <Input className="!w-40" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="Até" />
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : rows.length === 0 ? (
        <EmptyState icon="sparkles" title="Nenhuma recompensa no filtro" />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((g) => (
            <li key={g.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="w-20 text-xs text-faint">{fmtDate(g.localDate)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {g.title}
                    {g.reversedAt && <Badge className="ml-2">estornada</Badge>}
                    {g.reversalOf && (
                      <Badge tone="warning" className="ml-2">
                        estorno
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-faint">{XP_SOURCE_LABELS[g.xpSource]}</span>
                  <span className={`num w-20 text-right text-sm ${g.xp < 0 ? 'text-danger' : 'text-accent'}`}>{signed(g.xp)} XP</span>
                  <span className="num w-16 text-right text-sm" style={{ color: 'var(--coin)' }}>
                    {signed(g.coins)}
                  </span>
                </summary>
                <div className="mt-2 ml-0 space-y-1 rounded-[var(--radius-sm)] bg-bg-2 p-3 text-sm sm:ml-20">
                  <ul className="space-y-0.5 text-muted">
                    {g.explanation.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                  {(g.attributes?.length ?? 0) > 0 && (
                    <p className="text-xs">Atributos: {g.attributes!.map((a) => `${a.code} ${signed(a.amount)}`).join(' · ')}</p>
                  )}
                  {(g.skills?.length ?? 0) > 0 && <p className="text-xs">Maestria: {g.skills!.map((s) => `${s.name} ${signed(s.amount)}`).join(' · ')}</p>}
                  <p className="text-xs text-faint">
                    Regras v{g.configVersion} · {fmtDateTime(g.createdAt)} · chave {g.idempotencyKey}
                  </p>
                  {me.user.role === 'admin' && !g.reversedAt && !g.reversalOf && (
                    <Button
                      size="sm"
                      icon="undo"
                      onClick={async () => {
                        const c = await confirm({
                          title: 'Estornar recompensa',
                          message: `Criar um estorno de ${signed(-g.xp)} XP e ${signed(-g.coins)} moedas? O registro original permanece.`,
                          requireReason: true,
                          confirmLabel: 'Estornar',
                        });
                        if (c.ok) reverse.mutate({ id: g.id, reason: c.reason });
                      }}
                    >
                      Estornar
                    </Button>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <More q={q} />
    </Panel>
  );
}

interface CoinTx {
  id: string;
  amount: number;
  kind: CoinTxKind;
  category: string;
  reason: string;
  balanceAfter: number;
  localDate: string;
  createdAt: string;
}

function Coins() {
  const q = usePaged<CoinTx>(['history-coins'], (offset) => `/api/history/coins${qs({ limit: PAGE, offset })}`);
  const rows = q.data?.pages.flat() ?? [];
  return (
    <Panel>
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon="coins" title="Nenhuma transação" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Motivo</th>
                <th className="text-right">Valor</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(t.createdAt)}</td>
                  <td>
                    <Badge tone={t.kind === 'earn' ? 'success' : t.kind === 'penalty' ? 'danger' : t.kind === 'spend' ? 'info' : 'warning'}>
                      {COIN_TX_KIND_LABELS[t.kind]}
                    </Badge>
                  </td>
                  <td className="max-w-md">
                    {t.reason}
                    <span className="block text-xs text-faint">{t.category}</span>
                  </td>
                  <td className={`num text-right ${t.amount < 0 ? 'text-danger' : 'text-success'}`}>{signed(t.amount)}</td>
                  <td className="num text-right">{fmt(t.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <More q={q} />
    </Panel>
  );
}

function Penalties() {
  const me = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const q = usePaged<PenaltyApplication>(['history-penalties'], (offset) => `/api/history/penalties${qs({ limit: PAGE, offset })}`);
  const revert = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/api/history/penalties/${id}/revert`, { reason }),
    onSuccess: () => {
      toast.success('Penalidade revertida e auditada');
      toast.reward(null, null);
    },
    onError: (e) => toast.error(e),
  });
  const rows = q.data?.pages.flat() ?? [];
  return (
    <Panel>
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon="shield-check" title="Nenhuma penalidade aplicada">
          Falhas dentro da tolerância, dias de descanso e indisponibilidades não geram penalidades.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id} className="rounded-[var(--radius)] border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display">{p.sourceTitle}</span>
                <Badge tone={p.status === 'reversed' ? 'muted' : 'danger'}>{p.status === 'reversed' ? 'Revertida' : 'Aplicada'}</Badge>
                <Badge>{PENALTY_TYPE_LABELS[p.type]}</Badge>
                <span className="ml-auto text-xs text-faint">
                  falha em {fmtDate(p.localDate)} · {p.sourceType === 'habit' ? 'hábito' : 'missão'}
                </span>
              </div>
              <p className="mt-1 text-sm">
                Regra: <span className="text-muted">{String((p.ruleSnapshot as { name?: string }).name ?? '—')}</span> · passo {p.step}
                {p.amount > 0 && <> · efeito {fmt(p.amount)}</>}
                {p.expiresOn && <> · até {fmtDate(p.expiresOn)}</>}
              </p>
              <ul className="mt-1 text-xs text-muted">
                {p.explanation.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
              {p.reversalReason && <p className="mt-1 text-xs text-faint">Revertida: {p.reversalReason}</p>}
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-faint">Configuração da regra no momento da aplicação</summary>
                <pre className="mt-1 overflow-x-auto text-xs text-faint">{JSON.stringify(p.ruleSnapshot, null, 2)}</pre>
              </details>
              {me.user.role === 'admin' && p.status === 'applied' && (
                <Button
                  size="sm"
                  className="mt-2"
                  icon="rotate-ccw"
                  onClick={async () => {
                    const c = await confirm({
                      title: 'Reverter penalidade',
                      message: 'Os efeitos (moedas, XP de habilidade) serão devolvidos por lançamento de estorno.',
                      requireReason: true,
                      confirmLabel: 'Reverter',
                    });
                    if (c.ok) revert.mutate({ id: p.id, reason: c.reason });
                  }}
                >
                  Reverter
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <More q={q} />
    </Panel>
  );
}

interface MissionEvent {
  id: string;
  missionId: string;
  missionTitle: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  actor: string;
  createdAt: string;
}

function MissionEvents() {
  const q = usePaged<MissionEvent>(['history-missions'], (offset) => `/api/history/missions${qs({ limit: PAGE, offset })}`);
  const rows = q.data?.pages.flat() ?? [];
  const label = (s: string | null) => (s ? (MISSION_STATUS_LABELS[s as MissionStatus] ?? s) : '—');
  return (
    <Panel>
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon="swords" title="Nenhum evento de missão" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Missão</th>
                <th>Transição</th>
                <th>Motivo</th>
                <th>Por</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                  <td>{e.missionTitle}</td>
                  <td className="whitespace-nowrap">
                    {e.fromStatus ? `${label(e.fromStatus)} → ` : ''}
                    {label(e.toStatus)}
                  </td>
                  <td className="text-muted">{e.reason ?? ''}</td>
                  <td>{e.actor === 'system' ? 'sistema' : e.actor === 'admin' ? 'admin' : 'você'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <More q={q} />
    </Panel>
  );
}

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

function Diff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const changed = keys.filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  if (!before || !after) {
    return <pre className="overflow-x-auto text-xs text-faint">{JSON.stringify(after ?? before, null, 2)}</pre>;
  }
  if (changed.length === 0) return <p className="text-xs text-faint">Sem diferenças de campos.</p>;
  return (
    <table className="table text-xs">
      <thead>
        <tr>
          <th>Campo</th>
          <th>Antes</th>
          <th>Depois</th>
        </tr>
      </thead>
      <tbody>
        {changed.map((k) => (
          <tr key={k}>
            <td className="font-mono">{k}</td>
            <td className="font-mono break-all text-danger">{JSON.stringify(before[k])}</td>
            <td className="font-mono break-all text-success">{JSON.stringify(after[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Audit() {
  const q = usePaged<AuditRow>(['history-audit'], (offset) => `/api/history/audit${qs({ limit: PAGE, offset })}`);
  const rows = q.data?.pages.flat() ?? [];
  return (
    <Panel>
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon="shield-check" title="Nenhum registro de auditoria" />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((a) => (
            <li key={a.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 text-sm">
                  <span className="w-36 text-xs text-faint">{fmtDateTime(a.createdAt)}</span>
                  <Badge>{a.action}</Badge>
                  <span className="text-muted">{a.entityType}</span>
                  <span className="truncate font-mono text-xs text-faint">{a.entityId}</span>
                </summary>
                <div className="mt-2 rounded-[var(--radius-sm)] bg-bg-2 p-3">
                  <Diff before={a.before} after={a.after} />
                  {a.meta && <pre className="mt-2 overflow-x-auto text-xs text-faint">{JSON.stringify(a.meta, null, 2)}</pre>}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <More q={q} />
    </Panel>
  );
}
