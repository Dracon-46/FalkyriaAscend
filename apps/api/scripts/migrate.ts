import { createDb } from '../src/persistence/client';
import { runMigrations } from '../src/persistence/migrate';
import { databaseOptions, loadEnv } from '../src/config/env';

const env = loadEnv();
const { db, pool } = createDb(databaseOptions(env));
await runMigrations(db);
console.log('Migrações aplicadas.');
await pool.end();
