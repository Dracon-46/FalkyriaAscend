import { createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { loadEnv } from '../src/env';

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);
await runMigrations(db);
console.log('Migrações aplicadas.');
await pool.end();
