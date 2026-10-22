import type { FastifyInstance } from 'fastify';
import { and, count, eq, ne, sql } from 'drizzle-orm';
import { changePasswordInput, loginInput, registerInput } from '@rpg/contracts';
import { localDateOf } from '@rpg/engine';
import { sessions, users } from '../db/schema';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { conflict, forbidden, unauthorized } from '../lib/errors';
import { noContent, parse, requireUser } from '../lib/http';
import { clearSessionCookie, createSession } from '../plugins/auth';
import { audit } from '../services/audit';
import { seedUserDefaults } from '../services/defaults';
import type { AppContext } from '../context';

const AUTH_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

// Hash fixo para igualar o tempo de resposta quando o e-mail não existe.
let dummyHash: Promise<string> | null = null;

export async function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/auth/status', async () => {
    // Contas de demonstração não contam: o primeiro usuário real sempre vira administrador.
    const [r] = await ctx.db.select({ n: count() }).from(users).where(eq(users.isDemo, false));
    return { hasUsers: (r?.n ?? 0) > 0, registrationOpen: (r?.n ?? 0) === 0 || ctx.env.ALLOW_REGISTRATION };
  });

  app.post('/api/auth/register', { config: AUTH_LIMIT }, async (req, reply) => {
    const input = parse(registerInput, req.body);
    const user = await ctx.db.transaction(async (tx) => {
      // Trava a criação do primeiro usuário (que se torna administrador).
      await tx.execute(sql`select pg_advisory_xact_lock(4242)`);
      const [r] = await tx.select({ n: count() }).from(users).where(eq(users.isDemo, false));
      const first = (r?.n ?? 0) === 0;
      if (!first && !ctx.env.ALLOW_REGISTRATION) throw forbidden('Novos cadastros estão desativados nesta instalação.');
      const [exists] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = lower(${input.email})`);
      if (exists) throw conflict('E-mail já cadastrado.');
      const [u] = await tx
        .insert(users)
        .values({ email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password), displayName: input.displayName, role: first ? 'admin' : 'user' })
        .returning();
      const tz = typeof (req.body as { timezone?: unknown })?.timezone === 'string' ? (req.body as { timezone: string }).timezone : 'America/Sao_Paulo';
      await seedUserDefaults(tx, u!.id, localDateOf(ctx.now(), tz));
      await audit(tx, { actorId: u!.id, userId: u!.id, action: 'user.register', entityType: 'users', entityId: u!.id, meta: { role: u!.role } });
      return u!;
    });
    await createSession(ctx.db, ctx.env, reply, user.id, req.headers['user-agent']);
    return reply.status(201).send({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
  });

  app.post('/api/auth/login', { config: AUTH_LIMIT }, async (req, reply) => {
    const input = parse(loginInput, req.body);
    const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = lower(${input.email})`);
    dummyHash ??= hashPassword('senha-inexistente-para-tempo-constante');
    const ok = await verifyPassword(input.password, u?.passwordHash ?? (await dummyHash));
    if (!u || !ok) throw unauthorized('E-mail ou senha inválidos.');
    if (u.disabledAt) throw forbidden('Conta desativada.');
    await createSession(ctx.db, ctx.env, reply, u.id, req.headers['user-agent']);
    await audit(ctx.db, { actorId: u.id, userId: u.id, action: 'user.login', entityType: 'users', entityId: u.id });
    return { id: u.id, email: u.email, displayName: u.displayName, role: u.role };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.user) await ctx.db.delete(sessions).where(eq(sessions.id, req.user.sessionId));
    clearSessionCookie(reply);
    return noContent(reply);
  });

  app.post('/api/auth/password', { config: AUTH_LIMIT }, async (req, reply) => {
    const me = requireUser(req);
    const input = parse(changePasswordInput, req.body);
    const [u] = await ctx.db.select().from(users).where(eq(users.id, me.id));
    if (!u || !(await verifyPassword(input.currentPassword, u.passwordHash))) throw unauthorized('Senha atual incorreta.');
    await ctx.db.update(users).set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() }).where(eq(users.id, me.id));
    // Encerra as demais sessões.
    await ctx.db.delete(sessions).where(and(eq(sessions.userId, me.id), ne(sessions.id, me.sessionId)));
    await audit(ctx.db, { actorId: me.id, userId: me.id, action: 'user.password_change', entityType: 'users', entityId: me.id });
    return noContent(reply);
  });
}
