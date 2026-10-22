import { createDb } from '../src/persistence/client';
import { runMigrations } from '../src/persistence/migrate';
import { loadEnv } from '../src/config/env';

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);
await runMigrations(db);
console.log('Migrações aplicadas.');
await pool.end();
