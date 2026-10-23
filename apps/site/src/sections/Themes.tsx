import { motion } from 'motion/react';
import { Check, Coins } from 'lucide-react';
import { Section, SectionHeader } from '../components';
import { THEMES, type ThemeId } from '../data';

export function Themes({ theme, setTheme }: { theme: ThemeId; setTheme: (t: ThemeId) => void }) {
  return (
    <Section id="temas" className="section">
      <SectionHeader eyebrow="Temas" title="Escolha o mundo da sua campanha">
        Cores, tipografia e clima mudam por inteiro. Toque num tema para aplicá-lo a esta página; no app há ainda o tema Personalizado.
      </SectionHeader>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {THEMES.map((t) => {
          const active = t.id === theme;
          return (
            <motion.button
              key={t.id}
              data-reveal
              data-theme={t.id}
              onClick={() => setTheme(t.id)}
              whileHover={{ y: -6 }}
              whileTap={{ scale: 0.97 }}
              aria-pressed={active}
              className={`card bg-base-100 text-base-content border text-left shadow-lg transition-shadow ${active ? 'border-primary ring-primary/40 ring-4' : 'border-base-300'}`}
            >
              <div className="card-body gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="card-title font-display text-xl">{t.name}</h3>
                  {active && (
                    <motion.span layoutId="theme-check" className="badge badge-primary gap-1">
                      <Check className="size-3" /> Ativo
                    </motion.span>
                  )}
                </div>
                <p className="text-base-content/70 text-sm">{t.tagline}</p>
                <div className="bg-base-200 rounded-box mt-1 space-y-2 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display">Nível 12</span>
                    <span className="num text-accent flex items-center gap-1">
                      <Coins className="size-4" /> 420
                    </span>
                  </div>
                  <progress className="progress progress-primary h-1.5" value={64} max={100} />
                  <div className="flex gap-1.5">
                    <span className="badge badge-primary badge-xs">Missão</span>
                    <span className="badge badge-secondary badge-xs">Hábito</span>
                    <span className="badge badge-accent badge-xs">Loja</span>
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </Section>
  );
}
