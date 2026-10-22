import { eq } from 'drizzle-orm';
import { addDays, localDateOf } from '@rpg/engine';
import type { DbOrTx } from '../persistence/client';
import { userSettings } from '../persistence/schema';

export async function getTimezone(db: DbOrTx, userId: string): Promise<string> {
  const [row] = await db.select({ tz: userSettings.timezone }).from(userSettings).where(eq(userSettings.userId, userId));
  return row?.tz ?? 'America/Sao_Paulo';
}

/** Data local de hoje para o usuário. `now` é injetável para testes. */
export async function todayFor(db: DbOrTx, userId: string, now: Date = new Date()): Promise<string> {
  return localDateOf(now, await getTimezone(db, userId));
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export { addDays };
