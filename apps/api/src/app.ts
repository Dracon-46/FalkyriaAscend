import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Db } from './db/client';
import type { Env } from './env';
import { registerAdminRoutes } from './admin/routes';
import { registerIntegrationRoutes } from './integrations/routes';
import { AppError, pgCode, PG } from './lib/errors';
import { registerAuth } from './plugins/auth';
import { registerAuthRoutes } from './routes/auth';
import { registerCoreRoutes } from './routes/core';
import { registerDefinitionRoutes } from './routes/definitions';
import { registerEconomyRoutes } from './routes/economy';
import { registerHabitGoalRoutes } from './routes/habits-goals';
import { registerMissionRoutes } from './routes/missions';
import { registerStudyTrainingRoutes } from './routes/study-training';
import type { AppContext } from './context';

export interface BuildOptions {
  db: Db;
  env: Env;
  now?: () => Date;
  logger?: boolean;
}

/** Cabeçalho obrigatório em requisições que alteram estado (defesa CSRF junto com SameSite=Lax). */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'rpg';
const CSRF_EXEMPT = [/^\/api\/integrations\/strava\/webhook\//];

export async function buildApp(opts: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: opts.env.LOG_LEVEL, redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["api-key"]'] },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });
  const ctx: AppContext = { db: opts.db, env: opts.env, now: opts.now ?? (() => new Date()) };

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        scriptSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  registerAuth(app, opts.db, opts.env);

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    if (CSRF_EXEMPT.some((re) => re.test(req.url))) return;
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE) throw new AppError(403, 'csrf', 'Requisição recusada (proteção CSRF).');
    const origin = req.headers.origin;
    if (origin && origin !== opts.env.APP_ORIGIN && origin !== `${req.protocol}://${req.host}`) {
      throw new AppError(403, 'csrf', 'Origem não permitida.');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details ?? null } });
    }
    const e = err as { statusCode?: number; validation?: unknown; message: string; code?: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Muitas tentativas. Aguarde um minuto.' } });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: e.code ?? 'bad_request', message: 'Requisição inválida.' } });
    }
    const code = pgCode(err);
    if (code === PG.uniqueViolation) return reply.status(409).send({ error: { code: 'conflict', message: 'Registro duplicado.' } });
    if (code === PG.foreignKeyViolation) return reply.status(409).send({ error: { code: 'conflict', message: 'Há registros vinculados a este item.' } });
    if (code === PG.checkViolation) return reply.status(422).send({ error: { code: 'unprocessable', message: 'Os dados violam uma regra de integridade (ex.: saldo negativo).' } });
    req.log.error({ err }, 'Erro não tratado');
    // Nunca expõe detalhes internos ao cliente.
    return reply.status(500).send({ error: { code: 'internal', message: 'Erro interno. Tente novamente.' } });
  });

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

  await registerAuthRoutes(app, ctx);
  await registerCoreRoutes(app, ctx);
  await registerDefinitionRoutes(app, ctx);
  await registerMissionRoutes(app, ctx);
  await registerHabitGoalRoutes(app, ctx);
  await registerStudyTrainingRoutes(app, ctx);
  await registerEconomyRoutes(app, ctx);
  await registerAdminRoutes(app, ctx);
  await registerIntegrationRoutes(app, ctx);

  // Em produção a API também serve a interface (SPA).
  const dist = opts.env.WEB_DIST_DIR ? path.resolve(opts.env.WEB_DIST_DIR) : null;
  if (dist && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Rota não encontrada' } });
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'Rota não encontrada' } }));
  }
  return app;
}
