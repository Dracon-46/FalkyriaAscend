import { and, eq, gte, lte } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { unavailability } from '../schema';

/** Períodos de indisponibilidade que cobrem a data. */
export function unavailabilityCovering(db: DbOrTx, userId: string, date: string) {
  return db
    .select()
    .from(unavailability)
    .where(and(eq(unavailability.userId, userId), lte(unavailability.startDate, date), gte(unavailability.endDate, date)));
}
