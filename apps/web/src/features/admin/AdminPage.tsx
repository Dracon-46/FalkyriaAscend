import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useSession } from '../../app/session';
import { Icon } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Badge, Button, Checkbox, EmptyState, ErrorState, Input, Loading, PageHeader, Panel, Select, Textarea, cx } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type FieldType = 'uuid' | 'ref' | 'text' | 'longtext' | 'enum' | 'int' | 'number' | 'boolean' | 'date' | 'datetime' | 'json';
interface FieldMeta {
  key: string;
  column: string;
  type: FieldType;
  required: boolean;
  readonly: boolean;
  enumValues?: string[];
  ref?: string;
  label: string;
}
interface ResourceMeta {
  key: string;
  label: string;
  group: string;
  mode: 'crud' | 'readonly';
  display: string;
  note: string | null;
  archivable: boolean;
  fields: FieldMeta[];
}
type Row = Record<string, unknown>;
interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  isDemo: boolean;
  disabledAt: string | null;
}

const PAGE = 25;

/** Ações auditadas específicas do livro-razão (nunca edição direta). */
const LEDGER_ACTIONS: Record<string, { label: string; icon: string; url: (id: string) => string; danger?: boolean; when?: (r: Row) => boolean }> = {
  reward_grants: { label: 'Estornar', icon: 'undo', url: (id) => `/api/admin/grants/${id}/reverse`, when: (r) => !r.reversedAt && !r.reversalOf },
  coin_transactions: { label: 'Estornar', icon: 'undo', url: (id) => `/api/admin/coins/${id}/reverse`, when: (r) => r.kind !== 'reversal' && !r.grantId && !r.purchaseId && !r.penaltyId },
  penalty_applications: { label: 'Reverter', icon: 'rotate-ccw', url: (id) => `/api/history/penalties/${id}/revert`, when: (r) => r.status === 'applied' },
  purchases: { label: 'Reembolsar', icon: 'rotate-ccw', url: (id) => `/api/purchases/${id}/refund`, when: (r) => r.status === 'completed' },
  user_achievements: { label: 'Revogar', icon: 'x', url: (id) => `/api/admin/user-achievements/${id}/revoke`, danger: true },
};

