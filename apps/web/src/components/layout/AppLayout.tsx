import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { api } from '../../lib/api';
import { APP_NAME, COMPANY_NAME } from '../../lib/brand';
import { fmt, fmtDateTime } from '../../lib/format';
import { CountUp } from '../../lib/motion';
import type { Lookups } from '../../lib/types';
import { useSession } from '../../app/session';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { Button, Input, ProgressBar, Select, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';

export const NAV = [
  { to: '/', label: 'Painel', icon: 'dashboard', page: 'painel' },
  { to: '/personagem', label: 'Personagem', icon: 'user', page: 'personagem' },
  { to: '/missoes', label: 'Missões', icon: 'swords', page: 'missoes' },
  { to: '/metas', label: 'Metas', icon: 'target', page: 'metas' },
  { to: '/habitos', label: 'Hábitos', icon: 'flame', page: 'habitos' },
  { to: '/treinos', label: 'Treinos', icon: 'dumbbell', page: 'treinos' },
  { to: '/estudos', label: 'Estudos', icon: 'book-open', page: 'estudos' },
  { to: '/atributos', label: 'Atributos', icon: 'git-branch', page: 'atributos' },
  { to: '/conquistas', label: 'Conquistas', icon: 'trophy', page: 'conquistas' },
  { to: '/inventario', label: 'Inventário', icon: 'package', page: 'inventario' },
  { to: '/loja', label: 'Loja', icon: 'shopping-bag', page: 'loja' },
  { to: '/estatisticas', label: 'Estatísticas', icon: 'bar-chart', page: 'estatisticas' },
  { to: '/historico', label: 'Histórico', icon: 'history', page: 'historico' },
  { to: '/temporadas', label: 'Temporadas', icon: 'hourglass', page: 'temporadas' },
  { to: '/configuracoes', label: 'Configurações', icon: 'settings', page: 'configuracoes' },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="/icons/icon.svg" alt="" width={34} height={34} className="shrink-0" />
      <div className="leading-tight">
        <p className="font-display text-lg tracking-[0.2em] text-accent">{APP_NAME.toUpperCase()}</p>
        <p className="text-[0.65rem] tracking-[0.25em] text-faint uppercase">por {COMPANY_NAME}</p>
      </div>
    </div>
  );
}

function NavItems({ onNavigate, admin }: { onNavigate?: () => void; admin: boolean }) {
  const items = admin ? [...NAV, { to: '/admin', label: 'Administração', icon: 'database', page: 'admin' }] : NAV;
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-0.5">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-[0.95rem] transition-colors',
              isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-hover hover:text-fg',
            )
          }
        >
          <Icon name={n.icon} size={18} />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

