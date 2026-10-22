import type { FastifyInstance } from 'fastify';
import { changePasswordInput, loginInput, registerInput } from '@rpg/contracts';
import { noContent, parse, requireUser } from '../http';
import { clearSessionCookie, setSessionCookie } from '../plugins/auth';
import { authenticate, changePassword, closeSession, openSession, registerUser, registrationStatus } from '../../application/use-cases/auth';
import type { AppContext } from '../../context';

const AUTH_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/auth/status', async () => registrationStatus(ctx.db, ctx.env.ALLOW_REGISTRATION));

  app.post('/api/auth/register', { config: AUTH_LIMIT }, async (req, reply) => {
    const input = parse(registerInput, req.body);
    const body = req.body as { timezone?: unknown };
    const timezone = typeof body?.timezone === 'string' ? body.timezone : 'America/Sao_Paulo';
    const user = await registerUser(ctx.db, input, { allowRegistration: ctx.env.ALLOW_REGISTRATION, timezone, now: ctx.now() });
    setSessionCookie(reply, ctx.env, await openSession(ctx.db, user.id, ctx.env.SESSION_TTL_DAYS, req.headers['user-agent']));
    return reply.status(201).send({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
  });

  app.post('/api/auth/login', { config: AUTH_LIMIT }, async (req, reply) => {
    const u = await authenticate(ctx.db, parse(loginInput, req.body));
    setSessionCookie(reply, ctx.env, await openSession(ctx.db, u.id, ctx.env.SESSION_TTL_DAYS, req.headers['user-agent']));
    return { id: u.id, email: u.email, displayName: u.displayName, role: u.role };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.user) await closeSession(ctx.db, req.user.sessionId);
    clearSessionCookie(reply);
    return noContent(reply);
  });

  app.post('/api/auth/password', { config: AUTH_LIMIT }, async (req, reply) => {
    const me = requireUser(req);
    await changePassword(ctx.db, me, parse(changePasswordInput, req.body));
    return noContent(reply);
  });
}
