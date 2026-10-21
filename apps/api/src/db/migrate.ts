import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Pasta de migrações versionadas (geradas por drizzle-kit). */
export function migrationsFolder(): string {
  // Em desenvolvimento: apps/api/src/db → apps/api/drizzle. No build: dist → ../drizzle.
  const candidates = [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle')];
  return process.env.MIGRATIONS_DIR ?? candidates[0]!;
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
