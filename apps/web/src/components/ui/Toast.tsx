import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { errorMessage } from '../../lib/api';
import { fmt } from '../../lib/format';
import type { AfterAction, RewardOutcome } from '../../lib/types';

type Tone = 'success' | 'error' | 'info' | 'reward' | 'penalty';
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
const ICON: Record<Tone, string> = { success: 'check-circle', error: 'alert-triangle', info: 'info', reward: 'sparkles', penalty: 'skull' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levelUp, setLevelUp] = useState<number | null>(null);
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
      if (r?.levelUps?.length) setLevelUp(r.levelUps[r.levelUps.length - 1]!);
      for (const m of after?.autoCompletedMissions ?? []) push({ tone: 'success', title: `Missão concluída automaticamente: ${m}` });
      for (const a of after?.unlockedAchievements ?? []) push({ tone: 'reward', title: `Conquista desbloqueada: ${a}` });
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
        {toasts.map((t) => (
          <div key={t.id} className="panel animate-rise pointer-events-auto w-full max-w-sm py-3" role={t.tone === 'error' ? 'alert' : 'status'}>
            <div className="flex gap-2.5">
              <Icon
                name={ICON[t.tone]}
                className="mt-0.5 shrink-0"
                style={{
                  color: `var(--${t.tone === 'error' || t.tone === 'penalty' ? 'danger' : t.tone === 'reward' ? 'accent' : t.tone === 'success' ? 'success' : 'info'})`,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{t.title}</p>
                {t.body && <div className="text-sm text-muted">{t.body}</div>}
              </div>
              <button className="text-faint hover:text-fg" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} aria-label="Dispensar">
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {levelUp !== null && <LevelUpOverlay level={levelUp} onClose={() => setLevelUp(null)} />}
    </ToastContext.Provider>
  );
}

/** Anúncio de subida de nível. Respeita movimento reduzido (as animações são neutralizadas via CSS). */
function LevelUpOverlay({ level, onClose }: { level: number; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Nível ${level} alcançado`}
      onClick={onClose}
    >
      <div className="relative">
        <div
          className="animate-rays pointer-events-none absolute -inset-24 rounded-full opacity-40"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0 20deg, var(--accent) 20deg 24deg, transparent 24deg 60deg, var(--accent) 60deg 64deg, transparent 64deg 120deg, var(--accent) 120deg 124deg, transparent 124deg 200deg, var(--accent) 200deg 204deg, transparent 204deg 280deg, var(--accent) 280deg 284deg, transparent 284deg)',
            maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
          }}
        />
        <div className="panel animate-levelup relative px-10 py-8 text-center" style={{ boxShadow: 'var(--glow), var(--shadow)' }}>
          <p className="panel-title justify-center">Ascensão</p>
          <p className="font-display text-sm text-muted">Você alcançou o</p>
          <p className="num my-1 text-6xl text-accent">Nível {level}</p>
          <p className="text-sm text-muted">Novos marcos podem ter sido desbloqueados.</p>
          <button className="btn btn-primary mt-5" onClick={onClose} autoFocus>
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('ToastProvider ausente');
  return ctx;
}
