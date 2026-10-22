import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { OBJECTIVE_METRIC_LABELS } from '@rpg/contracts';
import { MISSION_STATUS_LABELS, PENALTY_TYPE_LABELS, type MissionStatus } from '@rpg/engine';
import { api } from '../../lib/api';
import { fmt, fmtDate, fmtDateTime, pct, signed } from '../../lib/format';
import type { AfterAction, MissionDetail, RewardOutcome } from '../../lib/types';
import { useLookups } from '../../components/forms';
import { AttrWeights, DifficultyBadge, StatusBadge, TypeBadge } from '../../components/ui/domain';
import { Icon } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Badge, Button, ErrorState, Input, Loading, PageHeader, Panel, ProgressBar, Textarea } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';
import { MissionForm, missionToInput, useGameConfig } from './MissionForm';

export function MissionDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const lookups = useLookups();
  const cfg = useGameConfig().data?.active.config;
  const q = useQuery({ queryKey: ['mission', id], queryFn: () => api.get<MissionDetail>(`/api/missions/${id}`) });
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const action = useMutation({
    mutationFn: (body: { action: string; reason?: string | null; dueDate?: string | null; evidence?: string | null }) =>
      api.post<{ reward?: RewardOutcome | null; after?: AfterAction; mission?: { status: MissionStatus } }>(`/api/missions/${id}/action`, body),
    onSuccess: (r, vars) => {
      if (vars.action === 'complete') toast.reward(r.reward, r.after, 'Missão concluída');
      else {
        toast.success(vars.action === 'reschedule' ? 'Prazo atualizado' : `Missão: ${MISSION_STATUS_LABELS[r.mission!.status].toLowerCase()}`);
        toast.reward(null, null);
      }
      setCompleting(false);
      setRescheduling(false);
    },
    onError: (e) => toast.error(e),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const m = q.data;
  const active = m.status === 'available' || m.status === 'in_progress';
  const category = lookups.data?.categories.find((c) => c.id === m.categoryId);
  const rules = (lookups.data?.penaltyRules ?? []).filter((r) => m.penaltyRuleIds.includes(r.id));
  const table = cfg?.difficulty[m.difficulty];

  const ask = async (act: 'fail' | 'cancel' | 'suspend', title: string, message: string, danger = false) => {
    const r = await confirm({ title, message, requireReason: act !== 'fail' || rules.length > 0, danger, confirmLabel: title });
    if (r.ok) action.mutate({ action: act, reason: r.reason || null });
  };

  return (
    <>
      <Link to="/missoes" className="link mb-3 inline-flex items-center gap-1 text-sm">
        <Icon name="arrow-left" size={14} /> Missões
      </Link>
      <PageHeader
        title={m.title}
        subtitle={m.description || undefined}
        actions={
          <>
            {active && (
              <Button
                variant="primary"
                icon="check"
                disabled={m.objectives.length > 0 && !m.progress.complete}
                onClick={() => (m.evidenceRequired ? setCompleting(true) : action.mutate({ action: 'complete' }))}
              >
                Concluir
              </Button>
            )}
            {m.status === 'available' && (
              <Button icon="play" onClick={() => action.mutate({ action: 'start' })}>
                Iniciar
              </Button>
            )}
            {m.status === 'suspended' && (
              <Button icon="play" onClick={() => action.mutate({ action: 'resume' })}>
                Retomar
              </Button>
            )}
            {(active || m.status === 'suspended') && (
              <Button variant="ghost" icon="pencil" onClick={() => setEditing(true)}>
                Editar
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Situação" icon="flag">
            <div className="flex flex-wrap gap-2">
              <StatusBadge value={m.status} />
              <DifficultyBadge value={m.difficulty} />
              <TypeBadge value={m.type} />
              {category && <Badge>{category.name}</Badge>}
              {m.source === 'template' && <Badge tone="info">Gerada por modelo</Badge>}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-faint">Início</dt>
                <dd>{fmtDate(m.startDate)}</dd>
              </div>
              <div>
                <dt className="text-faint">Prazo</dt>
                <dd>{fmtDate(m.dueDate)}</dd>
              </div>
              <div>
                <dt className="text-faint">Conclusão</dt>
                <dd>{m.completionMode === 'auto' ? 'Automática' : 'Manual'}</dd>
              </div>
              <div>
                <dt className="text-faint">Criada em</dt>
                <dd>{fmtDateTime(m.createdAt)}</dd>
              </div>
            </dl>
            {m.statusReason && <p className="mt-3 text-sm text-muted">Motivo: {m.statusReason}</p>}
            {active && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                <Button size="sm" icon="calendar" onClick={() => setRescheduling(true)}>
                  Reagendar
                </Button>
                <Button
                  size="sm"
                  icon="pause"
                  onClick={() => ask('suspend', 'Suspender', 'Suspensão por motivo válido (doença, viagem, imprevisto) não gera falha nem penalidade.')}
                >
                  Suspender
                </Button>
                <Button size="sm" variant="ghost" icon="x" onClick={() => ask('cancel', 'Cancelar', 'Cancelar não é tratado como falha. Informe o motivo.')}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon="skull"
                  onClick={() =>
                    ask(
                      'fail',
                      'Declarar falha',
                      rules.length
                        ? `As penalidades configuradas serão aplicadas: ${rules.map((r) => r.name).join(', ')}.`
                        : 'A falha será registrada no histórico (sem penalidade configurada).',
                      true,
                    )
                  }
                >
                  Declarar falha
                </Button>
              </div>
            )}
          </Panel>

          <Panel title="Objetivos" icon="list-checks">
            {m.objectives.length === 0 ? (
              <p className="text-sm text-muted">Missão simples: conclua manualmente quando terminar.</p>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-3">
                  <ProgressBar value={m.progress.progress} className="flex-1" label="Progresso" />
                  <span className="num text-sm">{pct(m.progress.progress)}</span>
                </div>
                <ul className="space-y-3">
                  {m.objectives.map((o) => (
                    <ObjectiveRow key={o.id} missionId={m.id} o={o} editable={active} />
                  ))}
                </ul>
              </>
            )}
          </Panel>

          <Panel title="Histórico de tentativas e estados" icon="history">
            <ol className="space-y-2 border-l border-line pl-4">
              {m.events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[1.3rem] h-2 w-2 rounded-full bg-accent" />
                  <span className="text-faint">{fmtDateTime(e.createdAt)}</span> ·{' '}
                  {e.fromStatus ? `${MISSION_STATUS_LABELS[e.fromStatus as MissionStatus] ?? e.fromStatus} → ` : ''}
                  {MISSION_STATUS_LABELS[e.toStatus as MissionStatus] ?? e.toStatus}
                  {e.reason && <span className="text-muted"> — {e.reason}</span>}
                  <span className="text-faint"> ({e.actor === 'system' ? 'sistema' : e.actor === 'admin' ? 'administrador' : 'você'})</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Recompensa" icon="sparkles">
            {table && (
              <p className="text-sm">
                Base da dificuldade: <span className="num text-accent">{fmt(m.rewardXpOverride ?? table.xp)} XP</span> ·{' '}
                <span className="num" style={{ color: 'var(--coin)' }}>
                  {fmt(m.rewardCoinsOverride ?? table.coins)} moedas
                </span>
              </p>
            )}
            <div className="mt-2">
              <AttrWeights weights={m.attributeWeights} />
            </div>
            {m.grants.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-line pt-3">
                {m.grants.map((g) => (
                  <li key={g.id} className="text-sm">
                    <p>
                      <span className="num text-accent">{signed(g.xp)} XP</span> · <span className="num">{signed(g.coins)} moedas</span>
                      {g.reversedAt && <Badge className="ml-2">estornada</Badge>}
                    </p>
                    <ul className="text-xs text-muted">
                      {g.explanation.map((e, i) => (
                        <li key={i}>• {e}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Penalidades" icon="skull">
            {rules.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma penalidade configurada: a falha apenas é registrada.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {rules.map((r) => (
                  <li key={r.id}>
                    {r.name} <span className="text-faint">({PENALTY_TYPE_LABELS[r.type]})</span>
                  </li>
                ))}
              </ul>
            )}
            {m.penalties.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                {m.penalties.map((p) => (
                  <li key={p.id}>
                    {fmtDate(p.localDate)} · {PENALTY_TYPE_LABELS[p.type]} {p.amount > 0 && `(${p.amount})`}{' '}
                    {p.status === 'reversed' && <Badge>revertida</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {m.evidence && (
            <Panel title="Evidência" icon="scroll">
              <p className="text-sm whitespace-pre-wrap">{m.evidence}</p>
            </Panel>
          )}
        </div>
      </div>

      {editing && <MissionForm open onClose={() => setEditing(false)} initial={missionToInput(m)} missionId={m.id} title="Editar missão" />}
      <CompleteWithEvidence
        open={completing}
        onClose={() => setCompleting(false)}
        onSubmit={(evidence) => action.mutate({ action: 'complete', evidence })}
        loading={action.isPending}
      />
      <Reschedule
        open={rescheduling}
        current={m.dueDate}
        onClose={() => setRescheduling(false)}
        onSubmit={(dueDate, reason) => action.mutate({ action: 'reschedule', dueDate, reason })}
        loading={action.isPending}
      />
    </>
  );
}

function ObjectiveRow({ missionId, o, editable }: { missionId: string; o: MissionDetail['objectives'][number]; editable: boolean }) {
  const toast = useToast();
  const [value, setValue] = useState(String(o.current));
  const save = useMutation({
    mutationFn: () => api.patch(`/api/missions/${missionId}/objectives/${o.id}`, { current: Number(value) }),
    onSuccess: () => toast.reward(null, null),
    onError: (e) => toast.error(e),
  });
  const done = Number(o.current) >= Number(o.target);
  return (
    <li>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className={done ? 'text-success' : ''}>
          {done && <Icon name="check" size={14} className="mr-1 inline" />}
          {o.title}
          {o.optional && <span className="text-faint"> (opcional)</span>}
        </span>
        <span className="num text-faint">
          {fmt(Number(o.current))} / {fmt(Number(o.target))} {o.unit ?? ''}
        </span>
      </div>
      <ProgressBar value={Number(o.current) / Number(o.target)} className="mt-1" label={o.title} />
      <p className="mt-0.5 text-xs text-faint">
        {OBJECTIVE_METRIC_LABELS[o.metric as keyof typeof OBJECTIVE_METRIC_LABELS] ?? o.metric}
        {o.metric !== 'manual' && ' · calculado automaticamente'}
      </p>
      {editable && o.metric === 'manual' && (
        <form
          className="mt-1 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input type="number" min={0} className="!w-28" value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Progresso de ${o.title}`} />
          <Button size="sm" type="submit" loading={save.isPending}>
            Atualizar
          </Button>
        </form>
      )}
    </li>
  );
}

function CompleteWithEvidence({ open, onClose, onSubmit, loading }: { open: boolean; onClose: () => void; onSubmit: (e: string) => void; loading: boolean }) {
  const [text, setText] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Concluir com evidência"
      size="sm"
      footer={
        <Button variant="primary" disabled={text.trim().length < 3} loading={loading} onClick={() => onSubmit(text.trim())}>
          Concluir
        </Button>
      }
    >
      <Textarea label="Evidência (link, descrição do resultado)" value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus />
    </Modal>
  );
}

function Reschedule({
  open,
  current,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  current: string | null;
  onClose: () => void;
  onSubmit: (d: string, r: string) => void;
  loading: boolean;
}) {
  const [date, setDate] = useState(current ?? '');
  const [reason, setReason] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reagendar"
      size="sm"
      footer={
        <Button variant="primary" disabled={!date} loading={loading} onClick={() => onSubmit(date, reason)}>
          Salvar novo prazo
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">Reagendar antes do prazo usa o novo prazo aprovado, sem penalidade.</p>
        <Input label="Novo prazo" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}
