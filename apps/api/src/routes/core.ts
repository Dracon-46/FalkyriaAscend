import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { configUpdateInput, profileInput, settingsInput } from '@rpg/contracts';
import {
  DEFAULT_GAME_CONFIG,
  DEFAULT_PROFILES,
  curveTable,
  formatDuration,
  gameConfigSchema,
  levelFromXp,
  simulateProfile,
} from '@rpg/engine';
import * as schema from '../db/schema';
import { characterProgress, gameConfigs, notifications, pageVisits, sessions, userSettings, users } from '../db/schema';
import { verifyPassword } from '../lib/crypto';
import { badRequest, unauthorized } from '../lib/errors';
import { noContent, parse, requireAdmin, requireUser } from '../lib/http';
import { clearSessionCookie } from '../plugins/auth';
import { evaluateAchievements } from '../services/achievements';
import { audit } from '../services/audit';
import { getActiveConfig, publishConfig } from '../services/config';
import { buildDashboard, characterSummary } from '../services/dashboard';
import { evaluateUser } from '../services/evaluation';
import { NOTIFICATION_CATEGORIES } from '../services/notifications';
import { isValidTimezone, todayFor } from '../services/time';
import type { AppContext } from '../context';

const lastEvaluation = new Map<string, number>();

/** Avaliação preguiçosa: garante que o dia anterior foi fechado mesmo sem o agendador. */
export async function ensureEvaluated(ctx: AppContext, userId: string, force = false) {
  const last = lastEvaluation.get(userId) ?? 0;
  if (!force && Date.now() - last < 5 * 60_000) return;
  lastEvaluation.set(userId, Date.now());
  await evaluateUser(ctx.db, userId, ctx.now());
}

export function resetEvaluationThrottle() {
  lastEvaluation.clear();
}

