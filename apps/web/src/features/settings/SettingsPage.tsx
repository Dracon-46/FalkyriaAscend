import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoryInput, penaltyRuleInput } from '@rpg/contracts';
import { PENALTY_TYPES, PENALTY_TYPE_LABELS, type CurveConfig, type GameConfig } from '@rpg/engine';
import type { z } from 'zod';
import { api } from '../../lib/api';
import { fmt, fmtDate, fmtDateTime } from '../../lib/format';
import type { Category, PenaltyRule, Settings, ThemeKey } from '../../lib/types';
import { useSession } from '../../app/session';
import { FormActions, useForm } from '../../components/forms';
import { Icon, ICON_NAMES } from '../../components/ui/Icon';
import { Modal, useConfirm } from '../../components/ui/Modal';
import { Badge, Button, Checkbox, EmptyState, Input, Loading, PageHeader, Panel, Select, Tabs, Textarea, cx } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';
import { THEME_META } from '../../theme/ThemeProvider';

type Tab = 'perfil' | 'aparencia' | 'painel' | 'notificacoes' | 'penalidades' | 'progressao' | 'integracoes' | 'dados';

function useSaveSettings() {
  const toast = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.put<Settings>('/api/settings', patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Configurações salvas');
    },
    onError: (e) => toast.error(e),
  });
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) ?? 'perfil';
  return (
    <>
      <PageHeader title="Configurações" icon="settings" subtitle="Perfil, aparência, regras de penalidade, progressão, integrações e dados." />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ aba: t }, { replace: true })}
        tabs={[
          { value: 'perfil', label: 'Perfil', icon: 'user' },
          { value: 'aparencia', label: 'Aparência', icon: 'sparkles' },
          { value: 'painel', label: 'Painel', icon: 'dashboard' },
          { value: 'notificacoes', label: 'Notificações', icon: 'bell' },
          { value: 'penalidades', label: 'Penalidades e proteção', icon: 'shield' },
          { value: 'progressao', label: 'Progressão', icon: 'trending-up' },
          { value: 'integracoes', label: 'Integrações', icon: 'refresh' },
          { value: 'dados', label: 'Dados e privacidade', icon: 'database' },
        ]}
      />
      {tab === 'perfil' && <ProfileTab />}
      {tab === 'aparencia' && <AppearanceTab />}
      {tab === 'painel' && <DashboardTab />}
      {tab === 'notificacoes' && <NotificationsTab />}
      {tab === 'penalidades' && <PenaltiesTab />}
      {tab === 'progressao' && <ProgressionTab />}
      {tab === 'integracoes' && <IntegrationsTab />}
      {tab === 'dados' && <DataTab />}
    </>
  );
}

// ------------------------------------------------------------------ Perfil

