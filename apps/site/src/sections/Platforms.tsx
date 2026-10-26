import { motion } from 'motion/react';
import { Download, Flame, Globe, Smartphone, Sparkles } from 'lucide-react';
import { Section, SectionHeader, Shield } from '../components';
import { APP_URL, APK_DOWNLOAD_URL } from '../data';

function PhoneScreen() {
  return (
    <div className="bg-base-100 text-base-content flex h-full w-full flex-col gap-3 p-4 pt-10">
      <div className="flex items-center gap-2">
        <Shield className="size-7" />
        <span className="font-display">Ascend</span>
        <span className="badge badge-primary badge-sm num ml-auto">Nv 12</span>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[11px] opacity-70">
          <span>Hoje</span>
          <span className="num">240 / 1.500 XP</span>
        </div>
        <progress className="progress progress-primary h-1.5" value={16} max={100} />
      </div>
      {['Leitura noturna', 'Treino de força', 'Revisão semanal'].map((h, i) => (
        <motion.div
          key={h}
          initial={{ x: 30, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + i * 0.15 }}
          className="bg-base-200 rounded-box flex items-center gap-2 p-2.5 text-sm"
        >
          {i === 0 ? <Flame className="text-secondary size-4" /> : <Sparkles className="text-primary size-4" />}
          <span>{h}</span>
          <input type="checkbox" className="checkbox checkbox-primary checkbox-xs ml-auto" defaultChecked={i < 2} aria-label={h} />
        </motion.div>
      ))}
      <p className="mt-auto text-center text-[10px] opacity-50">Tela ilustrativa</p>
    </div>
  );
}

export function Platforms() {
  return (
    <Section id="plataformas" className="bg-base-200/50 border-base-300 border-y">
      <div className="section grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeader eyebrow="Plataformas" title="No bolso e no navegador" />
          <ul className="-mt-6 space-y-5">
            <li className="flex gap-4" data-reveal>
              <Smartphone className="text-primary size-7 shrink-0" />
              <div>
                <h3 className="text-xl">App Android</h3>
                <p className="text-base-content/75">Instale o APK da última release. Atualizações do servidor chegam sem reinstalar.</p>
              </div>
            </li>
            <li className="flex gap-4" data-reveal>
              <Globe className="text-primary size-7 shrink-0" />
              <div>
                <h3 className="text-xl">Web e PWA</h3>
                <p className="text-base-content/75">Funciona em qualquer navegador e pode ser instalado na tela inicial, inclusive no iPhone.</p>
              </div>
            </li>
          </ul>
          <div className="mt-8 flex flex-wrap gap-3" data-reveal>
            <a href={APK_DOWNLOAD_URL} className="btn btn-primary gap-2">
              <Download className="size-5" /> Baixar APK
            </a>
            <a href={APP_URL} className="btn btn-ghost gap-2">
              <Globe className="size-5" /> Abrir no navegador
            </a>
          </div>
        </div>
        <div className="flex justify-center" data-reveal>
          <motion.div
            initial={{ rotate: -6, y: 40 }}
            whileInView={{ rotate: -3, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 60, damping: 14 }}
          >
            <div className="mockup-phone border-primary/40">
              <div className="mockup-phone-camera" />
              <div className="mockup-phone-display">
                <PhoneScreen />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </Section>
  );
}
