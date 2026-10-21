import { and, count, eq, gte, isNull, lte, ne, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { activities, habitCheckins, missions, studySessions, OBJECTIVE_METRICS } from '../db/schema';

export type ObjectiveMetric = (typeof OBJECTIVE_METRICS)[number];

export interface MetricWindow {
  from: string;
  to: string;
  /** Filtro opcional: disciplina, tipo de atividade, hábito ou categoria. */
  refId?: string | null;
  /** Missão a excluir da contagem (a própria missão composta). */
  excludeMissionId?: string;
}

/**
 * Valor de uma métrica no intervalo [from, to] (datas locais), calculado a partir dos registros.
 * Usado por objetivos de missões e metas: progresso derivado, nunca preenchido à mão.
 */
export async function metricValue(db: DbOrTx, userId: string, metric: ObjectiveMetric, w: MetricWindow): Promise<number> {
  if (w.from > w.to) return 0;
  switch (metric) {
    case 'manual':
      return 0;
    case 'study_minutes':
    case 'study_sessions': {
      const conds: SQL[] = [eq(studySessions.userId, userId), gte(studySessions.localDate, w.from), lte(studySessions.localDate, w.to)];
      if (w.refId) conds.push(eq(studySessions.subjectId, w.refId));
      const [r] = await db
        .select({ n: count(), minutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int` })
        .from(studySessions)
        .where(and(...conds));
      return metric === 'study_minutes' ? Number(r?.minutes ?? 0) : (r?.n ?? 0);
    }
    case 'training_sessions':
    case 'training_minutes':
    case 'distance_km': {
      const conds: SQL[] = [
        eq(activities.userId, userId),
        isNull(activities.deletedAt),
        gte(activities.localDate, w.from),
        lte(activities.localDate, w.to),
      ];
      if (w.refId) conds.push(eq(activities.typeId, w.refId));
      const [r] = await db
        .select({
          n: count(),
          minutes: sql<number>`coalesce(sum(${activities.durationMin}),0)::int`,
          km: sql<number>`coalesce(sum(${activities.distanceKm}),0)::float`,
        })
        .from(activities)
        .where(and(...conds));
      if (metric === 'training_sessions') return r?.n ?? 0;
      if (metric === 'training_minutes') return Number(r?.minutes ?? 0);
      return Math.round(Number(r?.km ?? 0) * 100) / 100;
    }
    case 'habit_checkins': {
      const conds: SQL[] = [
        eq(habitCheckins.userId, userId),
        eq(habitCheckins.status, 'done'),
        gte(habitCheckins.localDate, w.from),
        lte(habitCheckins.localDate, w.to),
      ];
      if (w.refId) conds.push(eq(habitCheckins.habitId, w.refId));
      const [r] = await db.select({ n: count() }).from(habitCheckins).where(and(...conds));
      return r?.n ?? 0;
    }
    case 'missions_completed': {
      const conds: SQL[] = [
        eq(missions.userId, userId),
        eq(missions.status, 'completed'),
        gte(missions.completedOn, w.from),
        lte(missions.completedOn, w.to),
      ];
      if (w.refId) conds.push(eq(missions.categoryId, w.refId));
      if (w.excludeMissionId) conds.push(ne(missions.id, w.excludeMissionId));
      const [r] = await db.select({ n: count() }).from(missions).where(and(...conds));
      return r?.n ?? 0;
    }
  }
}
