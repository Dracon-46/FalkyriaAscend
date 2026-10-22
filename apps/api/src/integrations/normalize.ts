/**
 * Normalização de dados externos para o formato interno (funções puras, testáveis com fixtures).
 * Formatos baseados na documentação oficial (ver docs/09-integracoes.md):
 *  - Strava: SummaryActivity/DetailedActivity (distância em metros, tempos em segundos).
 *  - Lyfta: GET /api/v1/workouts (weight e reps chegam como string; unidade não documentada).
 *  - Hevy: GET /v1/workouts (weight_kg, start_time/end_time).
 */
import { localDateOf, type ActivityCategory } from '@rpg/engine';

export interface ExternalSet {
  exerciseName: string;
  reps: number;
  weightKg: number | null;
  rir: number | null;
}

export interface ExternalActivity {
  provider: 'strava' | 'lyfta' | 'hevy' | 'import';
  externalId: string;
  category: ActivityCategory;
  title: string | null;
  date: string;
  startedAt: Date | null;
  durationMin: number;
  distanceKm: number | null;
  elevationM: number | null;
  avgHeartRate: number | null;
  sets: ExternalSet[];
  /** Observações sobre estimativas feitas na normalização. */
  notes: string[];
}

const STRAVA_SPORT_MAP: Record<string, ActivityCategory> = {
  Run: 'run',
  TrailRun: 'run',
  VirtualRun: 'run',
  Walk: 'walk',
  Hike: 'walk',
  Ride: 'cycle',
  VirtualRide: 'cycle',
  MountainBikeRide: 'cycle',
  GravelRide: 'cycle',
  EBikeRide: 'cycle',
  Swim: 'swim',
  WeightTraining: 'strength',
  Crossfit: 'strength',
  Yoga: 'mobility',
  Pilates: 'mobility',
};

export interface StravaActivityPayload {
  id: number | string;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date?: string;
  start_date_local?: string;
  moving_time?: number;
  elapsed_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
}

export function normalizeStrava(a: StravaActivityPayload, timeZone: string): ExternalActivity {
  const sport = a.sport_type ?? a.type ?? 'Workout';
  const started = a.start_date ? new Date(a.start_date) : null;
  const seconds = a.moving_time ?? a.elapsed_time ?? 0;
  const km = a.distance ? Math.round((a.distance / 1000) * 100) / 100 : null;
  return {
    provider: 'strava',
    externalId: String(a.id),
    category: STRAVA_SPORT_MAP[sport] ?? 'other',
    title: a.name ?? null,
    date: a.start_date_local ? a.start_date_local.slice(0, 10) : started ? localDateOf(started, timeZone) : localDateOf(new Date(), timeZone),
    startedAt: started,
    durationMin: Math.max(1, Math.round(seconds / 60)),
    distanceKm: km && km > 0 ? km : null,
    elevationM: a.total_elevation_gain != null ? Math.round(a.total_elevation_gain) : null,
    avgHeartRate: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    sets: [],
    notes: [],
  };
}

export interface LyftaWorkout {
  id: number | string;
  title?: string;
  workout_perform_date?: string;
  exercises?: Array<{
    excercise_name?: string;
    exercise_name?: string;
    sets?: Array<{ weight?: string | number | null; reps?: string | number | null; rir?: string | number | null; is_completed?: boolean }>;
  }>;
}

const LB_TO_KG = 0.45359237;
/** Minutos estimados por série (inclui descanso) quando a fonte não informa duração. */
export const ESTIMATED_MINUTES_PER_SET = 3;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function normalizeLyfta(w: LyftaWorkout, timeZone: string, weightUnit: 'kg' | 'lb' = 'kg'): ExternalActivity {
  const sets: ExternalSet[] = [];
  for (const ex of w.exercises ?? []) {
    const name = (ex.excercise_name ?? ex.exercise_name ?? 'Exercício').trim();
    for (const s of ex.sets ?? []) {
      if (s.is_completed === false) continue;
      const reps = num(s.reps);
      if (reps === null || reps <= 0) continue;
      const weight = num(s.weight);
      sets.push({
        exerciseName: name,
        reps: Math.round(reps),
        weightKg: weight === null ? null : Math.round((weightUnit === 'lb' ? weight * LB_TO_KG : weight) * 10) / 10,
        rir: num(s.rir),
      });
    }
  }
  const started = w.workout_perform_date ? new Date(w.workout_perform_date) : null;
  const duration = Math.min(150, Math.max(15, sets.length * ESTIMATED_MINUTES_PER_SET));
  return {
    provider: 'lyfta',
    externalId: String(w.id),
    category: 'strength',
    title: w.title ?? 'Treino (Lyfta)',
    date: started ? localDateOf(started, timeZone) : localDateOf(new Date(), timeZone),
    startedAt: started,
    durationMin: duration,
    distanceKm: null,
    elevationM: null,
    avgHeartRate: null,
    sets,
    notes: [
      `Duração estimada: ${sets.length} séries × ${ESTIMATED_MINUTES_PER_SET} min (a API do Lyfta não informa duração).`,
      `Unidade de peso considerada: ${weightUnit}.`,
    ],
  };
}

export interface HevyWorkout {
  id: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  exercises?: Array<{ title?: string; sets?: Array<{ type?: string; weight_kg?: number | null; reps?: number | null; rpe?: number | null }> }>;
}

export function normalizeHevy(w: HevyWorkout, timeZone: string): ExternalActivity {
  const sets: ExternalSet[] = [];
  for (const ex of w.exercises ?? []) {
    for (const s of ex.sets ?? []) {
      if (s.type === 'warmup' || !s.reps || s.reps <= 0) continue;
      sets.push({
        exerciseName: (ex.title ?? 'Exercício').trim(),
        reps: s.reps,
        weightKg: s.weight_kg ?? null,
        rir: s.rpe != null ? Math.max(0, Math.round(10 - s.rpe)) : null,
      });
    }
  }
  const start = w.start_time ? new Date(w.start_time) : null;
  const end = w.end_time ? new Date(w.end_time) : null;
  const minutes = start && end ? Math.round((end.getTime() - start.getTime()) / 60_000) : sets.length * ESTIMATED_MINUTES_PER_SET;
  return {
    provider: 'hevy',
    externalId: w.id,
    category: 'strength',
    title: w.title ?? 'Treino (Hevy)',
    date: start ? localDateOf(start, timeZone) : localDateOf(new Date(), timeZone),
    startedAt: start,
    durationMin: Math.min(600, Math.max(1, minutes)),
    distanceKm: null,
    elevationM: null,
    avgHeartRate: null,
    sets,
    notes: start && end ? [] : ['Duração estimada pelas séries.'],
  };
}
