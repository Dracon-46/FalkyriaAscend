import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { achievementInput, inventoryActionInput, itemInput, purchaseInput, reversalInput, seasonInput } from '@rpg/contracts';
import { idParam, parse, requireAdmin, requireUser } from '../http';
import { achievementDefinitionsCrud, achievementsView } from '../../application/use-cases/achievements';
import { historyOf, reverseOwnGrant, revertPenaltyAsAdmin } from '../../application/use-cases/history';
import { closeSeasonNow, saveSeason, seasonsView } from '../../application/use-cases/seasons';
import { buyItem, inventoryView, itemsCrud, purchasesOf, refundPurchaseAsAdmin, shopView, useInventoryItem } from '../../application/use-cases/shop';
import { mastery, statsFor, type RangeQuery } from '../../application/use-cases/stats';
import { registerCrud } from '../crud';
import type { AppContext } from '../../context';

const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  from: z.string().optional(),
  to: z.string().optional(),
  source: z.string().optional(),
});
const adminTarget = reversalInput.extend({ userId: z.uuid().optional() });

export async function registerEconomyRoutes(app: FastifyInstance, ctx: AppContext) {
  // ------------------------------------------------------------------ Loja

  registerCrud(app, ctx, { path: '/api/items', input: itemInput, service: itemsCrud });

  app.get('/api/shop', async (req) => shopView(ctx.db, requireUser(req).id, ctx.now()));

  app.post('/api/shop/purchase', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const me = requireUser(req);
    const input = parse(purchaseInput, req.body);
    const r = await buyItem(ctx.db, me.id, input, String(req.headers['idempotency-key'] ?? ''), ctx.now());
    return reply.status(r.replayed ? 200 : 201).send(r);
  });

  app.post('/api/purchases/:id/refund', async (req) => {
    const me = requireAdmin(req);
    const { id } = parse(idParam, req.params);
    return refundPurchaseAsAdmin(ctx.db, me.id, id, parse(adminTarget, req.body), ctx.now());
  });

  app.get('/api/purchases', async (req) => purchasesOf(ctx.db, requireUser(req).id));

  // ------------------------------------------------------------------ Inventário

  app.get('/api/inventory', async (req) => inventoryView(ctx.db, requireUser(req).id));

  app.post('/api/inventory/:id/action', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return useInventoryItem(ctx.db, me.id, id, parse(inventoryActionInput, req.body));
  });

  // ------------------------------------------------------------------ Conquistas

  registerCrud(app, ctx, { path: '/api/achievement-definitions', input: achievementInput, service: achievementDefinitionsCrud });

  app.get('/api/achievements', async (req) => achievementsView(ctx.db, requireUser(req).id));

  // ------------------------------------------------------------------ Temporadas

  app.get('/api/seasons', async (req) => seasonsView(ctx.db, requireUser(req).id, ctx.now()));

  app.post('/api/seasons', async (req, reply) => {
    const me = requireUser(req);
    return reply.status(201).send(await saveSeason(ctx.db, me.id, parse(seasonInput, req.body), null, ctx.now()));
  });
  app.put('/api/seasons/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return saveSeason(ctx.db, me.id, parse(seasonInput, req.body), id, ctx.now());
  });
  /** Encerra antecipadamente: fecha a temporada ontem, preservando todo o progresso vitalício. */
  app.post('/api/seasons/:id/close', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    return closeSeasonNow(ctx.db, me.id, id, ctx.now());
  });

  // ------------------------------------------------------------------ Estatísticas

  const rangeQuery = (req: { query: unknown }) => req.query as RangeQuery;
  app.get('/api/stats/progression', async (req) => statsFor.progression(ctx.db, requireUser(req).id, rangeQuery(req), ctx.now()));
  app.get('/api/stats/attributes/radar', async (req) => {
    const me = requireUser(req);
    const { compareDays } = parse(z.object({ compareDays: z.coerce.number().int().min(1).max(3650).default(30) }), req.query);
    return statsFor.attributeRadar(ctx.db, me.id, compareDays, ctx.now());
  });
  app.get('/api/stats/attributes/history', async (req) => statsFor.attributeHistory(ctx.db, requireUser(req).id, rangeQuery(req), ctx.now()));
  app.get('/api/stats/productivity', async (req) => statsFor.productivity(ctx.db, requireUser(req).id, rangeQuery(req), ctx.now()));
  app.get('/api/stats/economy', async (req) => statsFor.economy(ctx.db, requireUser(req).id, rangeQuery(req), ctx.now()));
  app.get('/api/stats/mastery', async (req) => mastery(ctx.db, requireUser(req).id));

  // ------------------------------------------------------------------ Histórico e auditoria

  for (const kind of ['grants', 'coins', 'penalties', 'missions', 'audit'] as const) {
    app.get(`/api/history/${kind}`, async (req) => historyOf[kind](ctx.db, requireUser(req).id, parse(historyQuery, req.query)));
  }

  /** Correções com trilha de auditoria (restritas ao administrador). */
  app.post('/api/history/grants/:id/reverse', async (req) => {
    const me = requireAdmin(req);
    const { id } = parse(idParam, req.params);
    return reverseOwnGrant(ctx.db, me.id, id, parse(reversalInput, req.body).reason);
  });

  app.post('/api/history/penalties/:id/revert', async (req) => {
    const me = requireAdmin(req);
    const { id } = parse(idParam, req.params);
    return revertPenaltyAsAdmin(ctx.db, me.id, id, parse(adminTarget, req.body));
  });
}
