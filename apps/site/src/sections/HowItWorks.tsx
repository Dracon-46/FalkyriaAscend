import { useRef } from 'react';
import { Coins, ScrollText, Sparkles, TrendingUp } from 'lucide-react';
import { Section, SectionHeader, SpotlightCard } from '../components';
import { gsap, useGSAP } from '../lib/animation';

const STEPS = [
  {
    icon: ScrollText,
    title: 'Registre o que você faz',
    text: 'Missões com objetivos, hábitos com agenda, sessões de estudo e treinos. Ou importe do Strava, Lyfta e Hevy.',
  },
  {
    icon: Sparkles,
    title: 'Ganhe XP pelo esforço real',
    text: 'A recompensa vem da dificuldade e do tempo efetivo, com limites diários e retornos decrescentes. Repetir o trivial não infla nada.',
  },
  {
    icon: TrendingUp,
    title: 'Evolua nível, atributos e maestria',
    text: 'Oito atributos (Força, Intelecto, Disciplina…) e uma árvore de habilidades crescem com o que você realmente pratica.',
  },
  {
    icon: Coins,
    title: 'Troque moedas por recompensas suas',
    text: 'Você define a loja: um episódio de série, um jantar especial, uma compra planejada. Itens grandes exigem meses de consistência.',
  },
];

export function HowItWorks() {
  const line = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        line.current,
        { scaleX: 0 },
        { scaleX: 1, ease: 'none', scrollTrigger: { trigger: line.current, start: 'top 80%', end: 'top 35%', scrub: true } },
      );
    });
    return () => mm.revert();
  });

  return (
    <Section id="como-funciona" className="section">
      <SectionHeader eyebrow="Como funciona" title="Cada dia vira progresso mensurável">
        Um ciclo simples, com regras que você entende e pode ajustar.
      </SectionHeader>
      <div className="relative">
        <div
          ref={line}
          aria-hidden
          className="from-primary via-secondary to-accent absolute top-10 right-8 left-8 hidden h-px origin-left bg-gradient-to-r lg:block"
        />
        <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} data-reveal>
              <SpotlightCard className="h-full">
                <div className="card-body">
                  <div className="flex items-center gap-3">
                    <span className="bg-primary text-primary-content num grid size-10 place-items-center rounded-full font-semibold">{i + 1}</span>
                    <s.icon className="text-primary size-6" />
                  </div>
                  <h3 className="card-title mt-3 text-xl">{s.title}</h3>
                  <p className="text-base-content/75">{s.text}</p>
                </div>
              </SpotlightCard>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
