import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../../persistence/client';
import { sessions, users } from '../../persistence/schema';
import { randomToken, sha256 } from '../../shared/crypto';
import type { Env } from '../../config/env';

export const SESSION_COOKIE = 'rpg_sid';

/** Resolve a sessão do cookie em cada requisição (sem lançar erro; as rotas exigem autenticação). */
export function registerAuth(app: FastifyInstance, db: Db, env: Env) {
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const sid = sha256(token);
    const [row] = await db
      .select({ s: sessions, u: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date()), isNull(users.disabledAt)));
    if (!row) return;
    req.user = { id: row.u.id, email: row.u.email, role: row.u.role, displayName: row.u.displayName, sessionId: sid };
    // Renovação deslizante: atualiza no máximo uma vez por hora.
    if (Date.now() - row.s.lastSeenAt.getTime() > 3_600_000) {
      const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);
      await db.update(sessions).set({ lastSeenAt: new Date(), expiresAt }).where(eq(sessions.id, sid));
    }
  });
}

export async function createSession(db: Db, env: Env, reply: FastifyReply, userId: string, userAgent?: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