function display(v: unknown, f?: FieldMeta): string {
  if (v === null || v === undefined || v === '') return '—';
  if (f?.type === 'datetime') return fmtDateTime(String(v));
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

export function AdminPage() {
  const { resource } = useParams();
  const navigate = useNavigate();
  const me = useSession();
  const [params, setParams] = useSearchParams();
  const targetUser = params.get('usuario') ?? me.user.id;
  const meta = useQuery({ queryKey: ['admin-meta'], queryFn: () => api.get<ResourceMeta[]>('/api/admin/meta'), staleTime: Infinity });
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<AdminUser[]>('/api/admin/users') });
  const [filter, setFilter] = useState('');

  const groups = useMemo(() => {
    const g = new Map<string, ResourceMeta[]>();
    for (const r of meta.data ?? []) {
      if (filter && !`${r.label} ${r.key}`.toLowerCase().includes(filter.toLowerCase())) continue;
      g.set(r.group, [...(g.get(r.group) ?? []), r]);
    }
    return [...g.entries()];
  }, [meta.data, filter]);

  const current = meta.data?.find((r) => r.key === resource) ?? null;

  return (
    <>
      <PageHeader
        title="Administração"
        icon="database"
        subtitle="CRUD completo de todos os dados, com auditoria. O livro-razão (XP, moedas, penalidades, compras) é corrigido por ações próprias — estorno, ajuste, reembolso, reversão — para nunca corromper o histórico."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          label="Usuário gerenciado"
          className="!w-72"
          value={targetUser}
          onChange={(e) => setParams((p) => {
            const n = new URLSearchParams(p);
            if (e.target.value === me.user.id) n.delete('usuario');
            else n.set('usuario', e.target.value);
            return n;
          })}
          options={(users.data ?? []).map((u) => ({ value: u.id, label: `${u.displayName} — ${u.email}${u.isDemo ? ' (demo)' : ''}${u.id === me.user.id ? ' (você)' : ''}` }))}
        />
        <AdminTools userId={targetUser} isSelf={targetUser === me.user.id} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Panel className="h-fit lg:sticky lg:top-20">
          <Input placeholder="Filtrar tabelas…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar tabelas" />
          {meta.isLoading && <Loading />}
          <nav className="mt-3 max-h-[70dvh] space-y-3 overflow-y-auto" aria-label="Tabelas">
            {groups.map(([group, list]) => (
              <div key={group}>
                <p className="mb-1 text-xs tracking-wider text-faint uppercase">{group}</p>
                <ul>
                  {list.map((r) => (
                    <li key={r.key}>
                      <Link
                        to={`/admin/${r.key}${targetUser !== me.user.id ? `?usuario=${targetUser}` : ''}`}
                        className={cx('flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm', r.key === resource ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-hover hover:text-fg')}
                      >
                        <span className="truncate">{r.label}</span>
                        {r.mode === 'readonly' && <Icon name="lock" size={12} className="shrink-0 text-faint" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </Panel>
        <div className="min-w-0">
          {current ? (
            <ResourceView key={`${current.key}:${targetUser}`} meta={current} all={meta.data!} userId={targetUser} />
          ) : (
            <Panel>
              <EmptyState icon="database" title="Selecione uma tabela" action={<Button onClick={() => navigate('/admin/missions')}>Abrir missões</Button>}>
                Todas as entidades do sistema estão disponíveis. Tabelas com cadeado são somente leitura e usam ações auditadas.
              </EmptyState>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function ResourceView({ meta, all, userId }: { meta: ResourceMeta; all: ResourceMeta[]; userId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: meta.fields.some((f) => f.key === 'createdAt') ? 'createdAt' : meta.fields[0]!.key, dir: 'desc' });
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const userQs = { userId };
  const list = useQuery({
    queryKey: ['admin', meta.key, userId, q, sort, offset],
    queryFn: () => api.get<{ total: number; rows: Row[] }>(`/api/admin/r/${meta.key}${qs({ ...userQs, q, sort: sort.key, dir: sort.dir, limit: PAGE, offset })}`),
  });
  const columns = useMemo(() => {
    const pref = [meta.display, 'title', 'name', 'status', 'type', 'kind', 'amount', 'xp', 'coins', 'localDate', 'level', 'createdAt'];
    const visible = meta.fields.filter((f) => f.type !== 'json' && f.type !== 'longtext' && f.key !== 'userId' && (f.key !== 'id' || meta.fields.length < 4));
    const sorted = [...visible].sort((a, b) => {
      const ia = pref.indexOf(a.key);
      const ib = pref.indexOf(b.key);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return sorted.slice(0, 6);
  }, [meta]);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
    void qc.invalidateQueries({ queryKey: ['me'] });
  };
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/admin/r/${meta.key}/${id}${qs(userQs)}`),
    onSuccess: () => {
      toast.success('Registro excluído (auditado)');
      invalidate();
    },
    onError: (e) => toast.error(e),
  });
  const archive = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.put(`/api/admin/r/${meta.key}/${id}${qs(userQs)}`, { archivedAt: on ? new Date().toISOString() : null }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e),
  });
  const ledger = LEDGER_ACTIONS[meta.key];
  const ledgerAction = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(ledger!.url(id), { reason, userId }),
    onSuccess: () => {
      toast.success(`${ledger!.label}: concluído e auditado`);
      toast.reward(null, null);
    },
    onError: (e) => toast.error(e),
  });
  const total = list.data?.total ?? 0;

  return (
    <Panel
      title={meta.label}
      icon={meta.mode === 'readonly' ? 'lock' : 'database'}
      actions={
        meta.mode === 'crud' && meta.key !== 'users' ? (
          <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing('new')}>
            Novo
          </Button>
        ) : undefined
      }
    >
      {meta.note && (
        <p className="mb-3 flex gap-2 rounded-[var(--radius-sm)] border border-line bg-bg-2 p-2 text-sm text-muted">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-info" />
          {meta.note}
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          className="!w-64"
          placeholder="Buscar em campos de texto…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
          aria-label="Buscar"
        />
        <span className="text-sm text-faint">{total} registro(s)</span>
      </div>
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data!.rows.length === 0 ? (
        <EmptyState icon="database" title="Nenhum registro" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>
                    <button
                      className="inline-flex items-center gap-1 hover:text-fg"
                      onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      aria-label={`Ordenar por ${c.label}`}
                    >
                      {c.label}
                      {sort.key === c.key && <Icon name={sort.dir === 'desc' ? 'chevron-down' : 'chevrons-up'} size={12} />}
                    </button>
                  </th>
                ))}
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.rows.map((r, i) => {
                const id = String(r.id ?? i);
                return (
                  <tr key={id}>
                    {columns.map((c) => (
                      <td key={c.key} className={cx(['int', 'number'].includes(c.type) && 'num', 'max-w-[16rem] truncate')}>
                        {c.key === 'archivedAt' || (meta.archivable && r.archivedAt && c.key === meta.display) ? (
                          <span className="text-faint">{display(r[c.key], c)}</span>
                        ) : (
                          display(r[c.key], c)
                        )}
                      </td>
                    ))}
                    <td className="text-right whitespace-nowrap">
                      {r.id !== undefined && (
                        <Button size="sm" variant="ghost" icon={meta.mode === 'crud' ? 'pencil' : 'eye'} aria-label={meta.mode === 'crud' ? 'Editar' : 'Ver'} onClick={() => setEditing(r)} />
                      )}
                      {meta.archivable && meta.mode === 'crud' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="archive"
                          aria-label={r.archivedAt ? 'Desarquivar' : 'Arquivar'}
                          title={r.archivedAt ? 'Desarquivar' : 'Arquivar'}
                          onClick={() => archive.mutate({ id, on: !r.archivedAt })}
                        />
                      )}
                      {ledger && (!ledger.when || ledger.when(r)) && (
                        <Button
                          size="sm"
                          variant={ledger.danger ? 'danger' : 'secondary'}
                          icon={ledger.icon}
                          onClick={async () => {
                            const c = await confirm({ title: ledger.label, message: 'Um lançamento compensatório será criado. O registro original permanece no histórico.', requireReason: true, confirmLabel: ledger.label, danger: ledger.danger });
                            if (c.ok) ledgerAction.mutate({ id, reason: c.reason });
                          }}
                        >
                          {ledger.label}
                        </Button>
                      )}
                      {meta.key === 'users' && <ResetPassword userId={id} />}
                      {meta.mode === 'crud' && meta.key !== 'users' && r.id !== undefined && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="trash"
                          aria-label="Excluir"
                          onClick={async () => {
                            const c = await confirm({ title: 'Excluir registro', message: `Excluir permanentemente "${display(r[meta.display])}"? Registros com histórico vinculado não podem ser excluídos — arquive-os.`, danger: true, confirmLabel: 'Excluir' });
                            if (c.ok) remove.mutate(id);
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Anterior
          </Button>
          <span className="text-faint">
            {offset + 1}–{Math.min(offset + PAGE, total)} de {total}
          </span>
          <Button size="sm" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
            Próxima
          </Button>
        </div>
      )}
      {editing && <RecordForm meta={meta} all={all} userId={userId} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={invalidate} />}
    </Panel>
  );
}

function toInput(f: FieldMeta, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (f.type === 'json') return JSON.stringify(v, null, 2);
  if (f.type === 'datetime') {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }
  return String(v);
}

/** Formulário gerado a partir dos metadados das colunas (fonte única: o schema do banco). */
function RecordForm({ meta, all, userId, row, onClose, onSaved }: { meta: ResourceMeta; all: ResourceMeta[]; userId: string; row: Row | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const readonlyView = meta.mode === 'readonly';
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(meta.fields.map((f) => [f.key, f.type === 'boolean' ? Boolean(row?.[f.key]) : toInput(f, row?.[f.key])])),
  );
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      row ? api.put(`/api/admin/r/${meta.key}/${String(row.id)}${qs({ userId })}`, body) : api.post(`/api/admin/r/${meta.key}${qs({ userId })}`, body),
    onSuccess: () => {
      toast.success(row ? 'Registro atualizado (auditado)' : 'Registro criado (auditado)');
      onSaved();
      onClose();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : 'Erro');
      toast.error(e);
    },
  });
  const submit = () => {
    const body: Record<string, unknown> = {};
    for (const f of meta.fields) {
      if (f.readonly) continue;
      const v = values[f.key];
      if (f.type === 'boolean') body[f.key] = Boolean(v);
      else if (v === '' || v === undefined) body[f.key] = row ? null : undefined;
      else if (f.type === 'int' || f.type === 'number') body[f.key] = Number(v);
      else if (f.type === 'datetime') body[f.key] = new Date(String(v)).toISOString();
      else if (f.type === 'json') {
        try {
          body[f.key] = JSON.parse(String(v));
        } catch {
          setError(`${f.label}: JSON inválido`);
          return;
        }
      } else body[f.key] = v;
    }
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
    save.mutate(body);
  };
  const editable = meta.fields.filter((f) => !f.readonly);
  const fixed = meta.fields.filter((f) => f.readonly);

  return (
    <Modal
      open
      onClose={onClose}
      title={`${readonlyView ? 'Detalhes' : row ? 'Editar' : 'Novo'} — ${meta.label}`}
      size="lg"
      footer={
        readonlyView ? (
          <Button onClick={onClose}>Fechar</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={submit}>
              Salvar
            </Button>
          </>
        )
      }
    >
      {error && (
        <p className="mb-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {editable.map((f) => (
          <FieldInput key={f.key} f={f} all={all} userId={userId} value={values[f.key]!} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
        ))}
      </div>
      {fixed.length > 0 && (
        <details className="mt-4" open={readonlyView}>
          <summary className="cursor-pointer text-sm text-muted">Campos somente leitura ({fixed.length})</summary>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            {fixed.map((f) => (
              <div key={f.key} className="min-w-0">
                <dt className="text-xs text-faint">{f.label}</dt>
                <dd className="font-mono text-xs break-all whitespace-pre-wrap">{f.type === 'json' ? toInput(f, row?.[f.key]) || '—' : display(row?.[f.key], f)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </Modal>
  );
}

function RefOptions({ refKey, all, userId }: { refKey: string; all: ResourceMeta[]; userId: string }) {
  const meta = all.find((r) => r.key === refKey);
  const q = useQuery({
    queryKey: ['admin-ref', refKey, userId],
    queryFn: () => api.get<{ rows: Row[] }>(`/api/admin/r/${refKey}${qs({ userId, limit: 500, sort: meta?.display, dir: 'asc' })}`),
    staleTime: 30_000,
  });
  return (
    <>
      {(q.data?.rows ?? []).map((r) => (
        <option key={String(r.id)} value={String(r.id)}>
          {display(r[meta?.display ?? 'id'])}
        </option>
      ))}
    </>
  );
}

function FieldInput({ f, all, userId, value, onChange }: { f: FieldMeta; all: ResourceMeta[]; userId: string; value: string | boolean; onChange: (v: string | boolean) => void }) {
  const label = `${f.label}${f.required ? ' *' : ''}`;
  switch (f.type) {
    case 'boolean':
      return (
        <div className="flex items-end pb-2">
          <Checkbox label={f.label} checked={Boolean(value)} onChange={onChange} />
        </div>
      );
    case 'enum':
      return <Select label={label} value={String(value)} onChange={(e) => onChange(e.target.value)} placeholder={f.required ? undefined : '—'} options={(f.enumValues ?? []).map((v) => ({ value: v, label: v }))} />;
    case 'ref':
      return (
        <div>
          <label className="field-label">{label}</label>
          <select className="input" value={String(value)} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            <RefOptions refKey={f.ref!} all={all} userId={userId} />
          </select>
        </div>
      );
    case 'longtext':
      return <Textarea className="sm:col-span-2" label={label} value={String(value)} onChange={(e) => onChange(e.target.value)} rows={3} />;
    case 'json':
      return (
        <div className="sm:col-span-2">
          <Textarea label={`${label} (JSON)`} value={String(value)} onChange={(e) => onChange(e.target.value)} rows={5} className="font-mono text-xs" spellCheck={false} />
        </div>
      );
    case 'int':
    case 'number':
      return <Input label={label} type="number" step={f.type === 'int' ? 1 : 'any'} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <Input label={label} type="date" value={String(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'datetime':
      return <Input label={label} type="datetime-local" value={String(value)} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <Input label={label} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  }
}

function ResetPassword({ userId }: { userId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/api/admin/users/${userId}/password`, { password: pw }),
    onSuccess: () => {
      toast.success('Senha redefinida');
      setOpen(false);
      setPw('');
    },
    onError: (e) => toast.error(e),
  });
  return (
    <>
      <Button size="sm" variant="ghost" icon="lock" aria-label="Redefinir senha" title="Redefinir senha" onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Redefinir senha" size="sm" footer={<Button variant="primary" disabled={pw.length < 10} loading={m.isPending} onClick={() => m.mutate()}>Redefinir</Button>}>
        <Input label="Nova senha (mín. 10 caracteres)" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      </Modal>
    </>
  );
}

interface IntegrityResult {
  ok: boolean;
  issues: Array<{ area: string; message: string; expected?: unknown; actual?: unknown }>;
}

function AdminTools({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const toast = useToast();
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [newUser, setNewUser] = useState(false);
  const check = useMutation({
    mutationFn: () => api.get<IntegrityResult>(`/api/admin/integrity${qs({ userId })}`),
    onSuccess: setIntegrity,
    onError: (e) => toast.error(e),
  });
  const rebuild = useMutation({
    mutationFn: () => api.post<IntegrityResult>(`/api/admin/integrity/rebuild${qs({ userId })}`),
    onSuccess: (r) => {
      setIntegrity(r);
      toast.success('Projeções recalculadas a partir do livro-razão');
      toast.reward(null, null);
    },
    onError: (e) => toast.error(e),
  });
  const evaluate = useMutation({
    mutationFn: () => api.post<{ evaluatedDays: string[]; missed: number; excused: number; tolerated: number }>(`/api/admin/evaluate${qs({ userId })}`),
    onSuccess: (r) => {
      toast.success(`Avaliação executada: ${r.evaluatedDays.length} dia(s), ${r.missed} falha(s), ${r.tolerated} tolerada(s), ${r.excused} dispensada(s)`);
      toast.reward(null, null);
    },
    onError: (e) => toast.error(e),
  });
  return (
    <div className="flex flex-wrap gap-2">
      <Button icon="shield-check" loading={check.isPending} onClick={() => check.mutate()}>
        Verificar integridade
      </Button>
      <Button icon="refresh" loading={evaluate.isPending} onClick={() => evaluate.mutate()}>
        Avaliar dia agora
      </Button>
      <Button icon="coins" onClick={() => setAdjusting(true)}>
        Ajuste manual
      </Button>
      <Button icon="users" variant="ghost" onClick={() => setNewUser(true)}>
        Novo usuário
      </Button>
      {integrity && (
        <Modal
          open
          onClose={() => setIntegrity(null)}
          title="Integridade do livro-razão"
          footer={
            !integrity.ok && (
              <Button variant="primary" icon="refresh" loading={rebuild.isPending} onClick={() => rebuild.mutate()}>
                Recalcular projeções
              </Button>
            )
          }
        >
          {integrity.ok ? (
            <p className="flex items-center gap-2 text-success">
              <Icon name="shield-check" /> Todas as projeções (XP, nível, atributos, habilidades e carteira) conferem com o livro-razão.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {integrity.issues.map((i, k) => (
                <li key={k} className="rounded-[var(--radius-sm)] border border-danger/40 p-2">
                  <Badge tone="danger">{i.area}</Badge> {i.message}
                  {i.expected !== undefined && (
                    <span className="text-faint">
                      {' '}
                      (esperado {String(i.expected)}, encontrado {String(i.actual)})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
      {adjusting && <AdjustmentForm userId={userId} isSelf={isSelf} onClose={() => setAdjusting(false)} />}
      {newUser && <NewUserForm onClose={() => setNewUser(false)} />}
    </div>
  );
}

function AdjustmentForm({ userId, onClose }: { userId: string; isSelf: boolean; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ reason: '', xp: '', coins: '', attrCode: '', attrXp: '' });
  const m = useMutation({
    mutationFn: () =>
      api.post('/api/admin/adjust', {
        userId,
        reason: v.reason,
        xp: Number(v.xp || 0),
        coins: Number(v.coins || 0),
        attributeXp: v.attrCode && v.attrXp ? { [v.attrCode.toUpperCase()]: Number(v.attrXp) } : {},
      }),
    onSuccess: () => {
      toast.success('Ajuste lançado e auditado');
      toast.reward(null, null);
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Ajuste manual auditado"
      footer={
        <Button variant="primary" disabled={v.reason.trim().length < 3} loading={m.isPending} onClick={() => m.mutate()}>
          Lançar ajuste
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">Cria um novo lançamento (positivo ou negativo) no livro-razão. Nada é apagado; o saldo nunca fica negativo.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="XP geral (±)" type="number" value={v.xp} onChange={(e) => setV({ ...v, xp: e.target.value })} />
        <Input label="Moedas (±)" type="number" value={v.coins} onChange={(e) => setV({ ...v, coins: e.target.value })} />
        <Input label="Código do atributo (opcional)" value={v.attrCode} onChange={(e) => setV({ ...v, attrCode: e.target.value })} placeholder="FOR" />
        <Input label="XP do atributo (±)" type="number" value={v.attrXp} onChange={(e) => setV({ ...v, attrXp: e.target.value })} />
        <Textarea className="sm:col-span-2" label="Motivo (obrigatório)" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} rows={2} />
      </div>
    </Modal>
  );
}

function NewUserForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState({ email: '', displayName: '', password: '', role: 'user' });
  const m = useMutation({
    mutationFn: () => api.post('/api/admin/users', { ...v, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    onSuccess: () => {
      toast.success('Usuário criado com o conteúdo inicial');
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal open onClose={onClose} title="Novo usuário" size="sm" footer={<Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Criar</Button>}>
      <div className="space-y-3">
        <Input label="Nome" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
        <Input label="E-mail" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <Input label="Senha inicial (mín. 10)" type="password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} autoComplete="new-password" />
        <Select label="Papel" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} options={[{ value: 'user', label: 'Usuário' }, { value: 'admin', label: 'Administrador' }]} />
      </div>
    </Modal>
  );
}