function ProfileTab() {
  const me = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [p, setP] = useState({ displayName: me.user.displayName, characterClass: me.user.characterClass ?? '', bio: me.user.bio ?? '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const save = useMutation({
    mutationFn: () => api.put('/api/profile', { ...p, characterClass: p.characterClass || null, bio: p.bio || null }),
    onSuccess: () => {
      toast.success('Perfil atualizado');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });
  const change = useMutation({
    mutationFn: () => api.post('/api/auth/password', pw),
    onSuccess: () => {
      toast.success('Senha alterada. As outras sessões foram encerradas.');
      setPw({ currentPassword: '', newPassword: '' });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Perfil do personagem" icon="user">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input label="Nome" value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} maxLength={80} />
          <Input label="Classe" value={p.characterClass} onChange={(e) => setP({ ...p, characterClass: e.target.value })} placeholder="Ex.: Monge de Ferro" maxLength={60} />
          <Textarea label="Biografia" value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} rows={3} maxLength={500} />
          <p className="text-sm text-faint">E-mail: {me.user.email} · conta criada em {fmtDateTime(me.user.createdAt)}</p>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={save.isPending}>
              Salvar perfil
            </Button>
          </div>
        </form>
      </Panel>
      <Panel title="Senha" icon="lock">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate();
          }}
        >
          <Input label="Senha atual" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          <Input label="Nova senha" type="password" autoComplete="new-password" hint="Mínimo de 10 caracteres." value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          <div className="flex justify-end">
            <Button type="submit" loading={change.isPending} disabled={pw.newPassword.length < 10 || !pw.currentPassword}>
              Alterar senha
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ Aparência

function ThemePreview({ theme }: { theme: Exclude<ThemeKey, 'custom'> }) {
  return (
    <div data-theme={theme} className="pointer-events-none overflow-hidden rounded-[var(--radius)] border border-line" style={{ background: 'var(--page-bg)' }} aria-hidden="true">
      <div className="p-3" style={{ fontFamily: 'var(--font-body)', color: 'var(--text)' }}>
        <div className="panel !p-3">
          <p className="panel-title !mb-2">Status</p>
          <div className="flex items-center gap-2">
            <span className="num text-2xl text-accent">18</span>
            <div className="flex-1">
              <div className="bar bar-xp">
                <span style={{ width: '62%' }} />
              </div>
              <p className="mt-1 text-[0.65rem] text-muted">930 / 1.490 XP</p>
            </div>
          </div>
          <div className="mt-2 flex gap-1">
            <span className="btn btn-primary btn-sm !min-h-0 !py-0.5">Concluir</span>
            <span className="btn btn-secondary btn-sm !min-h-0 !py-0.5">Detalhes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const me = useSession();
  const save = useSaveSettings();
  const s = me.settings;
  const [custom, setCustom] = useState(s.customTheme ?? { base: 'medieval' as const, accent: '#c9a84c', accent2: '#9e2b25', effects: 1 });
  return (
    <div className="space-y-4">
      <Panel title="Tema visual" icon="sparkles">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(['medieval', 'vampire', 'angel', 'system'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={s.theme === t}
              onClick={() => save.mutate({ theme: t })}
              className={cx('rounded-[var(--radius)] border p-2 text-left transition-colors', s.theme === t ? 'border-accent' : 'border-line hover:border-line-strong')}
            >
              <ThemePreview theme={t} />
              <p className="mt-2 flex items-center justify-between font-display">
                {THEME_META[t].label}
                {s.theme === t && <Icon name="check" size={16} className="text-accent" />}
              </p>
              <p className="text-xs text-muted">{THEME_META[t].description}</p>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Tema personalizado" icon="pencil">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Base" value={custom.base} onChange={(e) => setCustom({ ...custom, base: e.target.value as typeof custom.base })} options={(['medieval', 'vampire', 'angel', 'system'] as const).map((t) => ({ value: t, label: THEME_META[t].label }))} />
          <Input label="Cor de destaque" type="color" value={custom.accent} onChange={(e) => setCustom({ ...custom, accent: e.target.value })} className="!h-10 !p-1" />
          <Input label="Cor secundária" type="color" value={custom.accent2} onChange={(e) => setCustom({ ...custom, accent2: e.target.value })} className="!h-10 !p-1" />
          <div>
            <label className="field-label" htmlFor="fx">
              Intensidade dos efeitos: {Math.round(custom.effects * 100)}%
            </label>
            <input id="fx" type="range" min={0} max={1} step={0.05} value={custom.effects} onChange={(e) => setCustom({ ...custom, effects: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </div>
        </div>
        <p className="mt-2 text-xs text-faint">Garanta contraste suficiente entre a cor de destaque e o fundo do tema base.</p>
        <div className="mt-3 flex justify-end">
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ theme: 'custom', customTheme: custom })}>
            Aplicar tema personalizado
          </Button>
        </div>
      </Panel>
      <Panel title="Movimento e animações" icon="zap">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['system', 'Seguir o sistema'],
              ['on', 'Reduzir animações'],
              ['off', 'Animações completas'],
            ] as const
          ).map(([v, label]) => (
            <Button key={v} variant={s.reducedMotion === v ? 'primary' : 'secondary'} onClick={() => save.mutate({ reducedMotion: v })}>
              {label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-sm text-faint">Com movimento reduzido, efeitos de subida de nível, brilhos e transições são desativados ou minimizados.</p>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ Painel

const WIDGET_LABELS: Record<string, string> = {
  character: 'Personagem',
  alerts: 'Alertas',
  today: 'Missões de hoje',
  habits: 'Hábitos do dia',
  weekly: 'Missões da semana',
  radar: 'Radar de atributos',
  xp_chart: 'XP e moedas',
  effort: 'Esforço por área',
  goals: 'Metas prioritárias',
  streaks: 'Sequências',
  season: 'Temporada',
  recent: 'Recompensas recentes',
  achievements: 'Próximas conquistas',
  records: 'Recordes',
};

function DashboardTab() {
  const me = useSession();
  const save = useSaveSettings();
  const current = me.settings.dashboardWidgets;
  const initial = Object.keys(WIDGET_LABELS).map((id) => current?.widgets.find((w) => w.id === id) ?? { id, visible: true });
  const ordered = [...initial].sort((a, b) => {
    const ia = current?.widgets.findIndex((w) => w.id === a.id) ?? -1;
    const ib = current?.widgets.findIndex((w) => w.id === b.id) ?? -1;
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const [widgets, setWidgets] = useState(ordered);
  const [periodDays, setPeriod] = useState(current?.periodDays ?? 30);
  const move = (i: number, d: -1 | 1) => {
    const next = [...widgets];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setWidgets(next);
  };
  return (
    <Panel title="Widgets do painel" icon="dashboard">
      <p className="mb-3 text-sm text-muted">Escolha quais informações aparecem, em que ordem e o período padrão dos gráficos.</p>
      <ul className="divide-y divide-line">
        {widgets.map((w, i) => (
          <li key={w.id} className="flex items-center gap-2 py-1.5">
            <Checkbox label={WIDGET_LABELS[w.id] ?? w.id} checked={w.visible} onChange={(v) => setWidgets(widgets.map((x) => (x.id === w.id ? { ...x, visible: v } : x)))} />
            <span className="flex-1" />
            <Button size="sm" variant="ghost" icon="chevrons-up" aria-label="Mover para cima" disabled={i === 0} onClick={() => move(i, -1)} />
            <Button size="sm" variant="ghost" icon="chevron-down" aria-label="Mover para baixo" disabled={i === widgets.length - 1} onClick={() => move(i, 1)} />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <Select label="Período dos gráficos" className="!w-48" value={String(periodDays)} onChange={(e) => setPeriod(Number(e.target.value))} options={[7, 14, 30, 60, 90].map((d) => ({ value: String(d), label: `${d} dias` }))} />
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ dashboardWidgets: { widgets, periodDays } })}>
          Salvar painel
        </Button>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ Notificações

function NotificationsTab() {
  const me = useSession();
  const save = useSaveSettings();
  const meta = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ categories: Record<string, string> }>('/api/notifications') });
  const prefs = me.settings.notificationPrefs ?? { categories: {} };
  const [cats, setCats] = useState<Record<string, boolean>>(prefs.categories);
  const [quiet, setQuiet] = useState({ start: prefs.quietStart ?? '', end: prefs.quietEnd ?? '' });
  if (meta.isLoading) return <Loading />;
  return (
    <Panel title="Notificações internas" icon="bell">
      <p className="mb-3 text-sm text-muted">Mensagens objetivas, sem culpa. Desative o que não for útil para você.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(meta.data?.categories ?? {}).map(([k, label]) => (
          <Checkbox key={k} label={label} checked={cats[k] !== false} onChange={(v) => setCats({ ...cats, [k]: v })} />
        ))}
      </div>
      <div className="mt-4 grid max-w-md gap-3 sm:grid-cols-2">
        <Input label="Silêncio a partir de" type="time" value={quiet.start} onChange={(e) => setQuiet({ ...quiet, start: e.target.value })} />
        <Input label="Silêncio até" type="time" value={quiet.end} onChange={(e) => setQuiet({ ...quiet, end: e.target.value })} />
      </div>
      <p className="mt-2 text-xs text-faint">O horário silencioso fica registrado para notificações push futuras; as notificações internas não interrompem.</p>
      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          loading={save.isPending}
          onClick={() => save.mutate({ notificationPrefs: { categories: cats, ...(quiet.start ? { quietStart: quiet.start } : {}), ...(quiet.end ? { quietEnd: quiet.end } : {}) } })}
        >
          Salvar notificações
        </Button>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ Penalidades, proteção e categorias

function PenaltiesTab() {
  const me = useSession();
  const save = useSaveSettings();
  const s = me.settings;
  const [protect, setProtect] = useState({ suspendedUntil: s.penaltiesSuspendedUntil ?? '', recoveryUntil: s.recoveryModeUntil ?? '' });
  return (
    <div className="space-y-4">
      <Panel title="Proteções" icon="shield">
        <div className="space-y-3">
          <Checkbox label="Penalidades habilitadas" hint="Desligado: falhas continuam registradas, mas nenhuma consequência é aplicada." checked={s.penaltiesEnabled} onChange={(v) => save.mutate({ penaltiesEnabled: v })} />
          <Checkbox
            label="Permitir perda de XP de habilidade"
            hint="Opcional e limitado por ocorrência. O XP vitalício e o nível geral nunca diminuem por falhas."
            checked={s.allowSkillXpPenalty}
            onChange={(v) => save.mutate({ allowSkillXpPenalty: v })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Suspender penalidades até"
              type="date"
              value={protect.suspendedUntil}
              onChange={(e) => setProtect({ ...protect, suspendedUntil: e.target.value })}
              hint="Falhas são registradas e quebram sequências, mas sem consequências."
            />
            <Input
              label="Modo de recuperação até"
              type="date"
              value={protect.recoveryUntil}
              onChange={(e) => setProtect({ ...protect, recoveryUntil: e.target.value })}
              hint="Dias não cumpridos são dispensados: sem falha, sem penalidade, sem quebrar sequências."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => {
              setProtect({ suspendedUntil: '', recoveryUntil: '' });
              save.mutate({ penaltiesSuspendedUntil: null, recoveryModeUntil: null });
            }}>
              Limpar
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ penaltiesSuspendedUntil: protect.suspendedUntil || null, recoveryModeUntil: protect.recoveryUntil || null })}>
              Salvar proteções
            </Button>
          </div>
          <p className="text-xs text-faint">Para doença, lesão, viagem ou descanso planejado em datas específicas, registre uma indisponibilidade em Hábitos.</p>
        </div>
      </Panel>
      <PenaltyRulesPanel />
      <CategoriesPanel />
    </div>
  );
}

type RuleInput = z.input<typeof penaltyRuleInput>;

function PenaltyRulesPanel() {
  const q = useQuery({ queryKey: ['penalty-rules'], queryFn: () => api.get<PenaltyRule[]>('/api/penalty-rules') });
  const items = useQuery({ queryKey: ['items-lookup'], queryFn: () => api.get<Array<{ id: string; name: string }>>('/api/items') });
  const skills = useQuery({ queryKey: ['skills-lookup'], queryFn: () => api.get<Array<{ id: string; name: string }>>('/api/skills') });
  const [editing, setEditing] = useState<PenaltyRule | 'new' | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/penalty-rules/${id}`),
    onSuccess: () => {
      toast.success('Regra excluída');
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Panel title="Regras de penalidade" icon="skull" actions={<Button size="sm" icon="plus" onClick={() => setEditing('new')}>Nova regra</Button>}>
      <p className="mb-3 text-sm text-muted">
        Cada hábito ou missão escolhe exatamente quais regras se aplicam. Valor = base + passo × (falhas consecutivas − 1), limitado ao teto e aos limites diário/semanal globais; o saldo nunca fica negativo.
      </p>
      {q.isLoading ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Regra</th>
                <th>Tipo</th>
                <th>Base / passo / teto</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data!.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.name}
                    <p className="text-xs text-faint">{r.description}</p>
                  </td>
                  <td>{PENALTY_TYPE_LABELS[r.type]}</td>
                  <td className="num">
                    {r.baseAmount} / {r.escalationStep} / {r.maxAmount}
                    {r.durationDays ? ` · ${r.durationDays} d` : ''}
                    {r.reductionPct ? ` · −${Math.round(r.reductionPct * 100)}%` : ''}
                  </td>
                  <td>{r.active ? <Badge tone="success">Ativa</Badge> : <Badge>Inativa</Badge>}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" icon="pencil" aria-label="Editar" onClick={() => setEditing(r)} />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label="Excluir"
                      onClick={async () => {
                        const c = await confirm({ title: 'Excluir regra', message: `Excluir "${r.name}"? Ela deixa de valer para hábitos e missões vinculados. Penalidades já aplicadas permanecem no histórico.`, danger: true, confirmLabel: 'Excluir' });
                        if (c.ok) remove.mutate(r.id);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <RuleForm rule={editing === 'new' ? null : editing} items={items.data ?? []} skills={skills.data ?? []} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function RuleForm({ rule, items, skills, onClose }: { rule: PenaltyRule | null; items: Array<{ id: string; name: string }>; skills: Array<{ id: string; name: string }>; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const initial: RuleInput = rule
    ? { ...rule }
    : { name: '', description: '', type: 'coin_loss', baseAmount: 5, escalationStep: 5, maxAmount: 20, durationDays: null, reductionPct: null, targetItemId: null, targetSkillId: null, active: true };
  const form = useForm(penaltyRuleInput, initial);
  const v = form.values;
  const save = useMutation({
    mutationFn: (d: unknown) => (rule ? api.put(`/api/penalty-rules/${rule.id}`, d) : api.post('/api/penalty-rules', d)),
    onSuccess: () => {
      toast.success('Regra salva');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const amountLabel: Partial<Record<string, string>> = { coin_loss: 'moedas', skill_xp_loss: 'XP', reward_lock: 'dias de bloqueio', mission_progress: 'unidades', multiplier_reduction: 'dias' };
  return (
    <Modal open onClose={onClose} title={rule ? 'Editar regra' : 'Nova regra de penalidade'}>
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
        <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <Select label="Tipo" value={v.type} onChange={(e) => form.set('type', e.target.value as RuleInput['type'])} options={PENALTY_TYPES.map((t) => ({ value: t, label: PENALTY_TYPE_LABELS[t] }))} />
        {['coin_loss', 'skill_xp_loss', 'reward_lock', 'mission_progress'].includes(v.type) && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label={`Base (${amountLabel[v.type]})`} type="number" min={0} value={v.baseAmount ?? 0} onChange={(e) => form.set('baseAmount', Number(e.target.value))} />
            <Input label="Passo por falha seguida" type="number" min={0} value={v.escalationStep ?? 0} onChange={(e) => form.set('escalationStep', Number(e.target.value))} />
            <Input label="Teto" type="number" min={0} value={v.maxAmount ?? 0} onChange={(e) => form.set('maxAmount', Number(e.target.value))} error={form.errors.maxAmount} />
          </div>
        )}
        {v.type === 'multiplier_reduction' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Redução (0,01–0,5)" type="number" step={0.01} min={0} max={0.5} value={v.reductionPct ?? 0.05} onChange={(e) => form.set('reductionPct', Number(e.target.value))} />
            <Input label="Duração (dias)" type="number" min={1} max={30} value={v.durationDays ?? 3} onChange={(e) => form.set('durationDays', Number(e.target.value))} />
          </div>
        )}
        {v.type === 'reward_lock' && (
          <Select label="Recompensa bloqueada" value={v.targetItemId ?? ''} onChange={(e) => form.set('targetItemId', e.target.value || null)} placeholder="Selecione…" options={items.map((i) => ({ value: i.id, label: i.name }))} />
        )}
        {v.type === 'skill_xp_loss' && (
          <Select label="Habilidade afetada" value={v.targetSkillId ?? ''} onChange={(e) => form.set('targetSkillId', e.target.value || null)} placeholder="Selecione…" options={skills.map((i) => ({ value: i.id, label: i.name }))} />
        )}
        <Checkbox label="Regra ativa" checked={v.active ?? true} onChange={(c) => form.set('active', c)} />
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

type CategoryInput = z.input<typeof categoryInput>;

function CategoriesPanel() {
  const q = useQuery({ queryKey: ['categories-all'], queryFn: () => api.get<Category[]>('/api/categories?includeArchived=true') });
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const archive = useMutation({
    mutationFn: (c: Category) => api.post(`/api/categories/${c.id}/${c.archivedAt ? 'unarchive' : 'archive'}`),
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e) => toast.error(e),
  });
  return (
    <Panel title="Categorias (áreas da vida)" icon="compass" actions={<Button size="sm" icon="plus" onClick={() => setEditing('new')}>Nova categoria</Button>}>
      {q.isLoading ? (
        <Loading />
      ) : q.data!.length === 0 ? (
        <EmptyState title="Nenhuma categoria" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {q.data!.map((c) => (
            <li key={c.id} className={cx('flex items-center gap-2 rounded-[var(--radius-sm)] border border-line p-2', c.archivedAt && 'opacity-50')}>
              <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${c.color} 20%, transparent)`, color: c.color }}>
                <Icon name={c.icon} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{c.name}</p>
                {c.isBasicNeed && <p className="text-xs text-faint">necessidade básica · sem penalidades</p>}
              </div>
              <Button size="sm" variant="ghost" icon="pencil" aria-label="Editar" onClick={() => setEditing(c)} />
              <Button size="sm" variant="ghost" icon="archive" aria-label={c.archivedAt ? 'Desarquivar' : 'Arquivar'} onClick={() => archive.mutate(c)} />
            </li>
          ))}
        </ul>
      )}
      {editing && <CategoryForm category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function CategoryForm({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const form = useForm(categoryInput, (category ?? { name: '', description: '', color: '#c9a84c', icon: 'circle', isBasicNeed: false, sortOrder: 0 }) as CategoryInput);
  const v = form.values;
  const save = useMutation({
    mutationFn: (d: unknown) => (category ? api.put(`/api/categories/${category.id}`, d) : api.post('/api/categories', d)),
    onSuccess: () => {
      toast.success('Categoria salva');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal open onClose={onClose} title={category ? 'Editar categoria' : 'Nova categoria'} size="sm">
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
        <Input label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Cor" type="color" className="!h-10 !p-1" value={v.color ?? '#c9a84c'} onChange={(e) => form.set('color', e.target.value)} />
          <Select label="Ícone" value={v.icon ?? 'circle'} onChange={(e) => form.set('icon', e.target.value)} options={ICON_NAMES.map((n) => ({ value: n, label: n }))} />
        </div>
        <Checkbox label="Necessidade básica" hint="Sono, alimentação, descanso: podem ser registrados, mas nunca geram penalidade." checked={v.isBasicNeed ?? false} onChange={(c) => form.set('isBasicNeed', c)} />
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Progressão

interface ConfigResponse {
  active: { version: number; config: GameConfig };
  defaults: GameConfig;
  versions: Array<{ version: number; active: boolean; note: string | null; createdAt: string }>;
  curveTable: Array<{ level: number; required: number; cumulative: number }>;
}
interface Preview {
  currentLevel: number;
  newLevel: number;
  curveTable: Array<{ level: number; required: number; cumulative: number }>;
  simulations: Array<{ profile: string; xpPerDay: number; coinsPerDay: number; reached: Array<{ level: number; when: string }> }>;
}

function ProgressionTab() {
  const me = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config-full'], queryFn: () => api.get<ConfigResponse>('/api/config') });
  const [curve, setCurve] = useState<CurveConfig | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const isAdmin = me.user.role === 'admin';
  const candidate = (): unknown => {
    if (json !== null) return JSON.parse(json);
    return { ...q.data!.active.config, curves: { ...q.data!.active.config.curves, character: curve ?? q.data!.active.config.curves.character } };
  };
  const runPreview = useMutation({
    mutationFn: () => api.post<Preview>('/api/config/preview', { config: candidate() }),
    onSuccess: setPreview,
    onError: (e) => toast.error(e),
  });
  const publish = useMutation({
    mutationFn: () => api.put('/api/config', { config: candidate(), note }),
    onSuccess: () => {
      toast.success('Nova versão publicada. Recompensas anteriores mantêm a versão em que foram concedidas.');
      setPreview(null);
      setNote('');
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e),
  });
  if (q.isLoading || !q.data) return <Loading />;
  const c = curve ?? q.data.active.config.curves.character;
  const setNum = (k: string, v: number) => setCurve({ ...(c as Record<string, unknown>), [k]: v } as CurveConfig);
  return (
    <div className="space-y-4">
      <Panel title={`Curva de XP (versão ${q.data.active.version})`} icon="trending-up">
        <p className="mb-3 text-sm text-muted">
          XP necessário para o nível n = arredondar(A · n<sup>p</sup> + B). O nível é sempre derivado do XP vitalício; o XP nunca é "gasto" ao subir de nível. Mudanças criam uma nova versão auditada e são pré-visualizadas por simulação antes de publicar.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Select
            label="Modelo"
            value={c.kind}
            onChange={(e) => {
              const k = e.target.value;
              setCurve(
                k === 'power'
                  ? { kind: 'power', A: 13, p: 1.6, B: 45, maxLevel: 999 }
                  : k === 'exponential'
                    ? { kind: 'exponential', base: 150, growth: 1.06, maxLevel: 999 }
                    : { kind: 'hybrid', A: 13, p: 1.6, B: 45, knee: 40, growth: 1.01, maxLevel: 999 },
              );
            }}
            options={[
              { value: 'power', label: 'Potência (recomendado)' },
              { value: 'exponential', label: 'Exponencial' },
              { value: 'hybrid', label: 'Híbrido' },
            ]}
          />
          {c.kind !== 'exponential' && (
            <>
              <Input label="A (escala)" type="number" step="0.5" value={c.A} onChange={(e) => setNum('A', Number(e.target.value))} />
              <Input label="p (progressividade)" type="number" step="0.05" value={c.p} onChange={(e) => setNum('p', Number(e.target.value))} />
              <Input label="B (dificuldade inicial)" type="number" step="5" value={c.B} onChange={(e) => setNum('B', Number(e.target.value))} />
            </>
          )}
          {c.kind === 'exponential' && (
            <>
              <Input label="Base" type="number" value={c.base} onChange={(e) => setNum('base', Number(e.target.value))} />
              <Input label="Crescimento por nível" type="number" step="0.01" value={c.growth} onChange={(e) => setNum('growth', Number(e.target.value))} />
            </>
          )}
          {c.kind === 'hybrid' && (
            <>
              <Input label="Joelho (nível)" type="number" value={c.knee} onChange={(e) => setNum('knee', Number(e.target.value))} />
              <Input label="Crescimento após o joelho" type="number" step="0.005" value={c.growth} onChange={(e) => setNum('growth', Number(e.target.value))} />
            </>
          )}
        </div>
        <details className="mt-3" onToggle={(e) => (e.currentTarget.open ? setJson(JSON.stringify(q.data!.active.config, null, 2)) : setJson(null))}>
          <summary className="cursor-pointer text-sm text-muted">Editar configuração completa (recompensas, limites, consistência, penalidades) em JSON</summary>
          {json !== null && <Textarea className="mt-2 font-mono text-xs" rows={16} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} aria-label="Configuração JSON" />}
        </details>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon="play" loading={runPreview.isPending} onClick={() => runPreview.mutate()}>
            Simular
          </Button>
          <Button variant="ghost" onClick={() => setCurve(q.data!.defaults.curves.character)}>
            Restaurar curva padrão
          </Button>
        </div>
      </Panel>

      {preview && (
        <Panel title="Pré-visualização (não publicada)" icon="eye">
          <p className="text-sm">
            Seu nível atual: <span className="num text-accent">{preview.currentLevel}</span> → com a nova curva: <span className="num text-accent">{preview.newLevel}</span>
            {preview.newLevel < preview.currentLevel && <span className="text-warning"> (o nível exibido diminuiria; os níveis já alcançados permanecem registrados no histórico)</span>}
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <table className="table">
              <thead>
                <tr>
                  <th>Nível</th>
                  <th>XP para o nível</th>
                  <th>XP acumulado</th>
                </tr>
              </thead>
              <tbody>
                {preview.curveTable.map((r) => (
                  <tr key={r.level}>
                    <td className="num">{r.level}</td>
                    <td className="num">{fmt(r.required)}</td>
                    <td className="num">{fmt(r.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Perfil</th>
                    <th>XP/dia</th>
                    {preview.simulations[0]?.reached.map((r) => (
                      <th key={r.level}>Nv {r.level}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.simulations.map((s) => (
                    <tr key={s.profile}>
                      <td>{s.profile}</td>
                      <td className="num">{s.xpPerDay}</td>
                      {s.reached.map((r) => (
                        <td key={r.level} className="num text-xs">
                          {r.when}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-faint">Simulação de 10 anos com perfis de atividade fixos — estimativa, não promessa.</p>
            </div>
          </div>
          {isAdmin ? (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Input className="!w-96 max-w-full" label="Motivo da mudança (auditoria)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="primary" disabled={note.trim().length < 3} loading={publish.isPending} onClick={() => publish.mutate()}>
                Publicar nova versão
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-faint">Somente o administrador pode publicar mudanças na progressão.</p>
          )}
        </Panel>
      )}

      <Panel title="Versões" icon="history">
        <ul className="divide-y divide-line">
          {q.data.versions.map((v) => (
            <li key={v.version} className="flex items-center gap-3 py-2 text-sm">
              <span className="num">v{v.version}</span>
              {v.active && <Badge tone="success">Ativa</Badge>}
              <span className="flex-1 text-muted">{v.note}</span>
              <span className="text-xs text-faint">{fmtDateTime(v.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ Integrações

interface IntegrationState {
  provider: string;
  status: string;
  externalAccountId?: string | null;
  scopes?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  settings?: { weightUnit?: 'kg' | 'lb' };
  serverConfigured?: boolean;
}
interface IntegrationsResponse {
  encryptionConfigured: boolean;
  strava: IntegrationState;
  lyfta: IntegrationState;
  hevy: IntegrationState;
  events: Array<{ id: string; provider: string; eventType: string; externalId: string; status: string; error: string | null; receivedAt: string }>;
}

function IntegrationsTab() {
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => api.get<IntegrationsResponse>('/api/integrations') });
  const [params] = useSearchParams();
  if (q.isLoading || !q.data) return <Loading />;
  const d = q.data;
  return (
    <div className="space-y-4">
      {params.get('strava') && <p className="panel text-sm">Strava: {params.get('strava') === 'conectado' ? 'conta conectada.' : 'autorização negada.'}</p>}
      {!d.encryptionConfigured && (
        <p className="panel flex gap-2 text-sm text-warning">
          <Icon name="alert-triangle" className="shrink-0" /> O servidor não tem INTEGRATION_ENCRYPTION_KEY configurada: credenciais de integração não podem ser armazenadas.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <StravaCard s={d.strava} />
        <KeyCard provider="lyfta" title="Lyfta" s={d.lyfta} help="Gere a chave em my.lyfta.app/community/api (gratuita). Sem webhooks: a sincronização busca os treinos recentes. A unidade de peso não é documentada pela Lyfta — confirme abaixo." />
        <KeyCard provider="hevy" title="Hevy" s={d.hevy} help="Requer Hevy Pro. Gere a chave em hevy.com/settings?developer. A API é marcada pela Hevy como experimental." />
      </div>
      <ImportPanel />
      <Panel title="Eventos de integração" icon="history">
        {d.events.length === 0 ? (
          <p className="text-sm text-muted">Nenhum evento registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Origem</th>
                  <th>Evento</th>
                  <th>ID externo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {d.events.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDateTime(e.receivedAt)}</td>
                    <td>{e.provider}</td>
                    <td>{e.eventType}</td>
                    <td className="font-mono text-xs">{e.externalId}</td>
                    <td>
                      <Badge tone={e.status === 'error' ? 'danger' : e.status === 'processed' ? 'success' : 'muted'}>{e.status}</Badge>
                      {e.error && <p className="text-xs text-danger">{e.error}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function useSync(provider: string) {
  const toast = useToast();
  return useMutation({
    mutationFn: () => api.post<{ fetched: number; created: number; duplicates: number; errors: string[] }>(`/api/integrations/${provider}/sync`, { days: 14 }),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.fetched} encontrados, ${r.created} novos, ${r.duplicates} já existentes${r.errors.length ? `, ${r.errors.length} erro(s)` : ''}`);
      toast.reward(null, null);
    },
    onError: (e) => toast.error(e),
  });
}

function StatusLine({ s }: { s: IntegrationState }) {
  return (
    <div className="space-y-1 text-sm">
      <p>
        Estado: <Badge tone={s.status === 'connected' ? 'success' : s.status === 'error' ? 'danger' : 'muted'}>{s.status === 'connected' ? 'Conectado' : s.status === 'revoked' ? 'Desconectado' : s.status === 'disconnected' ? 'Não conectado' : s.status}</Badge>
      </p>
      {s.lastSyncAt && <p className="text-faint">Última sincronização: {fmtDateTime(s.lastSyncAt)}</p>}
      {s.lastError && <p className="text-danger">{s.lastError}</p>}
    </div>
  );
}

function StravaCard({ s }: { s: IntegrationState }) {
  const toast = useToast();
  const qc = useQueryClient();
  const sync = useSync('strava');
  const connect = useMutation({
    mutationFn: () => api.get<{ url: string }>('/api/integrations/strava/connect'),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e) => toast.error(e),
  });
  const disconnect = useMutation({ mutationFn: () => api.del('/api/integrations/strava'), onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }), onError: (e) => toast.error(e) });
  return (
    <Panel title="Strava" icon="footprints">
      <StatusLine s={s} />
      <p className="mt-2 text-xs text-faint">
        OAuth + webhook. Pela política da API do Strava (vigente desde 01/06/2026), dados do Strava não podem ser usados com IA, o cache é limitado e exclusões no Strava devem ser refletidas em até 48 h — o Ascend estorna a recompensa de atividades excluídas. Criar o app no Strava exige assinatura.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {s.status === 'connected' ? (
          <>
            <Button size="sm" icon="refresh" loading={sync.isPending} onClick={() => sync.mutate()}>
              Sincronizar 14 dias
            </Button>
            <Button size="sm" variant="danger" onClick={() => disconnect.mutate()}>
              Desconectar
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" disabled={!s.serverConfigured} loading={connect.isPending} onClick={() => connect.mutate()}>
            Conectar Strava
          </Button>
        )}
      </div>
      {!s.serverConfigured && <p className="mt-2 text-xs text-warning">STRAVA_CLIENT_ID/SECRET não configurados no servidor.</p>}
    </Panel>
  );
}

function KeyCard({ provider, title, s, help }: { provider: 'lyfta' | 'hevy'; title: string; s: IntegrationState; help: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const sync = useSync(provider);
  const connect = useMutation({
    mutationFn: () => api.post(`/api/integrations/${provider}/key`, { apiKey: key }),
    onSuccess: () => {
      toast.success(`${title} conectado`);
      setKey('');
      void qc.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (e) => toast.error(e),
  });
  const disconnect = useMutation({ mutationFn: () => api.del(`/api/integrations/${provider}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }) });
  const unit = useMutation({
    mutationFn: (weightUnit: 'kg' | 'lb') => api.put(`/api/integrations/${provider}/settings`, { weightUnit }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
    onError: (e) => toast.error(e),
  });
  return (
    <Panel title={title} icon="dumbbell">
      <StatusLine s={s} />
      <p className="mt-2 text-xs text-faint">{help}</p>
      {s.status === 'connected' ? (
        <div className="mt-3 space-y-2">
          {provider === 'lyfta' && (
            <Select label="Unidade de peso na Lyfta" value={s.settings?.weightUnit ?? 'kg'} onChange={(e) => unit.mutate(e.target.value as 'kg' | 'lb')} options={[{ value: 'kg', label: 'Quilogramas (kg)' }, { value: 'lb', label: 'Libras (lb)' }]} />
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon="refresh" loading={sync.isPending} onClick={() => sync.mutate()}>
              Sincronizar 14 dias
            </Button>
            <Button size="sm" variant="danger" onClick={() => disconnect.mutate()}>
              Desconectar
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            connect.mutate();
          }}
        >
          <Input type="password" placeholder="Chave de API" value={key} onChange={(e) => setKey(e.target.value)} aria-label={`Chave de API ${title}`} autoComplete="off" />
          <Button type="submit" size="sm" variant="primary" disabled={key.length < 10} loading={connect.isPending}>
            Conectar
          </Button>
        </form>
      )}
      <p className="mt-2 text-xs text-faint">A chave é cifrada (AES-256-GCM) no servidor e nunca volta para o navegador.</p>
    </Panel>
  );
}

function ImportPanel() {
  const toast = useToast();
  const [text, setText] = useState('');
  const m = useMutation({
    mutationFn: () => api.post<{ received: number; created: number; duplicates: number; errors: string[] }>('/api/import/activities', JSON.parse(text)),
    onSuccess: (r) => {
      toast.success(`Importação: ${r.created} novas, ${r.duplicates} duplicadas ignoradas${r.errors.length ? `, ${r.errors.length} erro(s)` : ''}`);
      toast.reward(null, null);
    },
    onError: (e) => toast.error(e instanceof SyntaxError ? new Error('JSON inválido') : e),
  });
  return (
    <Panel title="Importação manual de atividades (JSON)" icon="package">
      <p className="text-sm text-muted">Para exportações oficiais (ex.: arquivo de dados da Lyfta) convertidas em lista. Cada item precisa de um externalId único: reimportar o mesmo arquivo não gera recompensas duplicadas.</p>
      <Textarea
        className="mt-2 font-mono text-xs"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='[{"externalId":"run-2026-10-20","category":"run","date":"2026-10-20","durationMin":42,"distanceKm":7.5}]'
        aria-label="JSON de atividades"
        spellCheck={false}
      />
      <div className="mt-2 flex justify-end">
        <Button disabled={!text.trim()} loading={m.isPending} onClick={() => m.mutate()}>
          Importar
        </Button>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ Dados

function DataTab() {
  const me = useSession();
  const save = useSaveSettings();
  const toast = useToast();
  const [tz, setTz] = useState(me.settings.timezone);
  const [del, setDel] = useState({ password: '', confirm: '' });
  const remove = useMutation({
    mutationFn: () => api.post('/api/account/delete', del),
    onSuccess: () => {
      window.location.href = '/entrar';
    },
    onError: (e) => toast.error(e),
  });
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [tz];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Fuso horário" icon="clock">
        <p className="mb-2 text-sm text-muted">Define quando cada dia começa e termina para hábitos, prazos e limites diários. O dia anterior é fechado às 04:00, permitindo registros tardios.</p>
        <div className="flex gap-2">
          <Select value={tz} onChange={(e) => setTz(e.target.value)} options={zones.map((z) => ({ value: z, label: z }))} aria-label="Fuso horário" />
          <Button loading={save.isPending} onClick={() => save.mutate({ timezone: tz })}>
            Salvar
          </Button>
        </div>
        <p className="mt-2 text-xs text-faint">Último dia avaliado: {fmtDate(me.settings.lastEvaluatedDate)}</p>
      </Panel>
      <Panel title="Exportação e backup" icon="package">
        <p className="mb-3 text-sm text-muted">Baixe todos os seus dados (missões, hábitos, livro-razão, histórico, configurações) em JSON. Credenciais de integração nunca são exportadas. Backups completos do banco: ver docs/10-backup-e-recuperacao.md.</p>
        <a className="btn btn-secondary" href="/api/export" download>
          <Icon name="package" size={16} /> Exportar meus dados
        </a>
      </Panel>
      <Panel title="Excluir conta" icon="trash" className="lg:col-span-2">
        <p className="mb-3 text-sm text-muted">Remove permanentemente sua conta e todos os dados. Esta ação não pode ser desfeita — exporte antes se quiser guardar uma cópia.</p>
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          <Input label="Senha" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />
          <Input label='Digite "EXCLUIR" para confirmar' value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} />
        </div>
        <Button className="mt-3" variant="danger" icon="trash" disabled={del.confirm !== 'EXCLUIR' || !del.password} loading={remove.isPending} onClick={() => remove.mutate()}>
          Excluir conta definitivamente
        </Button>
      </Panel>
    </div>
  );
}
