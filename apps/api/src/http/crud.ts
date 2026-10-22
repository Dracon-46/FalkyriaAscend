import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import type { CrudService } from '../application/crud';
import type { AppContext } from '../context';
import { idParam, noContent, parse, requireAdmin, requireUser } from './http';

export interface CrudRouteOptions<S extends z.ZodType> {
  path: string;
  input: S;
  service: CrudService<z.infer<S>>;
  /** Escrita restrita ao administrador (ex.: regras de economia em instalações multiusuário). */
  adminWrite?: boolean;
}

/** Controller REST para um serviço de cadastro: listar, obter, criar, atualizar, excluir e (des)arquivar. */
export function registerCrud<S extends z.ZodType>(app: FastifyInstance, ctx: AppContext, o: CrudRouteOptions<S>) {
  const writer = (req: Parameters<typeof requireUser>[0]) => (o.adminWrite ? requireAdmin(req) : requireUser(req));

  app.get(o.path, async (req) => {
    const user = requireUser(req);
    const q = req.query as { includeArchived?: string };
    return o.service.list(ctx.db, user.id, { includeArchived: q.includeArchived === 'true' });
  });

  app.get(`${o.path}/:id`, async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    return o.service.get(ctx.db, user.id, id);
  });

  app.post(o.path, async (req, reply) => {
    const user = writer(req);
    const data = parse(o.input, req.body);
    return reply.status(201).send(await o.service.create(ctx.db, user.id, data));
  });

  app.put(`${o.path}/:id`, async (req) => {
    const user = writer(req);
    const { id } = parse(idParam, req.params);
    return o.service.update(ctx.db, user.id, id, parse(o.input, req.body));
  });

  app.delete(`${o.path}/:id`, async (req, reply) => {
    const user = writer(req);
    const { id } = parse(idParam, req.params);
    await o.service.remove(ctx.db, user.id, id);
    return noContent(reply);
  });

  if (o.service.archivable) {
    for (const [action, archived] of [
      ['archive', true],
      ['unarchive', false],
    ] as const) {
      app.post(`${o.path}/:id/${action}`, async (req) => {
        const user = writer(req);
        const { id } = parse(idParam, req.params);
        return o.service.setArchived(ctx.db, user.id, id, archived);
      });
    }
  }
}
