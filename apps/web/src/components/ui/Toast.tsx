import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { Icon } from './Icon';
import { errorMessage } from '../../lib/api';
import { fmt } from '../../lib/format';
import { CountUp } from '../../lib/motion';
import type { AfterAction, RewardOutcome } from '../../lib/types';

type Tone = 'success' | 'error' | 'info' | 'reward' | 'achievement' | 'penalty';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: ReactNode;
}

interface ToastApi {
  push: (t: Omit<Toast, 'id'>) => void;
  success: (title: string, body?: ReactNode) => void;
  error: (err: unknown, title?: string) => void;
  info: (title: string, body?: ReactNode) => void;
  /** Feedback padronizado de recompensa: XP, moedas, explicação, subida de nível e conquistas. */
  reward: (r: RewardOutcome | null | undefined, after?: AfterAction | null, label?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const ICON: Record<Tone, string> = {
  success: 'check-circle',
  error: 'alert-triangle',
  info: 'info',
  reward: 'sparkles',
  achievement: 'trophy',
  penalty: 'skull',
};
const COLOR: Record<Tone, string> = { success: 'success', error: 'danger', info: 'info', reward: 'accent', achievement: 'accent', penalty: 'danger' };
/** Recompensas e conquistas ganham entrada com destaque; o resto entra de forma discreta. */
const CELEBRATE = new Set<Tone>(['reward', 'achievement']);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null);
  const seq = useRef(0);
  const qc = useQueryClient();

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.tone === 'error' ? 7000 : 5000);
  }, []);

  const reward = useCallback<ToastApi['reward']>(
    (r, after, label) => {
      if (r && (r.xp !== 0 || r.coins !== 0)) {
        push({
          tone: 'reward',
          title: `${label ?? 'Recompensa'}: +${fmt(r.xp)} XP · +${fmt(r.coins)} moedas`,
          body: r.explanation?.length ? (
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {r.explanation.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          ) : undefined,
        });
      } else if (r && r.created === false) {
        push({ tone: 'info', title: 'Já registrado: nenhuma recompensa duplicada.' });
      }
      if (r?.levelUps?.length) setLevelUp({ from: r.levelUps[0]! - 1, to: r.levelUps[r.levelUps.length - 1]! });
      for (const m of after?.autoCompletedMissions ?? []) push({ tone: 'success', title: `Missão concluída automaticamente: ${m}` });
      for (const a of after?.unlockedAchievements ?? []) push({ tone: 'achievement', title: `Conquista desbloqueada: ${a}` });
      void qc.invalidateQueries();
    },
    [push, qc],
  );

  const api: ToastApi = {
    push,
    reward,
    success: (title, body) => push({ tone: 'success', title, body }),
    info: (title, body) => push({ tone: 'info', title, body }),
    error: (err, title) => push({ tone: 'error', title: title ?? errorMessage(err), body: title ? errorMessage(err) : undefined }),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-20 z-50 flex flex-col items-end gap-2 lg:bottom-6 lg:right-6 lg:left-auto" aria-live="polite">
        <AnimatePresence initial={false} mode="popLayout">
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={() => setToasts((l) => l.filter((x) => x.id !== t.id))} />
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {levelUp && <LevelUpOverlay key={levelUp.to} from={levelUp.from} level={levelUp.to} onClose={() => setLevelUp(null)} />}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast: t, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const celebrate = CELEBRATE.has(t.tone);
  return (
    <m.div
      layout
      initial={celebrate ? { opacity: 0, y: 24, scale: 0.9 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 420, damping: celebrate ? 22 : 32 }}
      className="panel pointer-events-auto relative w-full max-w-sm overflow-hidden py-3"
      style={celebrate ? { borderColor: 'var(--accent)' } : undefined}
      role={t.tone === 'error' ? 'alert' : 'status'}
    >
      {celebrate && (
        <m.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2"
          style={{ background: 'linear-gradient(100deg, transparent, color-mix(in srgb, var(--accent) 22%, transparent), transparent)' }}
          initial={{ x: 0 }}
          animate={{ x: '400%' }}
          transition={{ duration: 1.1, delay: 0.15, ease: 'easeOut' }}
        />
      )}
      <div className="relative flex gap-2.5">
        <span className="relative mt-0.5 shrink-0">
          <m.span
            className="block"
            initial={celebrate ? { scale: 0, rotate: -30 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.08 }}
          >
            <Icon name={ICON[t.tone]} style={{ color: `var(--${COLOR[t.tone]})` }} />
          </m.span>
          {celebrate && <Burst count={8} radius={20} size={4} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg">{t.title}</p>
          {t.body && <div className="text-sm text-muted">{t.body}</div>}
        </div>
        <button className="text-faint hover:text-fg" onClick={onDismiss} aria-label="Dispensar">
          <Icon name="x" size={15} />
        </button>
      </div>
    </m.div>
  );
}

/** Faíscas que saem do centro e somem. Puramente decorativas. */
function Burst({ count, radius, size, delay = 0.1 }: { count: number; radius: number; size: number; delay?: number }) {
  return (
    <span aria-hidden className="pointer-events-none absolute top-1/2 left-1/2">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const r = radius * (i % 2 ? 0.75 : 1);
        return (
          <m.span
            key={i}
            className="absolute rounded-full"
            style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, background: i % 3 ? 'var(--accent)' : 'var(--xp)' }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(angle) * r, y: Math.sin(angle) * r, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.8, delay, ease: [0.2, 0.8, 0.2, 1] }}
          />
        );
      })}
    </span>
  );
}

/** Anúncio de subida de nível. Com movimento reduzido, só o fade permanece. */
function LevelUpOverlay({ from, level, onClose }: { from: number; level: number; onClose: () => void }) {
  return (
    <m.div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Nível ${level} alcançado`}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      <div className="relative">
        <m.div
          aria-hidden
          className="pointer-events-none absolute -inset-24"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 0.4, scale: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        >
          <div
            className="animate-rays h-full w-full rounded-full"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0 20deg, var(--accent) 20deg 24deg, transparent 24deg 60deg, var(--accent) 60deg 64deg, transparent 64deg 120deg, var(--accent) 120deg 124deg, transparent 124deg 200deg, var(--accent) 200deg 204deg, transparent 204deg 280deg, var(--accent) 280deg 284deg, transparent 284deg)',
              maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
            }}
          />
        </m.div>
        <Burst count={18} radius={190} size={7} delay={0.25} />
        <m.div
          className="panel relative px-10 py-8 text-center"
          style={{ boxShadow: 'var(--glow), var(--shadow)' }}
          initial={{ opacity: 0, scale: 0.6, y: 24, filter: 'brightness(1.8)' }}
          animate={{ opacity: 1, scale: 1, y: 0, filter: 'brightness(1)' }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <p className="panel-title justify-center">Ascensão</p>
          <p className="font-display text-sm text-muted">Você alcançou o</p>
          <m.p
            className="num my-1 text-6xl text-accent"
            initial={{ scale: 0.7 }}
            animate={{ scale: [0.7, 1.15, 1] }}
            transition={{ duration: 0.9, delay: 0.2, times: [0, 0.6, 1] }}
          >
            Nível <CountUp from={from} value={level} duration={0.8} />
          </m.p>
          <p className="text-sm text-muted">Novos marcos podem ter sido desbloqueados.</p>
          <m.button
            className="btn btn-primary mt-5"
            onClick={onClose}
            autoFocus
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            Continuar
          </m.button>
        </m.div>
      </div>
    </m.div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('ToastProvider ausente');
  return ctx;
}
