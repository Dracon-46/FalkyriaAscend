/** Caso de uso do painel. */
import type { Db } from '../../persistence/unit-of-work';
import { ensureEvaluated } from '../evaluation';
import { todayFor } from '../time';
import { buildDashboard } from '../dashboard';

/** Caso de uso do painel: fecha dias pendentes (no máximo a cada 5 min) e monta a visão do dia. */
export async function dashboardFor(db: Db, userId: string, now: Date) {
  await ensureEvaluated(db, userId, now);
  return buildDashboard(db, userId, await todayFor(db, userId, now));
}
