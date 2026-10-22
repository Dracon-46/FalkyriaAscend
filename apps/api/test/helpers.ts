import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { createDb, type Db } from '../src/persistence/client';
import { runMigrations } from '../src/persistence/migrate';
import { loadEnv } from '../src/config/env';
import { resetEvaluationThrottle } from '../src/http/routes/core';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://rpg:rpg@localhost:5432/rpg_test';

export interface TestCtx {
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
  clock: { now: Date };
}

/** Recria o schema do zero e sobe a aplicação com relógio controlável. */
export async function setup(): Promise<TestCtx> {
  const { db, pool } = createDb(TEST_DB_URL);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await runMigrations(db);
  const clock = { now: new Date('2026-10-21T15:00:00Z') };
  const env = loadEnv({
    DATABASE_URL: TEST_DB_URL,
    NODE_ENV: 'test',
    ALLOW_REGISTRATION: 'true',
    APP_ORIGIN: 'http://localhost:5173',
    INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    STRAVA_WEBHOOK_VERIFY_TOKEN: 'segredo-webhook-teste',
    EVALUATION_INTERVAL_MINUTES: '0',
  });
  const app = await buildApp({ db, env, now: () => clock.now, logger: false });
  resetEvaluationThrottle();
  return {
    app,
    db,
    clock,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

export class Client {
  cookie = '';
  constructor(private app: FastifyInstance) {}

  async req(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method,
      url,
      payload: body as never,
      headers: { 'x-requested-with': 'rpg', ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
    });
    const set = res.headers['set-cookie'];
    if (set) {
      const raw = Array.isArray(set) ? set : [set];
      const sid = raw.find((c) => c.startsWith('rpg_sid='));
      if (sid) this.cookie = sid.split(';')[0]!;
    }
    let json: any = null;
    try {
      json = res.json();
    } catch {
      json = null;
    }
    return { status: res.statusCode, body: json, raw: res };
  }
  get(url: string) {
    return this.req('GET', url);
  }
  post(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.req('POST', url, body ?? {}, headers);
  }
  put(url: string, body: unknown) {
    return this.req('PUT', url, body);
  }
  patch(url: string, body: unknown) {
    return this.req('PATCH', url, body);
  }
  del(url: string) {
    return this.req('DELETE', url);
  }
}

export async function registerUser(app: FastifyInstance, email = 'heroi@example.com', name = 'Herói') {
  const c = new Client(app);
  const r = await c.post('/api/auth/register', { email, password: 'senha-muito-forte', displayName: name });
  if (r.status !== 201) throw new Error(`Falha no cadastro: ${r.status} ${JSON.stringify(r.body)}`);
  return { client: c, user: r.body };
}
