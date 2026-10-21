import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { achievementInput, inventoryActionInput, itemInput, purchaseInput, reversalInput, seasonInput } from '@rpg/contracts';
import { achievementCriteriaSchema, addDays, evaluateAchievement, metricsNeeded, XP_SOURCES } from '@rpg/engine';
import {
  achievements,
  auditLog,
  coinTransactions,
  grantAttributeXp,
  grantSkillXp,
  attributes,
  inventoryItems,
  items,
  missionEvents,
  missions,
  penaltyApplications,
  purchases,
  rewardGrants,
  seasonRewards,
  seasons,
  skills,
  userAchievements,
  wallets,
} from '../db/schema';
import { badRequest, conflict, notFound } from '../lib/errors';
import { idParam, parse, requireAdmin, requireUser } from '../lib/http';
import { computeMetrics } from '../services/achievements';
import { afterAction } from '../services/hooks';
import { revertPenalty } from '../services/penalties';
import { reverseGrant } from '../services/rewards';
import { advanceSeasons, claimSeasonRewards, closeSeason, seasonStats } from '../services/seasons';
import { inventoryAction, itemAvailability, purchase, refundPurchase } from '../services/shop';
import { attributeHistory, attributeRadar, economy, mastery, parseRange, productivity, progression } from '../services/stats';
import { todayFor } from '../services/time';
import { assertOwned } from '../services/validation';
import { audit } from '../services/audit';
import { registerCrud } from './crud';
import type { AppContext } from '../context';

const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  from: z.string().optional(),
  to: z.string().optional(),
  source: z.string().optional(),
});

