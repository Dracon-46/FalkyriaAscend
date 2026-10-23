import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { animate, domMax, LazyMotion, MotionConfig } from 'motion/react';
import { fmt } from './format';

/**
 * Movimento reduzido efetivo: a escolha do usuário (`data-motion` no <html>, definido pelo ThemeProvider)
 * vence a preferência do sistema. O CSS já neutraliza animações; isto faz o mesmo com as do Motion.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  media?.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', onChange);
  };
}

function reducedSnapshot(): boolean {
  const pref = document.documentElement.dataset.motion;
  if (pref === 'reduced') return true;
  if (pref === 'full') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function useReducedMotionPref(): boolean {
  return useSyncExternalStore(subscribe, reducedSnapshot, () => false);
}

/** Carrega os recursos do Motion uma vez e aplica a preferência de movimento a todas as animações. */
export function AppMotion({ children }: { children: ReactNode }) {
  const reduced = useReducedMotionPref();
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>
    </LazyMotion>
  );
}

/**
 * Número que conta até o novo valor quando ele muda (moedas, XP, nível).
 * Os valores intermediários são só visuais: use dentro de um elemento com `aria-label` ou `aria-hidden`.
 */
export function CountUp({ value, from, duration = 0.9, className }: { value: number; from?: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(from ?? value);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || shown.current === value) {
      shown.current = value;
      el.textContent = fmt(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        shown.current = Math.round(v);
        el.textContent = fmt(shown.current);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduced]);

  return (
    <span ref={ref} className={className}>
      {fmt(shown.current)}
    </span>
  );
}