function CharacterChip() {
  const me = useSession();
  const c = me.character;
  return (
    <NavLink
      to="/personagem"
      className="relative flex min-w-0 items-center gap-3 rounded-[var(--radius)] px-2 py-1 hover:bg-surface-hover"
      aria-label={`Nível ${c.level.level}, ${fmt(c.coins)} moedas`}
    >
      <div
        className="avatar-frame grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 font-display text-sm"
        style={{ borderColor: c.equipped.frame?.color ?? 'var(--border-strong)' }}
      >
        <m.span
          key={c.level.level}
          className="num text-accent"
          initial={{ scale: 1.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          {c.level.level}
        </m.span>
      </div>
      <XpGain totalXp={c.level.totalXp} />
      <div className="hidden min-w-0 sm:block">
        <p className="truncate text-sm">
          {c.name}
          {c.equipped.title && <span className="text-faint"> · {c.equipped.title}</span>}
        </p>
        <div className="flex items-center gap-2">
          <ProgressBar xp value={c.level.progress} className="w-28" label="Progresso do nível" />
          <span className="num text-xs text-faint">
            <CountUp value={c.level.xpIntoLevel} />/{fmt(c.level.xpForNextLevel)}
          </span>
        </div>
      </div>
      <span className="num ml-1 inline-flex items-center gap-1 text-sm" style={{ color: 'var(--coin)' }}>
        <Icon name="coins" size={15} />
        <CountUp value={c.coins} />
      </span>
    </NavLink>
  );
}

/** "+N XP" que sobe do avatar quando o XP vitalício aumenta (o valor vem sempre do servidor). */
function XpGain({ totalXp }: { totalXp: number }) {
  const previous = useRef(totalXp);
  const [gain, setGain] = useState<{ id: number; amount: number } | null>(null);

  useEffect(() => {
    const amount = totalXp - previous.current;
    previous.current = totalXp;
    if (amount <= 0) return;
    setGain({ id: totalXp, amount });
    const timer = setTimeout(() => setGain(null), 1600);
    return () => clearTimeout(timer);
  }, [totalXp]);

  return (
    <AnimatePresence>
      {gain && (
        <m.span
          key={gain.id}
          aria-hidden
          className="num pointer-events-none absolute top-0 left-4 text-xs font-semibold whitespace-nowrap"
          style={{ color: 'var(--xp)', textShadow: '0 0 8px var(--xp)' }}
          initial={{ opacity: 0, y: 4, scale: 0.8 }}
          animate={{ opacity: 1, y: -18, scale: 1 }}
          exit={{ opacity: 0, y: -30 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          +{fmt(gain.amount)} XP
        </m.span>
      )}
    </AnimatePresence>
  );
}

interface NotificationItem {
  id: string;
  category: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function Notifications({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ items: NotificationItem[] }>('/api/notifications'), enabled: open });
  const readAll = useMutation({
    mutationFn: () => api.post('/api/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Notificações"
      footer={
        <Button size="sm" onClick={() => readAll.mutate()}>
          Marcar todas como lidas
        </Button>
      }
    >
      {q.data?.items.length === 0 && <p className="text-muted">Nenhuma notificação ainda.</p>}
      <ul className="space-y-2">
        {q.data?.items.map((n) => (
          <li key={n.id}>
            <button
              className={cx('w-full rounded-[var(--radius)] border border-line p-3 text-left hover:bg-surface-hover', !n.readAt && 'border-accent/50')}
              onClick={() => {
                void api.post(`/api/notifications/${n.id}/read`).then(() => qc.invalidateQueries({ queryKey: ['me'] }));
                if (n.link) navigate(n.link);
                onClose();
              }}
            >
              <p className="text-sm">{n.title}</p>
              {n.body && <p className="text-xs text-muted">{n.body}</p>}
              <p className="mt-1 text-xs text-faint">{fmtDateTime(n.createdAt)}</p>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Registro rápido: um campo e um clique para tarefas cotidianas. */
export function QuickLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [attributeCode, setAttr] = useState('');
  const lookups = useQuery({ queryKey: ['lookups'], queryFn: () => api.get<Lookups>('/api/lookups'), enabled: open });
  const m = useMutation({
    mutationFn: () =>
      api.post<{ reward: Parameters<typeof toast.reward>[0]; after: Parameters<typeof toast.reward>[1] }>('/api/quick-log', {
        title,
        attributeCode: attributeCode || null,
      }),
    onSuccess: (r) => {
      toast.reward(r.reward, r.after, 'Tarefa registrada');
      setTitle('');
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registro rápido"
      size="sm"
      footer={
        <Button variant="primary" icon="check" loading={m.isPending} disabled={!title.trim()} onClick={() => m.mutate()}>
          Registrar
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) m.mutate();
        }}
        className="space-y-3"
      >
        <Input
          label="O que você fez?"
          placeholder="Ex.: lavar a louça, pagar contas"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          maxLength={160}
        />
        <Select
          label="Atributo (opcional)"
          value={attributeCode}
          onChange={(e) => setAttr(e.target.value)}
          placeholder="Disciplina (padrão)"
          options={(lookups.data?.attributes ?? []).map((a) => ({ value: a.code, label: `${a.name} (${a.code})` }))}
        />
        <p className="text-xs text-faint">
          Recompensa pequena e decrescente para repetições no mesmo dia, com limite diário. Para atividades maiores, use Missões, Estudos ou Treinos.
        </p>
      </form>
    </Modal>
  );
}

export function AppLayout() {
  const me = useSession();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [quick, setQuick] = useState(false);
  const [notes, setNotes] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    setDrawer(false);
    const item = [...NAV, { to: '/admin', page: 'admin' }].find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));
    if (item) void api.post('/api/visits', { page: item.page }).catch(() => undefined);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const logout = async () => {
    await api.post('/api/auth/logout');
    qc.clear();
    window.location.href = '/entrar';
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 btn btn-primary">
        Pular para o conteúdo
      </a>
      {/* Menu lateral (desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto border-r border-line bg-bg-2/70 px-3 py-5 backdrop-blur lg:flex">
        <Brand />
        <NavItems admin={me.user.role === 'admin'} />
        <div className="mt-auto space-y-1 px-1">
          {me.user.isDemo && (
            <p className="badge w-full justify-center" style={{ color: 'var(--warning)' }}>
              Conta de demonstração
            </p>
          )}
          <Button variant="ghost" icon="logout" className="w-full justify-start" onClick={logout}>
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/80 px-3 py-2 backdrop-blur sm:px-5">
          <div className="lg:hidden">
            <Button variant="ghost" icon="menu" aria-label="Abrir menu" onClick={() => setDrawer(true)} />
          </div>
          <div className="min-w-0 flex-1">
            <CharacterChip />
          </div>
          <Button variant="secondary" size="sm" icon="plus" className="hidden sm:inline-flex" onClick={() => setQuick(true)}>
            Registro rápido
          </Button>
          <div className="relative">
            <Button variant="ghost" icon="bell" aria-label={`Notificações (${me.unreadNotifications} não lidas)`} onClick={() => setNotes(true)} />
            {me.unreadNotifications > 0 && (
              <span className="num pointer-events-none absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-2 px-1 text-[0.6rem] text-white">
                {me.unreadNotifications > 9 ? '9+' : me.unreadNotifications}
              </span>
            )}
          </div>
        </header>

        <main id="conteudo" className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-28 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Navegação compacta (celular) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/95 backdrop-blur lg:hidden"
        aria-label="Navegação rápida"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {[
          { to: '/', icon: 'dashboard', label: 'Painel' },
          { to: '/missoes', icon: 'swords', label: 'Missões' },
        ].map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end
            className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[0.68rem]', isActive ? 'text-accent' : 'text-muted')}
          >
            <Icon name={n.icon} size={20} />
            {n.label}
          </NavLink>
        ))}
        <button className="flex flex-col items-center gap-0.5 py-2 text-[0.68rem] text-accent" onClick={() => setQuick(true)}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-on-accent" style={{ boxShadow: 'var(--glow)' }}>
            <Icon name="plus" size={20} />
          </span>
        </button>
        <NavLink
          to="/habitos"
          className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[0.68rem]', isActive ? 'text-accent' : 'text-muted')}
        >
          <Icon name="flame" size={20} />
          Hábitos
        </NavLink>
        <button className="flex flex-col items-center gap-0.5 py-2 text-[0.68rem] text-muted" onClick={() => setDrawer(true)}>
          <Icon name="more" size={20} />
          Mais
        </button>
      </nav>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="animate-rise absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r border-line bg-bg px-3 py-4">
            <div className="flex items-center justify-between">
              <Brand />
              <Button variant="ghost" icon="x" aria-label="Fechar menu" onClick={() => setDrawer(false)} />
            </div>
            <NavItems admin={me.user.role === 'admin'} onNavigate={() => setDrawer(false)} />
            <Button variant="ghost" icon="logout" className="justify-start" onClick={logout}>
              Sair
            </Button>
          </div>
        </div>
      )}
      <QuickLog open={quick} onClose={() => setQuick(false)} />
      <Notifications open={notes} onClose={() => setNotes(false)} />
    </div>
  );
}
