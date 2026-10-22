import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { SessionUser } from '../application/use-cases/auth';
import { badRequest, forbidden, unauthorized } from '../shared/errors';

/** Valida a entrada com Zod; erros viram 400 com a lista de campos inválidos. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest(issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; '), { issues });
  }
  return r.data;
}

export const idParam = z.object({ id: z.uuid('Identificador inválido') });

export type AuthUser = SessionUser;

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireAdmin(req: FastifyRequest): AuthUser {
  const u = requireUser(req);
  if (u.role !== 'admin') throw forbidden('Ação restrita ao administrador');
  return u;
}

export function noContent(reply: FastifyReply) {
  return reply.status(204).send();
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}
