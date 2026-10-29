import type { FastifyInstance } from 'fastify';
import { changePasswordInput, loginInput, registerInput, resendVerificationInput, verifyEmailInput } from '@rpg/contracts';
import { noContent, parse, requireUser } from '../http';
import { clearSessionCookie, setSessionCookie } from '../plugins/auth';
import {
  authenticate,
  changePassword,
  closeSession,
  needsEmailVerification,
  openSession,
  registerUser,
  registrationStatus,
  resendVerification,
  sendVerificationEmail,
  verifyEmail,
} from '../../application/use-cases/auth';
import { emailVerificationRequired } from '../../config/env';
import type { AppContext } from '../../context';

const AUTH_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/auth/status', async () => registrationStatus(ctx.db, ctx.env.ALLOW_REGISTRATION));

  app.post('/api/auth/register', { config: AUTH_LIMIT }, async (req, reply) => {
    const input = parse(registerInput, req.body);
    const body = req.body as { timezone?: unknown };
    const timezone = typeof body?.timezone === 'string' ? body.timezone : 'America/Sao_Paulo';
    const required = emailVerificationRequired(ctx.env);
    const user = await registerUser(ctx.db, input, { allowRegistration: ctx.env.ALLOW_REGISTRATION, timezone, now: ctx.now(), verificationRequired: required });
    if (needsEmailVerification(user, required)) {
      // A conta existe; sem sessão até confirmar. Se o envio falhar, a pessoa pede outro link na tela.
      let emailSent = true;
      try {
        await sendVerificationEmail(ctx.db, user, { mailer: ctx.mailer, appOrigin: ctx.env.APP_ORIGIN, now: ctx.now() });
      } catch (err) {
        emailSent = false;
        req.log.warn({ code: (err as { code?: string }).code }, 'falha ao enviar o e-mail de confirmação');
      }
      return reply.status(202).send({ verificationRequired: true, email: user.email, emailSent });
    }
    setSessionCookie(reply, ctx.env, await openSession(ctx.db, user.id, ctx.env.SESSION_TTL_DAYS, req.headers['user-agent']));
    return reply.status(201).send({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
  });

  app.post('/api/auth/login', { config: AUTH_LIMIT }, async (req, reply) => {
    const u = await authenticate(ctx.db, parse(loginInput, req.body), { verificationRequired: emailVerificationRequired(ctx.env) });
    setSessionCookie(reply, ctx.env, await openSession(ctx.db, u.id, ctx.env.SESSION_TTL_DAYS, req.headers['user-agent']));
    return { id: u.id, email: u.email, displayName: u.displayName, role: u.role };
  });

  /** Link do e-mail: confirma e já abre a sessão. */
  app.post('/api/auth/verify-email', { config: AUTH_LIMIT }, async (req, reply) => {
    const { token } = parse(verifyEmailInput, req.body);
    const u = await verifyEmail(ctx.db, token, ctx.now());
    setSessionCookie(reply, ctx.env, await openSession(ctx.db, u.id, ctx.env.SESSION_TTL_DAYS, req.headers['user-agent']));
    return { id: u.id, email: u.email, displayName: u.displayName, role: u.role };
  });

  /** Sempre 204: não revela se o e-mail existe ou já foi confirmado. */
  app.post('/api/auth/resend-verification', { config: AUTH_LIMIT }, async (req, reply) => {
    const { email } = parse(resendVerificationInput, req.body);
    try {
      await resendVerification(ctx.db, email, { mailer: ctx.mailer, appOrigin: ctx.env.APP_ORIGIN, now: ctx.now() }, emailVerificationRequired(ctx.env));
    } catch (err) {
      req.log.warn({ code: (err as { code?: string }).code }, 'falha ao reenviar o e-mail de confirmação');
    }
    return noContent(reply);
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