export async function registerEconomyRoutes(app: FastifyInstance, ctx: AppContext) {
  // ------------------------------------------------------------------ Loja

  registerCrud(app, ctx, {
    path: '/api/items',
    table: items,
    entity: 'items',
    label: 'Item',
    input: itemInput,
    orderBy: (t) => [asc(t.sortOrder), asc(t.price)],
    prepare: async (tx, userId, data) => {
      await assertOwned(tx, achievements, data.requiredAchievementId, userId, 'Conquista');
      if (data.kind === 'theme' && typeof data.payload.theme !== 'string') throw badRequest('Itens de tema exigem payload.theme');
      return {
        ...data,
        availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
        availableUntil: data.availableUntil ? new Date(data.availableUntil) : null,
      };
    },
  });

  app.get('/api/shop', async (req) => {
    const me = requireUser(req);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const [w] = await ctx.db.select().from(wallets).where(eq(wallets.userId, me.id));
    const list = await ctx.db
      .select()
      .from(items)
      .where(and(eq(items.userId, me.id), isNull(items.archivedAt), sql`${items.price} is not null`, eq(items.active, true)))
      .orderBy(asc(items.sortOrder), asc(items.price));
    const out = [];
    for (const it of list) out.push({ ...it, availability: await itemAvailability(ctx.db, me.id, it, w?.balance ?? 0, today) });
    return { balance: w?.balance ?? 0, items: out };
  });

  app.post('/api/shop/purchase', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const me = requireUser(req);
    const input = parse(purchaseInput, req.body);
    const key = String(req.headers['idempotency-key'] ?? '');
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw badRequest('Cabeçalho Idempotency-Key obrigatório (8–100 caracteres).');
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const r = await ctx.db.transaction(async (tx) => {
      const p = await purchase(tx, me.id, input.itemId, input.quantity, key, today);
      return { ...p, after: p.replayed ? null : await afterAction(tx, me.id, today) };
    });
    return reply.status(r.replayed ? 200 : 201).send(r);
  });

  app.post('/api/purchases/:id/refund', async (req) => {
    const me = requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const { reason } = parse(reversalInput, req.body);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return ctx.db.transaction((tx) => refundPurchase(tx, me.id, id, reason, me.id, today));
  });

  app.get('/api/purchases', async (req) => {
    const me = requireUser(req);
    return ctx.db.select().from(purchases).where(eq(purchases.userId, me.id)).orderBy(desc(purchases.createdAt)).limit(300);
  });

  // ------------------------------------------------------------------ Inventário

  app.get('/api/inventory', async (req) => {
    const me = requireUser(req);
    const rows = await ctx.db
      .select({ inv: inventoryItems, item: items })
      .from(inventoryItems)
      .innerJoin(items, eq(items.id, inventoryItems.itemId))
      .where(eq(inventoryItems.userId, me.id))
      .orderBy(desc(inventoryItems.acquiredAt));
    return rows.map((r) => ({ ...r.inv, item: r.item }));
  });

  app.post('/api/inventory/:id/action', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const input = parse(inventoryActionInput, req.body);
    return ctx.db.transaction(async (tx) => {
      const r = await inventoryAction(tx, me.id, id, input.action, input.note);
      await audit(tx, { actorId: me.id, userId: me.id, action: `inventory.${input.action}`, entityType: 'inventory_items', entityId: id, after: r });
      return r;
    });
  });

  // ------------------------------------------------------------------ Conquistas

  registerCrud(app, ctx, {
    path: '/api/achievement-definitions',
    table: achievements,
    entity: 'achievements',
    label: 'Conquista',
    input: achievementInput,
    immutable: ['key'],
    orderBy: (t) => [asc(t.sortOrder)],
    prepare: async (tx, userId, data) => {
      await assertOwned(tx, items, data.rewardItemId, userId, 'Item');
      return { ...data };
    },
  });

  app.get('/api/achievements', async (req) => {
    const me = requireUser(req);
    const defs = await ctx.db.select().from(achievements).where(and(eq(achievements.userId, me.id), isNull(achievements.archivedAt))).orderBy(asc(achievements.sortOrder));
    const unlocked = await ctx.db.select().from(userAchievements).where(eq(userAchievements.userId, me.id));
    const parsed = defs.map((d) => ({ d, c: achievementCriteriaSchema.safeParse(d.criteria) }));
    const metrics = await computeMetrics(ctx.db, me.id, metricsNeeded(parsed.filter((p) => p.c.success).map((p) => p.c.data!)));
    return parsed.map(({ d, c }) => {
      const u = unlocked.find((x) => x.achievementId === d.id);
      const ev = c.success ? evaluateAchievement(c.data, metrics) : null;
      const hidden = d.secret && !u;
      return {
        id: d.id,
        key: d.key,
        name: hidden ? 'Conquista secreta' : d.name,
        description: hidden ? 'Continue explorando para revelá-la.' : d.description,
        category: d.category,
        icon: hidden ? 'lock' : d.icon,
        rarity: d.rarity,
        secret: d.secret,
        hidden,
        rewardXp: d.rewardXp,
        rewardCoins: d.rewardCoins,
        unlockedAt: u?.unlockedAt ?? null,
        progress: u ? 1 : (ev?.progress ?? 0),
        conditions: hidden ? [] : (ev?.conditions ?? []),
      };
    });
  });

  // ------------------------------------------------------------------ Temporadas

  app.get('/api/seasons', async (req) => {
    const me = requireUser(req);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    await ctx.db.transaction((tx) => advanceSeasons(tx, me.id, today));
    const list = await ctx.db.select().from(seasons).where(eq(seasons.userId, me.id)).orderBy(desc(seasons.startDate));
    const rewards = await ctx.db.select().from(seasonRewards).where(eq(seasonRewards.userId, me.id)).orderBy(asc(seasonRewards.thresholdXp));
    return Promise.all(
      list.map(async (s) => ({ ...s, stats: s.status === 'closed' ? s.summary : await seasonStats(ctx.db, s, today), rewards: rewards.filter((r) => r.seasonId === s.id) })),
    );
  });

  const saveSeason = (userId: string, data: z.infer<typeof seasonInput>, id: string | null, today: string) =>
    ctx.db.transaction(async (tx) => {
      if (data.endDate < data.startDate) throw badRequest('A temporada deve terminar após começar.');
      const { rewards, ...rest } = data;
      let row;
      if (id) {
        const [prev] = await tx.select().from(seasons).where(and(eq(seasons.id, id), eq(seasons.userId, userId))).for('update');
        if (!prev) throw notFound('Temporada');
        if (prev.status === 'closed') throw conflict('Temporada encerrada não pode ser editada.');
        [row] = await tx.update(seasons).set(rest).where(eq(seasons.id, id)).returning();
      } else {
        [row] = await tx.insert(seasons).values({ ...rest, userId, status: data.startDate <= today ? 'active' : 'planned' }).returning();
      }
      const existing = await tx.select().from(seasonRewards).where(eq(seasonRewards.seasonId, row!.id));
      const keep = new Set(rewards.map((r) => r.id).filter(Boolean) as string[]);
      const removable = existing.filter((e) => !keep.has(e.id) && !e.claimedAt).map((e) => e.id);
      if (removable.length) await tx.delete(seasonRewards).where(inArray(seasonRewards.id, removable));
      for (const r of rewards) {
        await assertOwned(tx, items, r.itemId, userId, 'Item');
        const prev = existing.find((e) => e.id === r.id);
        if (prev?.claimedAt) continue; // recompensas já resgatadas são imutáveis
        const values = { title: r.title, thresholdXp: r.thresholdXp, coins: r.coins, itemId: r.itemId ?? null };
        if (prev) await tx.update(seasonRewards).set(values).where(eq(seasonRewards.id, prev.id));
        else await tx.insert(seasonRewards).values({ ...values, userId, seasonId: row!.id });
      }
      await audit(tx, { actorId: userId, userId, action: id ? 'update' : 'create', entityType: 'seasons', entityId: row!.id, after: { ...row, rewards } });
      await claimSeasonRewards(tx, row!, today);
      return row!;
    });

  app.post('/api/seasons', async (req, reply) => {
    const me = requireUser(req);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return reply.status(201).send(await saveSeason(me.id, parse(seasonInput, req.body), null, today));
  });
  app.put('/api/seasons/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return saveSeason(me.id, parse(seasonInput, req.body), id, today);
  });
  /** Encerra antecipadamente: fecha a temporada ontem, preservando todo o progresso vitalício. */
  app.post('/api/seasons/:id/close', async (req) => {
    const me = requireUser(req);
    const { id } = parse(idParam, req.params);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    return ctx.db.transaction(async (tx) => {
      const [s] = await tx.select().from(seasons).where(and(eq(seasons.id, id), eq(seasons.userId, me.id))).for('update');
      if (!s) throw notFound('Temporada');
      if (s.status === 'closed') throw conflict('Temporada já encerrada.');
      await closeSeason(tx, s, addDays(today, -1));
      await afterAction(tx, me.id, today);
      const [fresh] = await tx.select().from(seasons).where(eq(seasons.id, id));
      return fresh;
    });
  });

  // ------------------------------------------------------------------ Estatísticas

  const rangeOf = async (req: { query: unknown }, userId: string) => {
    const today = await todayFor(ctx.db, userId, ctx.now());
    return { range: parseRange(req.query as Record<string, string>, today), today };
  };
  app.get('/api/stats/progression', async (req) => {
    const me = requireUser(req);
    const { range } = await rangeOf(req, me.id);
    return progression(ctx.db, me.id, range);
  });
  app.get('/api/stats/attributes/radar', async (req) => {
    const me = requireUser(req);
    const today = await todayFor(ctx.db, me.id, ctx.now());
    const { compareDays } = parse(z.object({ compareDays: z.coerce.number().int().min(1).max(3650).default(30) }), req.query);
    return attributeRadar(ctx.db, me.id, today, compareDays);
  });
  app.get('/api/stats/attributes/history', async (req) => {
    const me = requireUser(req);
    const { range } = await rangeOf(req, me.id);
    return attributeHistory(ctx.db, me.id, range);
  });
  app.get('/api/stats/productivity', async (req) => {
    const me = requireUser(req);
    const { range } = await rangeOf(req, me.id);
    return productivity(ctx.db, me.id, range);
  });
  app.get('/api/stats/economy', async (req) => {
    const me = requireUser(req);
    const { range, today } = await rangeOf(req, me.id);
    return economy(ctx.db, me.id, range, today);
  });
  app.get('/api/stats/mastery', async (req) => {
    const me = requireUser(req);
    return mastery(ctx.db, me.id);
  });

  // ------------------------------------------------------------------ Histórico e auditoria

  app.get('/api/history/grants', async (req) => {
    const me = requireUser(req);
    const q = parse(historyQuery, req.query);
    const conds: SQL[] = [eq(rewardGrants.userId, me.id)];
    if (q.from) conds.push(gte(rewardGrants.localDate, q.from));
    if (q.to) conds.push(lte(rewardGrants.localDate, q.to));
    if (q.source && (XP_SOURCES as readonly string[]).includes(q.source)) conds.push(eq(rewardGrants.xpSource, q.source as (typeof XP_SOURCES)[number]));
    const rows = await ctx.db.select().from(rewardGrants).where(and(...conds)).orderBy(desc(rewardGrants.createdAt)).limit(q.limit).offset(q.offset);
    const ids = rows.map((r) => r.id);
    const attrs = ids.length
      ? await ctx.db.select({ grantId: grantAttributeXp.grantId, code: attributes.code, amount: grantAttributeXp.amount }).from(grantAttributeXp).innerJoin(attributes, eq(attributes.id, grantAttributeXp.attributeId)).where(inArray(grantAttributeXp.grantId, ids))
      : [];
    const sk = ids.length
      ? await ctx.db.select({ grantId: grantSkillXp.grantId, name: skills.name, amount: grantSkillXp.amount }).from(grantSkillXp).innerJoin(skills, eq(skills.id, grantSkillXp.skillId)).where(inArray(grantSkillXp.grantId, ids))
      : [];
    return rows.map((r) => ({ ...r, attributes: attrs.filter((a) => a.grantId === r.id), skills: sk.filter((s) => s.grantId === r.id) }));
  });

  app.get('/api/history/coins', async (req) => {
    const me = requireUser(req);
    const q = parse(historyQuery, req.query);
    const conds: SQL[] = [eq(coinTransactions.userId, me.id)];
    if (q.from) conds.push(gte(coinTransactions.localDate, q.from));
    if (q.to) conds.push(lte(coinTransactions.localDate, q.to));
    return ctx.db.select().from(coinTransactions).where(and(...conds)).orderBy(desc(coinTransactions.createdAt)).limit(q.limit).offset(q.offset);
  });

  app.get('/api/history/penalties', async (req) => {
    const me = requireUser(req);
    const q = parse(historyQuery, req.query);
    return ctx.db.select().from(penaltyApplications).where(eq(penaltyApplications.userId, me.id)).orderBy(desc(penaltyApplications.createdAt)).limit(q.limit).offset(q.offset);
  });

  app.get('/api/history/missions', async (req) => {
    const me = requireUser(req);
    const q = parse(historyQuery, req.query);
    return ctx.db
      .select({ e: missionEvents, title: missions.title })
      .from(missionEvents)
      .innerJoin(missions, eq(missions.id, missionEvents.missionId))
      .where(eq(missionEvents.userId, me.id))
      .orderBy(desc(missionEvents.createdAt))
      .limit(q.limit)
      .offset(q.offset)
      .then((rows) => rows.map((r) => ({ ...r.e, missionTitle: r.title })));
  });

  app.get('/api/history/audit', async (req) => {
    const me = requireUser(req);
    const q = parse(historyQuery, req.query);
    return ctx.db.select().from(auditLog).where(eq(auditLog.userId, me.id)).orderBy(desc(auditLog.createdAt)).limit(q.limit).offset(q.offset);
  });

  /** Correções com trilha de auditoria (restritas ao administrador). */
  app.post('/api/history/grants/:id/reverse', async (req) => {
    const me = requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const { reason } = parse(reversalInput, req.body);
    return ctx.db.transaction(async (tx) => {
      const r = await reverseGrant(tx, me.id, id, reason, me.id);
      await audit(tx, { actorId: me.id, userId: me.id, action: 'grant.reverse', entityType: 'reward_grants', entityId: id, meta: { reason, reversalId: r.grantId } });
      return r;
    });
  });

  app.post('/api/history/penalties/:id/revert', async (req) => {
    const me = requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const { reason } = parse(reversalInput, req.body);
    return ctx.db.transaction((tx) => revertPenalty(tx, me.id, id, reason, me.id));
  });
}
