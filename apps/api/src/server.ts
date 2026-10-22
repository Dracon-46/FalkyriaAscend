import { buildApp } from './app';
import { createDb } from './persistence/client';
import { runMigrations } from './persistence/migrate';
import { databaseOptions, loadEnv } from './config/env';
import { startScheduler } from './jobs/scheduler';

const env = loadEnv();
const { db, pool } = createDb(databaseOptions(env));
await runMigrations(db);
const app = await buildApp({ db, env });
const stop = startScheduler(db, env.EVALUATION_INTERVAL_MINUTES, app.log);

const shutdown = async () => {
  stop();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.PORT, host: env.HOST });
