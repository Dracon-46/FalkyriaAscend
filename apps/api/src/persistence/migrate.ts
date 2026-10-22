import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Pasta de migrações versionadas (geradas por drizzle-kit). */
export function migrationsFolder(): string {
  // Em desenvolvimento: apps/api/src/db → apps/api/drizzle. No build: dist → ../drizzle.
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const candidates = [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle'), path.resolve(process.cwd(), 'drizzle')];
  return candidates.find((c) => existsSync(path.join(c, 'meta', '_journal.json'))) ?? candidates[0]!;
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
