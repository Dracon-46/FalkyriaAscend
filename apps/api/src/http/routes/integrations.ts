import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ACTIVITY_CATEGORIES } from '@rpg/engine';
import { randomToken } from '../../shared/crypto';
import { badRequest } from '../../shared/errors';
import { noContent, parse, requireUser } from '../http';
import {
  assertWebhookSecret,
  completeStravaAuthorization,
  connectWithApiKey,
  disconnectProvider,
  importActivities,
  integrationsOverview,
  receiveStravaEvent,
  stateMatches,
  stravaAuthorization,
  syncProvider,
  updateIntegrationSettings,
  verifyStravaSubscription,
} from '../../application/use-cases/integrations';
import type { AppContext } from '../../context';

const STATE_COOKIE = 'rpg_strava_state';
const STATE_PATH = '/api/integrations/strava';

const providerParam = z.object({ provider: z.enum(['strava', 'lyfta', 'hevy']) });
const settingsInput = z.object({
  weightUnit: z.enum(['kg', 'lb']).optional(),
  defaultTypeId: z.uuid().optional(),
  typeMap: z.record(z.enum(ACTIVITY_CATEGORIES), z.uuid()).optional(),
});
const importItem = z.object({
  externalId: z.string().min(1).max(120),
  category: z.enum(ACTIVITY_CATEGORIES),
  title: z.string().max(160).nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMin: z.number().int().min(1).max(1440),
  distanceKm: z.number().min(0).max(1000).nullish(),
  elevationM: z.number().int().min(0).max(20000).nullish(),
  avgHeartRate: z.number().int().min(30).max(250).nullish(),
  sets: z
    .array(
      z.object({
        exerciseName: z.string().min(1).max(120),
        reps: z.number().int().min(1).max(1000),
        weightKg: z.number().min(0).max(1000).nullish(),
        rir: z.number().min(0).max(10).nullish(),
      }),
    )
    .max(200)
    .default([]),
});
const stravaEvent = z.object({
  object_type: z.enum(['activity', 'athlete']),
  object_id: z.union([z.number(), z.string()]),
  aspect_type: z.enum(['create', 'update', 'delete']),
  owner_id: z.union([z.number(), z.string()]),
  subscription_id: z.union([z.number(), z.string()]).optional(),
  event_time: z.number(),
  updates: z.record(z.string(), z.unknown()).optional(),
});

export async function registerIntegrationRoutes(app: FastifyInstance, ctx: AppContext) {
  const env = ctx.env;

  app.get('/api/integrations', async (req) => integrationsOverview(ctx.db, requireUser(req).id, env));

  /** Atualiza preferências (unidade de peso, mapeamento de tipos). */
  app.put('/api/integrations/:provider/settings', async (req) => {
    const me = requireUser(req);
    const { provider } = parse(providerParam, req.params);
    return updateIntegrationSettings(ctx.db, me.id, provider, parse(settingsInput, req.body));
  });

  // ---------------------------------------------------------------- Chave de API (Lyfta / Hevy)

  app.post('/api/integrations/:provider/key', async (req) => {
    const me = requireUser(req);
    const { provider } = parse(z.object({ provider: z.enum(['lyfta', 'hevy']) }), req.params);
    const { apiKey } = parse(z.object({ apiKey: z.string().trim().min(10).max(500) }), req.body);
    return connectWithApiKey(ctx.db, me.id, provider, apiKey, env);
  });

  /** Sincroniza uma janela recente (padrão 14 dias) e reconcilia por id externo (sem duplicar). */
  app.post('/api/integrations/:provider/sync', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (req) => {
    const me = requireUser(req);
    const { provider } = parse(providerParam, req.params);
    const { days } = parse(z.object({ days: z.number().int().min(1).max(90).default(14) }), req.body ?? {});
    return syncProvider(ctx.db, me.id, provider, days, env, ctx.now());
  });

  app.delete('/api/integrations/:provider', async (req, reply) => {
    const me = requireUser(req);
    const { provider } = parse(providerParam, req.params);
    await disconnectProvider(ctx.db, me.id, provider, env);
    return noContent(reply);
  });

  // ---------------------------------------------------------------- Importação autorizada (JSON)

  /** Importação manual de atividades exportadas (ex.: export oficial do Lyfta/Strava convertido). */
  app.post('/api/import/activities', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const me = requireUser(req);
    return importActivities(ctx.db, me.id, parse(z.array(importItem).min(1).max(500), req.body), ctx.now());
  });

  // ---------------------------------------------------------------- Strava OAuth

  app.get('/api/integrations/strava/connect', async (req, reply) => {
    requireUser(req);
    const state = randomToken(16);
    const out = stravaAuthorization(env, state);
    reply.setCookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: STATE_PATH, maxAge: 600 });
    return out;
  });

  app.get('/api/integrations/strava/callback', async (req, reply) => {
    const me = requireUser(req);
    const q = parse(
      z.object({ code: z.string().optional(), state: z.string().optional(), scope: z.string().optional(), error: z.string().optional() }),
      req.query,
    );
    const expected = req.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: STATE_PATH });
    if (q.error) return reply.redirect('/configuracoes?aba=integracoes&strava=negado');
    if (!q.code || !stateMatches(q.state, expected)) throw badRequest('Estado OAuth inválido. Tente conectar novamente.');
    await completeStravaAuthorization(ctx.db, me.id, q.code, q.scope, env);
    return reply.redirect('/configuracoes?aba=integracoes&strava=conectado');
  });

  // ---------------------------------------------------------------- Strava webhook

  /** Handshake de assinatura: responder 200 com hub.challenge em até 2 s. */
  app.get('/api/integrations/strava/webhook/:secret', async (req) => {
    const { secret } = req.params as { secret: string };
    return verifyStravaSubscription(env, secret, req.query as Record<string, string>);
  });

  /** Responde 200 imediatamente e processa o evento depois. */
  app.post('/api/integrations/strava/webhook/:secret', async (req, reply) => {
    const { secret } = req.params as { secret: string };
    assertWebhookSecret(env, secret);
    const job = await receiveStravaEvent(ctx.db, env, secret, parse(stravaEvent, req.body), ctx.now);
    reply.status(200).send({ ok: true });
    if (job) setImmediate(() => void job().catch(() => undefined));
    return reply;
  });
}
