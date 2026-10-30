import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Coins, Download, Flame, Sparkles, Trophy } from 'lucide-react';
import { FalkyriaLogo, NumberTicker, Shield } from '../components';
import { APP_URL, ATTRIBUTES, APK_DOWNLOAD_URL, FALKYRIA_URL, rankOf, sampleCharacter } from '../data';
import { gsap, useGSAP } from '../lib/animation';

// Personagem de exemplo (4.380 XP): nível e progresso saem da curva real do motor.
const SAMPLE_ATTRS = [62, 48, 55, 81, 74, 58, 69, 44];

const EVENTS = [
  { icon: Sparkles, text: '+80 XP · missão Difícil concluída', tone: 'text-primary' },
  { icon: Coins, text: '+16 moedas', tone: 'text-accent' },
  { icon: Flame, text: 'Sequência de 7 dias: bônus', tone: 'text-secondary' },
  { icon: Trophy, text: 'Conquista: Primeiro passo', tone: 'text-success' },
];

function CharacterCard() {
  const state = sampleCharacter;
  const rank = rankOf(state.level);
  const [event, setEvent] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setEvent((e) => (e + 1) % EVENTS.length), 2600);
    return () => clearInterval(id);
  }, []);
  const ev = EVENTS[event]!;

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div
        data-ring
        aria-hidden
        className="absolute -inset-10 rounded-full opacity-60 blur-3xl"
        style={{ background: 'conic-gradient(from 0deg, var(--color-primary), var(--color-secondary), var(--color-accent), var(--color-primary))' }}
      />
      <div className="card bg-base-200/95 border-base-300 relative border shadow-2xl backdrop-blur" data-card>
        <div className="card-body gap-5">
          <div className="flex items-center gap-4">
            <div className="avatar avatar-placeholder">
              <div className="bg-base-300 ring-primary ring-offset-base-200 w-16 rounded-full ring-2 ring-offset-2">
                <Shield className="size-10" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-base-content/60 text-xs tracking-widest uppercase">Personagem de exemplo</p>
              <p className="font-display text-lg leading-tight">
                Rank {rank.code} · {rank.name}
              </p>
            </div>
            <div className="badge badge-primary badge-lg num ml-auto">Nv {state.level}</div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-base-content/70">XP do nível</span>
              <span className="num">
                <NumberTicker value={state.xpIntoLevel} /> / {state.xpForNextLevel.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="bg-base-300 h-3 overflow-hidden rounded-full">
              <div data-xp className="bg-primary h-full rounded-full" style={{ width: `${Math.round(state.progress * 100)}%` }} />
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-x-5 gap-y-2.5">
            {ATTRIBUTES.map((a, i) => (
              <li key={a.code} className="text-sm">
                <div className="flex justify-between">
                  <span className="text-base-content/75">{a.name}</span>
                  <span className="num text-base-content/60">{SAMPLE_ATTRS[i]}</span>
                </div>
                <progress data-attr className="progress progress-secondary h-1.5" value={SAMPLE_ATTRS[i]} max={100} />
              </li>
            ))}
          </ul>

          <div className="bg-base-300/60 relative h-11 overflow-hidden rounded-lg" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={event}
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -24, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                className="absolute inset-0 flex items-center gap-2 px-3 text-sm"
              >
                <ev.icon className={`size-4 shrink-0 ${ev.tone}`} />
                <span>{ev.text}</span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  const scope = useRef<HTMLElement>(null);
  const shieldRef = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const strokes = shieldRef.current?.querySelectorAll<SVGPathElement>('path[data-draw]') ?? [];
        strokes.forEach((p) => {
          const len = p.getTotalLength();
          gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
        });
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.to(strokes, { strokeDashoffset: 0, duration: 1.4, stagger: 0.2, ease: 'power2.inOut' })
          .from('[data-word]', { yPercent: 110, opacity: 0, duration: 0.9, stagger: 0.08 }, 0.3)
          .from('[data-hero-fade]', { y: 20, opacity: 0, duration: 0.8, stagger: 0.1 }, 0.9)
          .from('[data-card]', { y: 60, opacity: 0, rotateX: 12, duration: 1.1 }, 0.6)
          .from('[data-xp]', { width: 0, duration: 1.6, ease: 'expo.out' }, 1.2)
          .from('[data-attr]', { value: 0, duration: 1.2, stagger: 0.05 }, 1.3);
        gsap.to('[data-ring]', { rotate: 360, duration: 24, repeat: -1, ease: 'none' });
        gsap.to('[data-card]', {
          yPercent: -8,
          ease: 'none',
          scrollTrigger: { trigger: scope.current, start: 'top top', end: 'bottom top', scrub: true },
        });
      });
      return () => mm.revert();
    },
    { scope },
  );

  const title = ['Sua', 'vida', 'é', 'a', 'campanha.'];

  return (
    <section id="topo" ref={scope} className="glow relative overflow-hidden pt-28 pb-20 md:pt-36 md:pb-28">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0 text-center lg:text-left">
          <div className="mb-6 flex items-center justify-center gap-3 lg:justify-start">
            <Shield drawRef={shieldRef} className="size-14" />
            <a href={FALKYRIA_URL} target="_blank" rel="noopener noreferrer" className="badge badge-outline badge-primary gap-1.5" data-hero-fade>
              <FalkyriaLogo className="size-3.5" />
              Um produto Falkyria
            </a>
          </div>
          <h1 className="text-5xl leading-[1.05] font-semibold sm:text-6xl md:text-7xl">
            {title.map((w, i) => (
              <span key={i} className="inline-block overflow-hidden pb-2 align-bottom">
                <span data-word className={`inline-block ${w === 'campanha.' ? 'text-primary' : ''}`}>
                  {w}
                </span>
                {i < title.length - 1 && <span>&nbsp;</span>}
              </span>
            ))}
          </h1>
          <p className="text-base-content/80 mx-auto mt-6 max-w-xl text-xl lg:mx-0" data-hero-fade>
            O Ascend transforma missões, hábitos, estudos e treinos em XP, atributos, moedas e conquistas. Um RPG de longo prazo, com regras honestas e
            penalidades que nunca viram espiral.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3 lg:justify-start" data-hero-fade>
            <motion.a whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} href={APK_DOWNLOAD_URL} className="btn btn-primary btn-lg gap-2">
              <Download className="size-5" />
              Baixar para Android
            </motion.a>
            <motion.a whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} href="#como-funciona" className="btn btn-outline btn-lg gap-2">
              Como funciona
              <ArrowRight className="size-5" />
            </motion.a>
          </div>
          <p className="text-base-content/60 mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm lg:justify-start" data-hero-fade>
            Sem Android? O Ascend também roda no navegador e instala como app no iPhone.{' '}
            <a href={APP_URL} className="link link-hover">
              Abrir no navegador
            </a>
          </p>
        </div>
        <div className="min-w-0" style={{ perspective: 1200 }}>
          <CharacterCard />
        </div>
      </div>
    </section>
  );
}
