import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adjustmentInput, registerInput, reversalInput } from '@rpg/contracts';
import { noContent, parse, requireAdmin } from '../http';
import {
  adjustProgress,
  adminCatalog,
  createResourceRow,
  createUserAsAdmin,
  deleteResourceRowAsAdmin,
  evaluateNow,
  getResourceRow,
  integrityReport,
  listAllUsers,
  listResource,
  rebuildUserProjections,
  resetPassword,
  reverseCoinTransaction,
  reverseGrantAsAdmin,
  revokeAchievement,
  updateResourceRowAsAdmin,
} from '../../application/use-cases/admin';
import type { AppContext } from '../../context';

const listQuery = z.object({
  userId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().max(100).optional(),
  sort: z.string().max(60).optional(),
  dir: z.enum(['asc', 'desc']).default('desc'),
  includeArchived: z.enum(['true', 'false']).default('true'),
});
const targetQuery = z.object({ userId: z.uuid().optional() });
const resourceParam = z.object({ resource: z.string() });
const adminTarget = reversalInput.extend({ userId: z.uuid().optional() });
const uuidParam = z.object({ id: z.uuid() });

export async function registerAdminRoutes(app: FastifyInstance, ctx: AppContext) {
  const target = (query: unknown) => parse(targetQuery, query).userId;

  app.get('/api/admin/meta', async (req) => {
    requireAdmin(req);
    return adminCatalog();
  });

  app.get('/api/admin/r/:resource', async (req) => {
    const admin = requireAdmin(req);
    const { resource } = parse(resourceParam, req.params);
    const q = parse(listQuery, req.query);
    return listResource(ctx.db, admin, resource, { ...q, includeArchived: q.includeArchived === 'true' });
  });

  app.get('/api/admin/r/:resource/:id', async (req) => {
    const admin = requireAdmin(req);
    const { resource, id } = parse(z.object({ resource: z.string(), id: z.string() }), req.params);
    return getResourceRow(ctx.db, admin, resource, id, target(req.query));
  });

  app.post('/api/admin/r/:resource', async (req, reply) => {
    const admin = requireAdmin(req);
    const { resource } = parse(resourceParam, req.params);
    return reply.status(201).send(await createResourceRow(ctx.db, admin, resource, req.body, target(req.query)));
  });

  app.put('/api/admin/r/:resource/:id', async (req) => {
    const admin = requireAdmin(req);
    const { resource, id } = parse(z.object({ resource: z.string(), id: z.uuid() }), req.params);
    return updateResourceRowAsAdmin(ctx.db, admin, resource, id, req.body, target(req.query));
  });

  app.delete('/api/admin/r/:resource/:id', async (req, reply) => {
    const admin = requireAdmin(req);
    const { resource, id } = parse(z.object({ resource: z.string(), id: z.uuid() }), req.params);
    await deleteResourceRowAsAdmin(ctx.db, admin, resource, id, target(req.query));
    return noContent(reply);
  });

  // ------------------------------------------------------------------ Ações auditadas sobre o livro-razão

  /** Ajuste manual de XP, moedas, atributos e habilidades — sempre como novo lançamento. */
  app.post('/api/admin/adjust', async (req) => {
    const admin = requireAdmin(req);
    return adjustProgress(ctx.db, admin, parse(adjustmentInput.extend({ userId: z.uuid().optional() }), req.body), ctx.now());
  });

  app.post('/api/admin/grants/:id/reverse', async (req) => {
    const admin = requireAdmin(req);
    const { id } = parse(uuidParam, req.params);
    return reverseGrantAsAdmin(ctx.db, admin, id, parse(adminTarget, req.body));
  });

  /** Estorno de transação de moedas avulsa (ajustes). */
  app.post('/api/admin/coins/:id/reverse', async (req) => {
    const admin = requireAdmin(req);
    const { id } = parse(uuidParam, req.params);
    return reverseCoinTransaction(ctx.db, admin, id, parse(adminTarget, req.body), ctx.now());
  });

  /** Revoga uma conquista desbloqueada e estorna sua recompensa. */
  app.post('/api/admin/user-achievements/:id/revoke', async (req) => {
    const admin = requireAdmin(req);
    const { id } = parse(uuidParam, req.params);
    return revokeAchievement(ctx.db, admin, id, parse(adminTarget, req.body));
  });

  app.get('/api/admin/integrity', async (req) => integrityReport(ctx.db, requireAdmin(req), target(req.query)));

  app.post('/api/admin/integrity/rebuild', async (req) => rebuildUserProjections(ctx.db, requireAdmin(req), target(req.query)));

  app.post('/api/admin/evaluate', async (req) => evaluateNow(ctx.db, requireAdmin(req), ctx.now(), target(req.query)));

  // ------------------------------------------------------------------ Usuários

  app.get('/api/admin/users', async (req) => {
    requireAdmin(req);
    return listAllUsers(ctx.db);
  });

  app.post('/api/admin/users', async (req, reply) => {
    const admin = requireAdmin(req);
    const input = parse(registerInput.extend({ role: z.enum(['admin', 'user']).default('user'), timezone: z.string().default('America/Sao_Paulo') }), req.body);
    return reply.status(201).send(await createUserAsAdmin(ctx.db, admin, input, ctx.now()));
  });

  app.post('/api/admin/users/:id/password', async (req, reply) => {
    const admin = requireAdmin(req);
    const { id } = parse(uuidParam, req.params);
    const { password } = parse(z.object({ password: z.string().min(10).max(200) }), req.body);
    await resetPassword(ctx.db, admin, id, password);
    return noContent(reply);
  });
}
