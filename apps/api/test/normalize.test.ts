import { describe, expect, it } from 'vitest';
import { normalizeHevy, normalizeLyfta, normalizeStrava } from '../src/integrations/normalize';
import { epley1rm, normalizeKey } from '../src/application/activities';

describe('normalização de integrações', () => {
  it('Strava: metros → km, segundos → minutos, sport_type → categoria', () => {
    const a = normalizeStrava(
      {
        id: 987,
        name: 'Longão',
        sport_type: 'Run',
        start_date: '2026-10-19T09:00:00Z',
        start_date_local: '2026-10-19T06:00:00Z',
        moving_time: 5400,
        distance: 18_250,
        total_elevation_gain: 120.4,
      },
      'America/Sao_Paulo',
    );
    expect(a).toMatchObject({ externalId: '987', category: 'run', date: '2026-10-19', durationMin: 90, distanceKm: 18.25, elevationM: 120 });
    expect(normalizeStrava({ id: 1, sport_type: 'WeightTraining', elapsed_time: 3000 }, 'UTC').category).toBe('strength');
    expect(normalizeStrava({ id: 2, sport_type: 'Kitesurf', elapsed_time: 60 }, 'UTC').category).toBe('other');
  });

  it('Lyfta: converte strings, ignora séries não concluídas e estima duração', () => {
    // Formato do sandbox oficial (GET /api/sandbox/v1/workouts), com a grafia "excercise_name".
    const w = normalizeLyfta(
      {
        id: 555,
        title: 'Push',
        workout_perform_date: '2026-10-20T22:00:00Z',
        exercises: [
          {
            excercise_name: 'Supino reto',
            sets: [
              { weight: '80', reps: '8', is_completed: true },
              { weight: '82,5', reps: '6' },
              { weight: '90', reps: '5', is_completed: false },
            ],
          },
          { excercise_name: 'Flexão', sets: [{ weight: '', reps: '15' }] },
        ],
      },
      'America/Sao_Paulo',
    );
    expect(w.date).toBe('2026-10-20');
    expect(w.sets).toEqual([
      { exerciseName: 'Supino reto', reps: 8, weightKg: 80, rir: null },
      { exerciseName: 'Supino reto', reps: 6, weightKg: 82.5, rir: null },
      { exerciseName: 'Flexão', reps: 15, weightKg: null, rir: null },
    ]);
    expect(w.durationMin).toBe(15);
    const lb = normalizeLyfta({ id: 1, exercises: [{ excercise_name: 'X', sets: [{ weight: '100', reps: '5' }] }] }, 'UTC', 'lb');
    expect(lb.sets[0]!.weightKg).toBe(45.4);
  });

  it('Hevy: duração pelos horários e aquecimento ignorado', () => {
    const h = normalizeHevy(
      {
        id: 'uuid-1',
        start_time: '2026-10-20T10:00:00Z',
        end_time: '2026-10-20T11:05:00Z',
        exercises: [
          {
            title: 'Agachamento',
            sets: [
              { type: 'warmup', weight_kg: 40, reps: 10 },
              { type: 'normal', weight_kg: 100, reps: 5, rpe: 8 },
            ],
          },
        ],
      },
      'UTC',
    );
    expect(h.durationMin).toBe(65);
    expect(h.sets).toEqual([{ exerciseName: 'Agachamento', reps: 5, weightKg: 100, rir: 2 }]);
  });

  it('auxiliares: 1RM de Epley e normalização de títulos', () => {
    expect(epley1rm(100, 1)).toBe(100);
    expect(epley1rm(100, 5)).toBe(116.7);
    expect(normalizeKey('  Lavar a LOUÇA! ')).toBe('lavar a louca');
  });
});
