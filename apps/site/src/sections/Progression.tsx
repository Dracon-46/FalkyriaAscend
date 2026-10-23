import { useRef } from 'react';
import { Section, SectionHeader } from '../components';
import { dailyCaps, difficultyTable, highDifficultyRules, ranks, xpCurve } from '../data';
import { gsap, useGSAP } from '../lib/animation';

const W = 640;
const H = 300;
const PAD = { l: 56, r: 30, t: 22, b: 34 };
const maxXp = xpCurve[xpCurve.length - 1]!.xp;
const sx = (level: number) => PAD.l + ((level - 1) / 99) * (W - PAD.l - PAD.r);
const sy = (xp: number) => H - PAD.b - (xp / maxXp) * (H - PAD.t - PAD.b);
const path = xpCurve.map((p, i) => `${i ? 'L' : 'M'}${sx(p.level).toFixed(1)},${sy(p.xp).toFixed(1)}`).join(' ');
const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n));

const CAPS = [
  { label: 'Missões', value: dailyCaps.mission },
  { label: 'Hábitos', value: dailyCaps.habit },
  { label: 'Estudo', value: dailyCaps.study },
  { label: 'Treino', value: dailyCaps.training },
  { label: 'Registro rápido', value: dailyCaps.quick },
];

export function Progression() {
  const chart = useRef<SVGSVGElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const line = chart.current?.querySelector<SVGPathElement>('[data-curve]');
      if (!line) return;
      const len = line.getTotalLength();
      gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
      const st = { trigger: chart.current, start: 'top 75%', end: 'bottom 45%', scrub: 0.6 };
      gsap.to(line, { strokeDashoffset: 0, ease: 'none', scrollTrigger: st });
      gsap.from(chart.current!.querySelectorAll('[data-rank]'), { opacity: 0, scale: 0, transformOrigin: 'center', stagger: 0.1, scrollTrigger: st });
    });
    return () => mm.revert();
  });

  return (
    <Section id="progressao" className="section">
      <SectionHeader eyebrow="Progressão" title="Difícil de propósito. Justo sempre.">
        A curva foi escolhida por simulação com quatro perfis de jogador. Quem é consistente chega ao nível 100, o rank SS, em cerca de nove anos.
      </SectionHeader>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="card bg-base-200 border-base-300 border" data-reveal>
          <div className="card-body">
            <h3 className="card-title">XP acumulado por nível</h3>
            <svg
              ref={chart}
              viewBox={`0 0 ${W} ${H}`}
              className="mt-2 w-full"
              role="img"
              aria-label="Curva de XP acumulado do nível 1 ao 100 com os ranks marcados"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <g key={f}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={sy(maxXp * f)} y2={sy(maxXp * f)} stroke="currentColor" className="text-base-300" />
                  <text x={PAD.l - 8} y={sy(maxXp * f)} textAnchor="end" dominantBaseline="middle" className="num fill-current text-[11px] opacity-60">
                    {fmt(maxXp * f)}
                  </text>
                </g>
              ))}
              <path data-curve d={path} fill="none" stroke="var(--color-primary)" strokeWidth={3} strokeLinecap="round" />
              {ranks.map((r) => (
                <g key={r.code} data-rank>
                  <circle
                    cx={sx(r.minLevel)}
                    cy={sy(r.xp)}
                    r={r.code === 'SS' ? 7 : 5}
                    fill="var(--color-secondary)"
                    stroke="var(--color-base-200)"
                    strokeWidth={2}
                  />
                  <text x={sx(r.minLevel)} y={sy(r.xp) - 12} textAnchor="middle" className="num fill-current text-[11px] font-semibold">
                    {r.code}
                  </text>
                </g>
              ))}
              {[1, 25, 50, 75, 100].map((l) => (
                <text key={l} x={sx(l)} y={H - 10} textAnchor="middle" className="num fill-current text-[11px] opacity-60">
                  Nv {l}
                </text>
              ))}
            </svg>
            <ul className="mt-4 flex flex-wrap gap-2">
              {ranks.map((r) => (
                <li key={r.code} className="badge badge-outline gap-1" title={`A partir do nível ${r.minLevel}`}>
                  <span className="num font-semibold">{r.code}</span>
                  <span className="text-base-content/70">{r.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div className="card bg-base-200 border-base-300 border" data-reveal>
            <div className="card-body">
              <h3 className="card-title">Recompensa por dificuldade</h3>
              <table className="table-sm table">
                <thead>
                  <tr>
                    <th>Dificuldade</th>
                    <th className="text-right">XP</th>
                    <th className="text-right">Moedas</th>
                  </tr>
                </thead>
                <tbody>
                  {difficultyTable.map((d) => (
                    <tr key={d.id}>
                      <td>{d.label}</td>
                      <td className="num text-primary text-right">{d.xp}</td>
                      <td className="num text-accent text-right">{d.coins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-base-content/60 text-sm">
                Épica exige {highDifficultyRules.epic.minSpanDays} dias e {highDifficultyRules.epic.minObjectives} objetivos; Lendária,{' '}
                {highDifficultyRules.legendary.minSpanDays} dias e {highDifficultyRules.legendary.minObjectives} objetivos.
              </p>
            </div>
          </div>
          <div className="card bg-base-200 border-base-300 border" data-reveal>
            <div className="card-body">
              <h3 className="card-title">Limites diários de XP</h3>
              <ul className="space-y-2">
                {CAPS.map((c) => (
                  <li key={c.label}>
                    <div className="flex justify-between text-sm">
                      <span>{c.label}</span>
                      <span className="num">{c.value}</span>
                    </div>
                    <progress className="progress progress-primary h-1.5" value={c.value} max={dailyCaps.mission} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
