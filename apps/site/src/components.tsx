import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { animate, motion, useInView, useMotionValue, useTransform } from 'motion/react';
import { gsap, useGSAP } from './lib/animation';

/** Escudo do Ascend (mesmo desenho do ícone do app). */
export function Shield({ className, drawRef }: { className?: string; drawRef?: RefObject<SVGSVGElement | null> }) {
  return (
    <svg ref={drawRef} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="shield-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-primary)" />
        </linearGradient>
      </defs>
      <path
        data-draw
        d="M32 6 54 14v16c0 13-9.5 23-22 28C19.5 53 10 43 10 30V14Z"
        fill="none"
        stroke="url(#shield-gold)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle data-draw cx="32" cy="17" r="3" fill="url(#shield-gold)" />
      <path data-draw d="M20 37 32 25l12 12" fill="none" stroke="url(#shield-gold)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path data-draw d="M22 45 32 35l10 10" fill="none" stroke="var(--color-secondary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Número que conta até o valor quando entra na tela (Motion). */
export function NumberTicker({
  value,
  className,
  format = (n) => Math.round(n).toLocaleString('pt-BR'),
}: {
  value: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  const mv = useMotionValue(0);
  const text = useTransform(mv, format);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: 1.6, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [inView, mv, value]);
  return (
    <motion.span ref={ref} className={`num ${className ?? ''}`}>
      {text}
    </motion.span>
  );
}

/** Revela os filhos marcados com data-reveal quando a seção entra na tela (GSAP ScrollTrigger). */
export function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  const scope = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-reveal]', {
          y: 36,
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out',
          stagger: 0.08,
          scrollTrigger: { trigger: scope.current, start: 'top 78%' },
        });
      });
      return () => mm.revert();
    },
    { scope },
  );
  return (
    <section id={id} ref={scope} className={className}>
      {children}
    </section>
  );
}

export function SectionHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mx-auto mb-14 max-w-2xl text-center">
      <p className="eyebrow" data-reveal>
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl leading-tight font-semibold sm:text-4xl md:text-5xl" data-reveal>
        {title}
      </h2>
      {children && (
        <p className="text-base-content/75 mt-5 text-lg" data-reveal>
          {children}
        </p>
      )}
    </header>
  );
}

/** Card com brilho que segue o cursor (efeito spotlight, feito com Motion). */
export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const background = useTransform(
    [x, y],
    ([px, py]) => `radial-gradient(260px circle at ${px}px ${py}px, color-mix(in oklab, var(--color-primary) 16%, transparent), transparent 70%)`,
  );
  return (
    <motion.div
      className={`card bg-base-200 border-base-300 relative overflow-hidden border ${className ?? ''}`}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        x.set(-200);
        y.set(-200);
      }}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background }} />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

/** Marca do GitHub (o Lucide 1.x não inclui ícones de marca). */
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3" />
    </svg>
  );
}
