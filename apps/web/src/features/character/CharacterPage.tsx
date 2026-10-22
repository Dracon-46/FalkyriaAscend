import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { cumulativeXpForLevel, xpRequired, type GameConfig } from '@rpg/engine';
import { api } from '../../lib/api';
import { fmt, fmtDateTime, pct } from '../../lib/format';
import type { RadarData, Rank } from '../../lib/types';
import { useSession } from '../../app/session';
import { AttributeRadar } from '../../components/charts/Charts';
import { Icon } from '../../components/ui/Icon';
import { Coins } from '../../components/ui/domain';
import { Badge, Loading, PageHeader, Panel, ProgressBar, Segmented, Stat } from '../../components/ui/primitives';

interface LevelReward {
  id: string;
  level: number;
  description: string;
  itemId: string | null;
  coins: number;
}

export function CharacterPage() {
  const me = useSession();
  const c = me.character;
  const [compare, setCompare] = useState(30);
  const radar = useQuery({ queryKey: ['radar', compare], queryFn: () => api.get<RadarData>(`/api/stats/attributes/radar?compareDays=${compare}`) });
  const config = useQuery({ queryKey: ['config'], queryFn: () => api.get<{ active: { version: number; config: GameConfig } }>('/api/config') });
  const ranks = useQuery({ queryKey: ['ranks'], queryFn: () => api.get<Rank[]>('/api/ranks') });
  const milestones = useQuery({ queryKey: ['level-rewards'], queryFn: () => api.get<LevelReward[]>('/api/level-rewards') });
  const history = useQuery({
    queryKey: ['level-history'],
    queryFn: () => api.get<{ levels: Array<{ level: number; reachedAt: string }> }>('/api/stats/progression?days=3650&granularity=month'),
  });
  const cfg = config.data?.active.config;
  const next = cfg
    ? Array.from({ length: 10 }, (_, i) => {
        const level = c.level.level + i + 1;
        return { level, required: xpRequired(level, cfg.curves.character), cumulative: cumulativeXpForLevel(level, cfg.curves.character) };
      })
    : [];

  return (
    <>
      <PageHeader title="Personagem" icon="user" subtitle="Sua ficha: nível, rank, atributos, marcos e cosméticos equipados." actions={<Link to="/configuracoes?aba=perfil" className="btn btn-ghost btn-sm"><Icon name="pencil" size={14} /> Editar perfil</Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-6">
            <div className="avatar-frame grid h-32 w-32 shrink-0 place-items-center rounded-full border-4" style={{ borderColor: c.equipped.frame?.color ?? 'var(--accent)', boxShadow: 'var(--glow)' }}>
              <div className="text-center leading-none">
                <span className="block text-xs text-faint uppercase">nível</span>
                <span className="num text-5xl text-accent">{c.level.level}</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl">{c.name}</h2>
              {c.equipped.title && <p className="text-accent">{c.equipped.title}</p>}
              {c.characterClass && <p className="text-muted">{c.characterClass}</p>}
              {me.user.bio && <p className="mt-1 max-w-xl text-sm text-faint">{me.user.bio}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {c.rank && <Badge tone="accent">Rank {c.rank.code} — {c.rank.name}</Badge>}
                {c.equipped.badge && (
                  <Badge>
                    <Icon name={c.equipped.badge.icon} size={12} /> {c.equipped.badge.name}
                  </Badge>
                )}
                {c.nextRank && <Badge>Próximo: {c.nextRank.code} no nível {c.nextRank.minLevel}</Badge>}
              </div>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-1 flex justify-between text-sm text-muted">
              <span>Nível {c.level.level} → {c.level.level + 1}</span>
              <span className="num">
                {fmt(c.level.xpIntoLevel)} / {fmt(c.level.xpForNextLevel)} XP ({pct(c.level.progress)})
              </span>
            </div>
            <ProgressBar xp value={c.level.progress} label="Progresso do nível" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="XP vitalício" value={fmt(c.level.totalXp)} />
            <Stat label="Moedas" value={<Coins value={c.coins} />} hint={c.wallet ? `${fmt(c.wallet.totalEarned)} recebidas no total` : undefined} />
            <Stat label="Gastas na loja" value={fmt(c.wallet?.totalSpent ?? 0)} />
            <Stat label="Consistência" value={`×${c.multiplier.multiplier.toFixed(2)}`} hint={c.multiplier.scheduled ? `${c.multiplier.completed}/${c.multiplier.scheduled} hábitos` : 'sem dados'} />
          </div>
          {cfg && (
            <p className="mt-3 text-xs text-faint">
              Multiplicador de consistência: taxa de hábitos cumpridos nos últimos {cfg.consistency.windowDays} dias (mín. {cfg.consistency.minScheduled} ocorrências).{' '}
              {cfg.consistency.tiers.map((t) => `≥${Math.round(t.minRate * 100)}% → ×${t.multiplier}`).join(' · ')}. Afeta XP geral e moedas, não atributos.
              {c.multiplier.dampening > 0 && ` Redução ativa por penalidade: −${c.multiplier.dampening}.`}
            </p>
          )}
        </Panel>

        <Panel title="Equipamento" icon="package" actions={<Link to="/inventario" className="btn btn-ghost btn-sm">Inventário</Link>}>
          <dl className="space-y-2 text-sm">
            {[
              ['Título', c.equipped.title],
              ['Moldura', c.equipped.frame?.name],
              ['Insígnia', c.equipped.badge?.name],
              ['Efeito', c.equipped.effect],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-faint">{k}</dt>
                <dd>{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-faint">Cosméticos vêm da loja, de conquistas, de marcos de nível e de temporadas.</p>
        </Panel>

        <Panel title="Atributos" icon="git-branch" className="lg:col-span-2" actions={<Segmented label="Comparar com" value={compare} onChange={setCompare} options={[{ value: 7, label: '7 d' }, { value: 30, label: '30 d' }, { value: 90, label: '90 d' }, { value: 365, label: '1 ano' }]} />}>
          {radar.isLoading ? (
            <Loading />
          ) : (
            <AttributeRadar
              height={360}
              compareLabel={radar.data ? `Há ${compare} dias` : undefined}
              data={(radar.data?.attributes ?? []).map((a) => ({ code: a.code, name: a.name, level: a.level, previousLevel: a.previousLevel, xp: a.xp }))}
            />
          )}
          <p className="text-xs text-faint">Níveis de atributo refletem o progresso registrado no sistema, não uma medida de capacidade física ou intelectual.</p>
        </Panel>

        <Panel title="Próximos níveis" icon="chevrons-up">
          <table className="table">
            <thead>
              <tr>
                <th>Nível</th>
                <th>XP do nível</th>
                <th>Falta</th>
              </tr>
            </thead>
            <tbody>
              {next.map((n) => (
                <tr key={n.level}>
                  <td className="num">{n.level}</td>
                  <td className="num">{fmt(n.required)}</td>
                  <td className="num text-faint">{fmt(Math.max(0, n.cumulative - c.level.totalXp))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-faint">Curva v{config.data?.active.version}: cada nível exige mais XP que o anterior.</p>
        </Panel>

        <Panel title="Ranks" icon="crown">
          <ul className="space-y-1.5">
            {(ranks.data ?? []).sort((a, b) => a.minLevel - b.minLevel).map((r) => {
              const reached = c.level.level >= r.minLevel;
              const current = c.rank?.code === r.code;
              return (
                <li key={r.code} className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1 ${current ? 'bg-accent-soft' : ''}`}>
                  <span className={`num w-8 text-center font-display ${reached ? 'text-accent' : 'text-faint'}`}>{r.code}</span>
                  <span className={`flex-1 ${reached ? '' : 'text-faint'}`}>{r.name}</span>
                  <span className="num text-xs text-faint">nível {r.minLevel}</span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Marcos de nível" icon="flag">
          <ul className="space-y-2">
            {(milestones.data ?? []).sort((a, b) => a.level - b.level).map((m) => {
              const reached = c.level.level >= m.level;
              return (
                <li key={m.id} className="flex items-start gap-3 text-sm">
                  <Icon name={reached ? 'check-circle' : 'lock'} size={16} className={`mt-0.5 shrink-0 ${reached ? 'text-success' : 'text-faint'}`} />
                  <div className="flex-1">
                    <p className={reached ? '' : 'text-muted'}>
                      Nível {m.level}: {m.description}
                    </p>
                    {m.coins > 0 && <p className="text-xs text-faint">+{fmt(m.coins)} moedas{m.itemId ? ' e item exclusivo' : ''}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Histórico de níveis" icon="history">
          {(history.data?.levels ?? []).length === 0 ? (
            <p className="text-sm text-muted">Nenhum nível alcançado ainda.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
              {[...(history.data?.levels ?? [])].reverse().map((l) => (
                <li key={l.level} className="flex justify-between gap-2">
                  <span>
                    Nível <span className="num text-accent">{l.level}</span>
                  </span>
                  <span className="text-xs text-faint">{fmtDateTime(l.reachedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
