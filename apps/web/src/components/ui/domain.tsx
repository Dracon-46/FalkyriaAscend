import {
  DIFFICULTY_LABELS,
  MISSION_STATUS_LABELS,
  MISSION_TYPE_LABELS,
  RARITY_LABELS,
  type Difficulty,
  type MissionStatus,
  type MissionType,
  type Rarity,
} from '@rpg/engine';
import { Icon } from './Icon';
import { Badge } from './primitives';
import { fmt } from '../../lib/format';

const DIFF_TONE: Record<Difficulty, string> = {
  routine: 'var(--text-faint)',
  easy: 'var(--success)',
  moderate: 'var(--info)',
  hard: 'var(--warning)',
  very_hard: 'var(--accent-2)',
  epic: 'var(--accent)',
  legendary: 'var(--accent-strong)',
};

export function DifficultyBadge({ value }: { value: Difficulty }) {
  const c = DIFF_TONE[value];
  const pips = ['routine', 'easy', 'moderate', 'hard', 'very_hard', 'epic', 'legendary'].indexOf(value) + 1;
  return (
    <span className="badge" style={{ color: c, borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }} title={`Dificuldade: ${DIFFICULTY_LABELS[value]}`}>
      <span aria-hidden="true" className="flex gap-px">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="h-2 w-[3px] rounded-full" style={{ background: i < pips ? c : 'color-mix(in srgb, currentColor 18%, transparent)' }} />
        ))}
      </span>
      {DIFFICULTY_LABELS[value]}
    </span>
  );
}

const STATUS_TONE: Record<MissionStatus, 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted'> = {
  available: 'info',
  in_progress: 'accent',
  completed: 'success',
  failed: 'danger',
  cancelled: 'muted',
  suspended: 'warning',
  expired: 'muted',
};

export function StatusBadge({ value }: { value: MissionStatus }) {
  return <Badge tone={STATUS_TONE[value]}>{MISSION_STATUS_LABELS[value]}</Badge>;
}

export function TypeBadge({ value }: { value: MissionType }) {
  return <Badge>{MISSION_TYPE_LABELS[value]}</Badge>;
}

const RARITY_COLOR: Record<Rarity, string> = {
  common: 'var(--text-muted)',
  uncommon: 'var(--success)',
  rare: 'var(--info)',
  epic: 'var(--accent-2)',
  legendary: 'var(--accent)',
  mythic: 'var(--accent-strong)',
};

export function rarityColor(r: Rarity) {
  return RARITY_COLOR[r];
}

export function RarityBadge({ value }: { value: Rarity }) {
  const c = RARITY_COLOR[value];
  return (
    <span className="badge" style={{ color: c, borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }}>
      {RARITY_LABELS[value]}
    </span>
  );
}

export function Coins({ value, className }: { value: number; className?: string }) {
  return (
    <span className={`num inline-flex items-center gap-1 ${className ?? ''}`} style={{ color: 'var(--coin)' }}>
      <Icon name="coins" size={15} />
      {fmt(value)}
    </span>
  );
}

export function Xp({ value, className }: { value: number; className?: string }) {
  return (
    <span className={`num inline-flex items-center gap-1 text-accent ${className ?? ''}`}>
      <Icon name="sparkles" size={14} />
      {fmt(value)} XP
    </span>
  );
}

export function AttrWeights({ weights }: { weights: Record<string, number> }) {
  const entries = Object.entries(weights);
  if (entries.length === 0) return null;
  const total = entries.reduce((a, [, w]) => a + w, 0) || 1;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {entries.map(([k, w]) => (
        <span key={k} className="badge num" title={`${Math.round((w / total) * 100)}% do XP de atributo`}>
          {k} {Math.round((w / total) * 100)}%
        </span>
      ))}
    </span>
  );
}
