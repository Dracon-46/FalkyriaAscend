import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { configUpdateInput, profileInput, settingsInput } from '@rpg/contracts';
import { noContent, parse, requireAdmin, requireUser } from '../http';
import { clearSessionCookie } from '../plugins/auth';
import { currentAccount, deleteAccount, exportAccount, getSettings, markRead, notificationsOf, recordVisit, saveSettings, updateProfile } from '../../application/use-cases/account';
import { dashboardFor } from '../../application/use-cases/dashboard';
import { configView, previewConfig, publishProgressionConfig } from '../../application/use-cases/progression-config';
import type { AppContext } from '../../context';

export async function registerCoreRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/me', async (req) => currentAccount(ctx.db, requireUser(req).id, ctx.now()));

  app.get('/api/dashboard', async (req) => dashboardFor(ctx.db, requireUser(req).id, ctx.now()));

  app.put('/api/profile', async (req) => {
    const me = requireUser(req);
    return updateProfile(ctx.db, me.id, parse(profileInput, req.body));
  });

  app.get('/api/settings', async (req) => getSettings(ctx.db, requireUser(req).id));

  app.put('/api/settings', async (req) => {
    const me = requireUser(req);
    return saveSettings(ctx.db, me.id, parse(settingsInput, req.body));
  });

  app.get('/api/notifications', async (req) => notificationsOf(ctx.db, requireUser(req).id));
  app.post('/api/notifications/read-all', async (req, reply) => {
    await markRead(ctx.db, requireUser(req).id);
    return noContent(reply);
  });
  app.post('/api/notifications/:id/read', async (req, reply) => {
    const me = requireUser(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await markRead(ctx.db, me.id, id);
    return noContent(reply);
  });

  app.post('/api/visits', async (req, reply) => {
    const me = requireUser(req);
    const { page } = parse(z.object({ page: z.string().regex(/^[a-z0-9-]{1,40}$/) }), req.body);
    await recordVisit(ctx.db, me.id, page, ctx.now());
    return noContent(reply);
  });

  // ---------------------------------------------------------- Configuração da progressão

  app.get('/api/config', async (req) => configView(ctx.db, requireUser(req).id));

  /** Pré-visualização: impacto de uma configuração candidata (nível atual e simulações) sem gravar. */
  app.post('/api/config/preview', async (req) => {
    const me = requireUser(req);
    const body = parse(z.object({ config: z.unknown() }), req.body);
    return previewConfig(ctx.db, me.id, body.config);
  });

  /** Publica nova versão. Restrito ao administrador; nunca recalcula recompensas antigas. */
  app.put('/api/config', async (req) => {
    const me = requireAdmin(req);
    return publishProgressionConfig(ctx.db, me.id, parse(configUpdateInput, req.body));
  });

  // ---------------------------------------------------------- Exportação e exclusão

  app.get('/api/export', async (req, reply) => {
    const me = requireUser(req);
    const out = await exportAccount(ctx.db, me.id);
    reply.header('content-disposition', `attachment; filename="ascend-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return out;
  });

  app.post('/api/account/delete', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const me = requireUser(req);
    const { password } = parse(z.object({ password: z.string().min(1), confirm: z.literal('EXCLUIR') }), req.body);
    await deleteAccount(ctx.db, me.id, password);
    clearSessionCookie(reply);
    return noContent(reply);
  });
}
