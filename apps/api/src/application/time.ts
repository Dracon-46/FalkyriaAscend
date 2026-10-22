import { addDays, localDateOf } from '@rpg/engine';
import { findSettings } from '../persistence/repositories/settings';
import type { DbOrTx } from '../persistence/unit-of-work';

export async function getTimezone(db: DbOrTx, userId: string): Promise<string> {
  return (await findSettings(db, userId))?.timezone ?? 'America/Sao_Paulo';
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
