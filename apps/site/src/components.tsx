import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
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

/** Logo da Falkyria. O corpo usa a cor do texto (acompanha o tema); o olho mantém o azul da marca. */
export function FalkyriaLogo({ className }: { className?: string }) {
  const mask = useId();
  return (
    <svg viewBox="40 0 480 500" className={className} aria-hidden="true">
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="600">
        <rect width="600" height="600" fill="#fff" />
        <g fill="#000">
          <polygon points="254,118 278,118 233.6,340 209.6,340" />
          <polygon points="254,118 560,35.4 560,59.4 254,142" />
          <polygon points="235.2,212 560,124.3 560,148.3 235.2,236" />
        </g>
      </mask>
      <path
        d="M54 198L58 160Q66 130 100 112Q120 102 150 96L205 100L300 74L400 42L504 14L486 58L492 84L452 150L460 178L410 232Q362 268 318 302Q284 336 272 392L238 494L184 412Q138 300 118 212L100 178Q84 166 70 176Z"
        fill="currentColor"
        mask={`url(#${mask})`}
      />
      <polygon points="118,130 158,120 148,139 124,142" fill="#00A6FF" />
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
