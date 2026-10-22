import type { FastifyInstance, FastifyReply } from 'fastify';
import { resolveSession, type IssuedSession } from '../../application/use-cases/auth';
import type { Env } from '../../config/env';
import type { AppContext } from '../../context';

export const SESSION_COOKIE = 'rpg_sid';

/** Resolve a sessão do cookie em cada requisição (sem lançar erro; as rotas exigem autenticação). */
export function registerAuth(app: FastifyInstance, db: AppContext['db'], env: Env) {
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    req.user = await resolveSession(db, token, env.SESSION_TTL_DAYS);
  });
}

export function setSessionCookie(reply: FastifyReply, env: Env, session: IssuedSession) {
  reply.setCookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
