import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Coins, Flame, Lock, RotateCcw, Sparkles, Store, Target, Radar } from 'lucide-react';
import { Section, SectionHeader } from '../components';
import { ATTRIBUTES, DEFAULT_DIFFICULTY_HARD, SHOP_ITEMS } from '../data';

type Tab = 'missoes' | 'habitos' | 'atributos' | 'loja';
const TABS: { id: Tab; label: string; icon: typeof Target }[] = [
  { id: 'missoes', label: 'Missões', icon: Target },
  { id: 'habitos', label: 'Hábitos', icon: Flame },
  { id: 'atributos', label: 'Atributos', icon: Radar },
  { id: 'loja', label: 'Loja', icon: Store },
];

function MissionDemo() {
  const objectives = ['Estudar 5 h', 'Treinar 3 vezes', 'Cumprir 20 hábitos'];
  const [done, setDone] = useState<boolean[]>([true, true, false]);
  const complete = done.every(Boolean);
  return (
    <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
      <div>
        <h3 className="text-2xl">Missões com objetivos de verdade</h3>
        <p className="text-base-content/75 mt-3">
          Doze tipos, sete estados e objetivos que se calculam sozinhos a partir dos seus registros. A missão só conclui quando todos os obrigatórios estão
          cumpridos. Cancelar ou suspender exige motivo e nunca conta como falha.
        </p>
        <p className="text-base-content/60 mt-4 text-sm">Marque o último objetivo para concluir o exemplo.</p>
      </div>
      <div className="card bg-base-100 border-base-300 border shadow-xl">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <span className="badge badge-secondary">Semanal · Difícil</span>
            <AnimatePresence mode="wait">
              <motion.span
                key={complete ? 'ok' : 'run'}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                className={`badge ${complete ? 'badge-success' : 'badge-ghost'}`}
              >
                {complete ? 'Concluída' : 'Em andamento'}
              </motion.span>
            </AnimatePresence>
          </div>
          <h4 className="card-title mt-2">Semana de desenvolvimento</h4>
          <ul className="mt-2 space-y-2">
            {objectives.map((o, i) => (
              <li key={o}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm"
                    checked={done[i]}
                    onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
                  />
                  <span className={done[i] ? 'text-base-content/60 line-through' : ''}>{o}</span>
                </label>
              </li>
            ))}
          </ul>
          <AnimatePresence>
            {complete && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="alert alert-success mt-3"
              >
                <Sparkles className="size-5" />
                <span>
                  +{DEFAULT_DIFFICULTY_HARD.xp} XP e +{DEFAULT_DIFFICULTY_HARD.coins} moedas, uma única vez.
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {complete && (
            <button className="btn btn-ghost btn-xs mt-2 self-start" onClick={() => setDone([true, true, false])}>
              <RotateCcw className="size-3" /> Recomeçar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Padrão ilustrativo de 5 semanas: cumprido, tolerado (a 1ª falha da semana), falha e descanso.
const WEEKS = ['cccctcr', 'ccccccr', 'cccmccr', 'ccccccr', 'cccccc-'];
const CELL: Record<string, { cls: string; label: string }> = {
  c: { cls: 'bg-success', label: 'Cumprido' },
  t: { cls: 'bg-warning', label: 'Tolerado' },
  m: { cls: 'bg-error', label: 'Falhou' },
  r: { cls: 'bg-base-300', label: 'Descanso' },
  '-': { cls: 'bg-base-200 border border-base-300', label: 'Hoje' },
};

function HabitDemo() {
  return (
    <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
      <div>
        <h3 className="text-2xl">Hábitos com tolerância</h3>
        <p className="text-base-content/75 mt-3">
          Cada hábito tem sua sequência. A primeira falha da semana é tolerada; descanso e dias não programados não quebram nada. Marcos de 7, 30, 100 e 365
          dias dão bônus uma única vez.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          {Object.entries(CELL).map(([k, v]) => (
            <span key={k} className="flex items-center gap-2">
              <span className={`size-3 rounded-sm ${v.cls}`} />
              {v.label}
            </span>
          ))}
        </div>
      </div>
      <div className="card bg-base-100 border-base-300 border shadow-xl">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <h4 className="card-title">Leitura noturna</h4>
            <span className="badge badge-secondary gap-1">
              <Flame className="size-3" /> 14 seguidos
            </span>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1.5" role="img" aria-label="Exemplo de cinco semanas de um hábito">
            {WEEKS.join('')
              .split('')
              .map((c, i) => (
                <motion.span
                  key={i}
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.02, type: 'spring', stiffness: 400, damping: 20 }}
                  className={`aspect-square rounded ${CELL[c]!.cls}`}
                  title={CELL[c]!.label}
                />
              ))}
          </div>
          <p className="text-base-content/60 mt-3 text-sm">Exemplo ilustrativo.</p>
        </div>
      </div>
    </div>
  );
}

const ATTR_VALUES = [62, 48, 55, 81, 74, 58, 69, 44];

function RadarDemo() {
  const size = 280;
  const c = size / 2;
  const r = c - 34;
  const point = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / ATTRIBUTES.length - Math.PI / 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const;
  };
  const poly = ATTRIBUTES.map((_, i) => point(i, ATTR_VALUES[i]! / 100).join(',')).join(' ');
  return (
    <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
      <div>
        <h3 className="text-2xl">Atributos em teia de aranha</h3>
        <p className="text-base-content/75 mt-3">
          Cada atividade distribui XP entre os atributos pelos pesos dela: musculação alimenta Força, estudos alimentam Intelecto, hábitos cumpridos no dia
          alimentam Disciplina. Os atributos também são editáveis.
        </p>
      </div>
      <div className="card bg-base-100 border-base-300 border shadow-xl">
        <div className="card-body items-center">
          <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-xs" role="img" aria-label="Gráfico radar de atributos de exemplo">
            {[0.25, 0.5, 0.75, 1].map((s) => (
              <polygon key={s} points={ATTRIBUTES.map((_, i) => point(i, s).join(',')).join(' ')} fill="none" stroke="currentColor" className="text-base-300" />
            ))}
            {ATTRIBUTES.map((a, i) => {
              const [x, y] = point(i, 1.17);
              return (
                <text key={a.code} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="num fill-current text-[11px] opacity-70">
                  {a.code}
                </text>
              );
            })}
            <motion.polygon
              points={poly}
              initial={{ scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 90, damping: 14 }}
              style={{ transformOrigin: `${c}px ${c}px`, fill: 'color-mix(in oklab, var(--color-primary) 30%, transparent)', stroke: 'var(--color-primary)' }}
              strokeWidth={2}
            />
          </svg>
          <p className="text-base-content/60 text-sm">Exemplo ilustrativo.</p>
        </div>
      </div>
    </div>
  );
}

function ShopDemo() {
  const [coins] = useState(420);
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h3 className="text-2xl">Uma loja que é sua</h3>
          <p className="text-base-content/75 mt-3">
            O catálogo inicial abaixo é só sugestão: preço, nível mínimo, intervalo entre compras e limite são seus. Descanso e alimentação nunca devem ser
            itens pagos.
          </p>
        </div>
        <div className="stats bg-base-100 border-base-300 border">
          <div className="stat py-3">
            <div className="stat-title">Saldo de exemplo</div>
            <div className="stat-value text-accent num flex items-center gap-2 text-3xl">
              <Coins className="size-6" />
              {coins}
            </div>
          </div>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SHOP_ITEMS.map((it, i) => {
          const affordable = it.price <= coins;
          return (
            <motion.li
              key={it.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -3 }}
              className={`card bg-base-100 border-base-300 border ${affordable ? '' : 'opacity-70'}`}
            >
              <div className="card-body p-4">
                <p className="font-display leading-snug">{it.name}</p>
                <p className="text-base-content/60 text-sm">{it.rule}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="num text-accent flex items-center gap-1">
                    <Coins className="size-4" /> {it.price.toLocaleString('pt-BR')}
                  </span>
                  {affordable ? <Check className="text-success size-4" /> : <Lock className="text-base-content/50 size-4" />}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

export function Showcase() {
  const [tab, setTab] = useState<Tab>('missoes');
  return (
    <Section id="por-dentro" className="bg-base-200/50 border-base-300 border-y">
      <div className="section">
        <SectionHeader eyebrow="Por dentro" title="Feito para a vida real, não para um placar">
          Toque nas abas e brinque com os exemplos.
        </SectionHeader>
        <div role="tablist" className="tabs tabs-box bg-base-100 mx-auto mb-10 w-fit" data-reveal>
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab relative gap-2 ${tab === t.id ? 'text-primary-content' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {tab === t.id && (
                <motion.span
                  layoutId="tab-pill"
                  className="bg-primary absolute inset-0 rounded-[var(--radius-field)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <t.icon className="relative size-4" />
              <span className="relative hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {tab === 'missoes' && <MissionDemo />}
            {tab === 'habitos' && <HabitDemo />}
            {tab === 'atributos' && <RadarDemo />}
            {tab === 'loja' && <ShopDemo />}
          </motion.div>
        </AnimatePresence>
      </div>
    </Section>
  );
}
