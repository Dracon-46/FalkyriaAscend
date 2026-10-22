/** Casos de uso de estatísticas. */
import type { Db } from '../../persistence/unit-of-work';
import { todayFor } from '../time';
import { attributeHistory, attributeRadar, economy, mastery, parseRange, productivity, progression, type RangeQuery } from '../stats';

export { mastery, type RangeQuery };

/** Consultas de estatística com o período resolvido a partir da data local do usuário. */
export const statsFor = {
  progression: async (db: Db, userId: string, q: RangeQuery, now: Date) => progression(db, userId, parseRange(q, await todayFor(db, userId, now))),
  attributeHistory: async (db: Db, userId: string, q: RangeQuery, now: Date) => attributeHistory(db, userId, parseRange(q, await todayFor(db, userId, now))),
  productivity: async (db: Db, userId: string, q: RangeQuery, now: Date) => productivity(db, userId, parseRange(q, await todayFor(db, userId, now))),
  economy: async (db: Db, userId: string, q: RangeQuery, now: Date) => {
    const today = await todayFor(db, userId, now);
    return economy(db, userId, parseRange(q, today), today);
  },
  attributeRadar: async (db: Db, userId: string, compareDays: number, now: Date) => attributeRadar(db, userId, await todayFor(db, userId, now), compareDays),
};