export async function registerCoreRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/me', async (req) => {
    const me = requireUser(req);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const [u] = await ctx.db.select().from(users).where(eq(users.id, me.id));
    const [settings] = await ctx.db.select().from(userSettings).where(eq(userSettings.userId, me.id));
    const [unread] = await ctx.db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)));
    return {
      user: { id: u!.id, email: u!.email, displayName: u!.displayName, role: u!.role, characterClass: u!.characterClass, bio: u!.bio, isDemo: u!.isDemo, createdAt: u!.createdAt },
      settings,
      today,
      character: await characterSummary(ctx.db, me.id, today),
      unreadNotifications: unread?.n ?? 0,
    };
  });

  app.get('/api/dashboard', async (req) => {
    const me = requireUser(req);
    await ensureEvaluated(ctx, me.id);
    return buildDashboard(ctx.db, me.id, await todayFor(ctx.db, me.id, ctx.now()));
  });

  app.put('/api/profile', async (req) => {
    const me = requireUser(req);
    const input = parse(profileInput, req.body);
    const [before] = await ctx.db.select().from(users).where(eq(users.id, me.id));
    const [u] = await ctx.db
      .update(users)
      .set({ displayName: input.displayName, characterClass: input.characterClass ?? null, bio: input.bio ?? null, updatedAt: new Date() })
      .where(eq(users.id, me.id))
      .returning();
    await audit(ctx.db, { actorId: me.id, userId: me.id, action: 'profile.update', entityType: 'users', entityId: me.id, before, after: u });
    return { id: u!.id, displayName: u!.displayName, characterClass: u!.characterClass, bio: u!.bio };
  });

  app.get('/api/settings', async (req) => {
    const me = requireUser(req);
    const [s] = await ctx.db.select().from(userSettings).where(eq(userSettings.userId, me.id));
    return s;
  });

  app.put('/api/settings', async (req) => {
    const me = requireUser(req);
    const input = parse(settingsInput, req.body);
    if (input.timezone && !isValidTimezone(input.timezone)) throw badRequest('Fuso horário inválido');
    return ctx.db.transaction(async (tx) => {
      const [before] = await tx.select().from(userSettings).where(eq(userSettings.userId, me.id)).for('update');
      const [after] = await tx
        .update(userSettings)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(userSettings.userId, me.id))
        .returning();
      await audit(tx, { actorId: me.id, userId: me.id, action: 'settings.update', entityType: 'user_settings', entityId: me.id, before, after });
      return after;
    });
  });

  app.get('/api/notifications', async (req) => {
    const me = requireUser(req);
    const rows = await ctx.db.select().from(notifications).where(eq(notifications.userId, me.id)).orderBy(desc(notifications.createdAt)).limit(100);
    return { categories: NOTIFICATION_CATEGORIES, items: rows };
  });
  app.post('/api/notifications/read-all', async (req, reply) => {
    const me = requireUser(req);
    await ctx.db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)));
    return noContent(reply);
  });
  app.post('/api/notifications/:id/read', async (req, reply) => {
    const me = requireUser(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await ctx.db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, me.id)));
    return noContent(reply);
  });

  app.post('/api/visits', async (req, reply) => {
    const me = requireUser(req);
    const { page } = parse(z.object({ page: z.string().regex(/^[a-z0-9-]{1,40}$/) }), req.body);
    const inserted = await ctx.db.insert(pageVisits).values({ userId: me.id, page }).onConflictDoNothing().returning();
    if (inserted.length) {
      await ctx.db.transaction(async (tx) => evaluateAchievements(tx, me.id, await todayFor(tx, me.id, ctx.now())));
    }
    return noContent(reply);
  });

  // ---------------------------------------------------------- Configuração da progressão

  app.get('/api/config', async (req) => {
    const me = requireUser(req);
    const active = await getActiveConfig(ctx.db, me.id);
    const versions = await ctx.db
      .select({ version: gameConfigs.version, active: gameConfigs.active, note: gameConfigs.note, createdAt: gameConfigs.createdAt })
      .from(gameConfigs)
      .where(eq(gameConfigs.userId, me.id))
      .orderBy(desc(gameConfigs.version));
    return { active, defaults: DEFAULT_GAME_CONFIG, versions, curveTable: curveTable(active.config.curves.character, [2, 5, 10, 20, 30, 45, 60, 80, 100]) };
  });

  /** Pré-visualização: impacto de uma configuração candidata (nível atual e simulações) sem gravar. */
  app.post('/api/config/preview', async (req) => {
    const me = requireUser(req);
    const body = parse(z.object({ config: z.unknown() }), req.body);
    const r = gameConfigSchema.safeParse({ ...(body.config as object), version: 1 });
    if (!r.success) throw badRequest('Configuração inválida', { issues: r.error.issues });
    const cfg = r.data;
    const [cp] = await ctx.db.select().from(characterProgress).where(eq(characterProgress.userId, me.id));
    const current = await getActiveConfig(ctx.db, me.id);
    const xp = cp?.lifetimeXp ?? 0;
    const marks = [5, 10, 20, 30, 45, 60, 80, 100];
    return {
      currentLevel: levelFromXp(xp, current.config.curves.character).level,
      newLevel: levelFromXp(xp, cfg.curves.character).level,
      curveTable: curveTable(cfg.curves.character, [2, 5, 10, 20, 30, 45, 60, 80, 100]),
      simulations: DEFAULT_PROFILES.map((p) => {
        const s = simulateProfile(p, cfg, { days: 365 * 10, levelMarks: marks });
        return { profile: p.label, xpPerDay: Math.round(s.avgXpPerDay), coinsPerDay: Math.round(s.avgCoinsPerDay * 10) / 10, reached: marks.map((m) => ({ level: m, when: formatDuration(s.levelReachedDay[m] ?? null) })) };
      }),
    };
  });

  /** Publica nova versão. Restrito ao administrador; nunca recalcula recompensas antigas. */
  app.put('/api/config', async (req) => {
    const me = requireAdmin(req);
    const input = parse(configUpdateInput, req.body);
    return ctx.db.transaction(async (tx) => {
      const before = await getActiveConfig(tx, me.id);
      const r = gameConfigSchema.safeParse({ ...(input.config as object), version: before.version + 1 });
      if (!r.success) throw badRequest('Configuração inválida', { issues: r.error.issues });
      const after = await publishConfig(tx, me.id, r.data, input.note);
      // O nível é derivado do XP vitalício com a curva vigente; o histórico de níveis alcançados permanece.
      const [cp] = await tx.select().from(characterProgress).where(eq(characterProgress.userId, me.id)).for('update');
      const newLevel = levelFromXp(cp?.lifetimeXp ?? 0, after.config.curves.character).level;
      await tx.update(characterProgress).set({ level: newLevel }).where(eq(characterProgress.userId, me.id));
      for (const a of await tx.select().from(schema.attributes).where(eq(schema.attributes.userId, me.id))) {
        await tx.update(schema.attributes).set({ level: levelFromXp(a.xp, after.config.curves.attribute).level }).where(eq(schema.attributes.id, a.id));
      }
      for (const s of await tx.select().from(schema.skills).where(eq(schema.skills.userId, me.id))) {
        await tx.update(schema.skills).set({ level: levelFromXp(s.xp, after.config.curves.mastery).level }).where(eq(schema.skills.id, s.id));
      }
      await audit(tx, { actorId: me.id, userId: me.id, action: 'config.publish', entityType: 'game_configs', entityId: String(after.version), before: before.config, after: after.config, meta: { note: input.note } });
      return after;
    });
  });

  // ---------------------------------------------------------- Exportação, backup e exclusão

  app.get('/api/export', async (req, reply) => {
    const me = requireUser(req);
    const out: Record<string, unknown[]> = {};
    const skip = new Set(['sessions', 'users']);
    for (const [name, table] of Object.entries(schema)) {
      if (typeof table !== 'object' || !table || !('userId' in (table as object)) || skip.has(name)) continue;
      out[name] = await ctx.db.select().from(table as any).where(eq((table as any).userId, me.id));
    }
    const [u] = await ctx.db.select({ id: users.id, email: users.email, displayName: users.displayName, createdAt: users.createdAt }).from(users).where(eq(users.id, me.id));
    // Credenciais de integração nunca são exportadas.
    out.integrationConnections = (out.integrationConnections ?? []).map((c: any) => ({ ...c, accessTokenEnc: undefined, refreshTokenEnc: undefined }));
    await audit(ctx.db, { actorId: me.id, userId: me.id, action: 'data.export', entityType: 'users', entityId: me.id });
    reply.header('content-disposition', `attachment; filename="ascend-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return { format: 'ascend-export', version: 1, exportedAt: new Date().toISOString(), user: u, data: out };
  });

  app.post('/api/account/delete', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const me = requireUser(req);
    const { password, confirm } = parse(z.object({ password: z.string().min(1), confirm: z.literal('EXCLUIR') }), req.body);
    void confirm;
    const [u] = await ctx.db.select().from(users).where(eq(users.id, me.id));
    if (!u || !(await verifyPassword(password, u.passwordHash))) throw unauthorized('Senha incorreta.');
    // Exclusão explícita da conta: as tabelas do usuário são removidas em cascata a partir de users.
    await ctx.db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, me.id));
      await deleteUserData(tx, me.id);
    });
    clearSessionCookie(reply);
    return noContent(reply);
  });
}

/**
 * Remove todos os dados do usuário. Entre entidades, as chaves usam NO ACTION (verificação ao fim
 * do comando): exclusões isoladas de registros com histórico falham, mas a exclusão explícita da
 * conta remove tudo em cascata a partir de `users` num único comando.
 */
export async function deleteUserData(tx: any, userId: string) {
  await tx.delete(schema.users).where(eq(schema.users.id, userId));
}
