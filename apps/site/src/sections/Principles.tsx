import { Bed, HeartPulse, Scale, ShieldCheck } from 'lucide-react';
import { Section, SectionHeader, SpotlightCard } from '../components';

const ITEMS = [
  {
    icon: ShieldCheck,
    title: 'XP e nível nunca caem',
    text: 'Falhas pesam em moedas, sequências ou acesso à loja. O progresso vitalício é seu e não volta atrás.',
  },
  {
    icon: Scale,
    title: 'Penalidade com teto',
    text: 'Multas crescem com falhas seguidas, mas param em 40 moedas por dia, 150 por semana e no máximo 50% do que você ganhou na semana.',
  },
  {
    icon: HeartPulse,
    title: 'Necessidade básica não é punida',
    text: 'Sono, alimentação e saúde podem ser acompanhados, mas nunca viram dívida. O sistema recusa penalidade nesses hábitos.',
  },
  {
    icon: Bed,
    title: 'A vida acontece',
    text: 'Doença, viagem ou semana pesada: registre indisponibilidade ou ative o modo de recuperação. A falha fica no histórico, sem consequência.',
  },
];

export function Principles() {
  return (
    <Section className="bg-base-200/50 border-base-300 border-y">
      <div className="section">
        <SectionHeader eyebrow="Penalidades justas" title="Consequência, sem espiral de punição">
          Um jogo que castiga demais vira abandono. O Ascend foi calibrado para cobrar com firmeza e deixar você voltar.
        </SectionHeader>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {ITEMS.map((it) => (
            <div key={it.title} data-reveal>
              <SpotlightCard className="h-full">
                <div className="card-body flex-row gap-5">
                  <it.icon className="text-primary size-9 shrink-0" />
                  <div>
                    <h3 className="card-title text-xl">{it.title}</h3>
                    <p className="text-base-content/75 mt-1">{it.text}</p>
                  </div>
                </div>
              </SpotlightCard>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
