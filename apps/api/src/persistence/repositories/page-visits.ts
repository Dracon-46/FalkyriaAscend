import type { DbOrTx } from '../client';
import { pageVisits } from '../schema';

/** Registra a primeira visita a uma área; retorna `false` se já havia sido visitada. */
export async function recordFirstVisit(db: DbOrTx, userId: string, page: string): Promise<boolean> {
  const rows = await db.insert(pageVisits).values({ userId, page }).onConflictDoNothing().returning();
  return rows.length > 0;
}
