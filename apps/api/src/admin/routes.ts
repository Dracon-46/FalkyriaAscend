import type { FastifyInstance } from 'fastify';
import { and, asc, count, desc, eq, getTableColumns, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { adjustmentInput, attributeWeights as weightsSchema, localDate, registerInput, reversalInput } from '@rpg/contracts';
import { achievementCriteriaSchema, isLocalDate, validateDifficulty } from '@rpg/engine';
import { coinTransactions, rewardGrants, userAchievements, users } from '../db/schema';
import { hashPassword } from '../lib/crypto';
import { badRequest, conflict, forbidden, notFound, pgCode, PG, unprocessable } from '../lib/errors';
import { noContent, parse, requireAdmin } from '../lib/http';
import { audit } from '../services/audit';
import { getActiveConfig } from '../services/config';
import { seedUserDefaults } from '../services/defaults';
import { evaluateUser } from '../services/evaluation';
import { checkIntegrity, rebuildProjections } from '../services/integrity';
import { grantReward, reverseGrant } from '../services/rewards';
import { todayFor } from '../services/time';
import { postCoinTx } from '../services/wallet';
import { validateWeights } from '../services/validation';
import { fieldsOf, getResource, RESOURCES, type FieldMeta, type ResourceDef } from './registry';
import type { AppContext } from '../context';
import { localDateOf } from '@rpg/engine';

const listQuery = z.object({
  userId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().max(100).optional(),
  sort: z.string().max(60).optional(),
  dir: z.enum(['asc', 'desc']).default('desc'),
  includeArchived: z.enum(['true', 'false']).default('true'),
});

/** Converte o valor recebido do formulário para o tipo da coluna, com validação. */
function coerceField(f: FieldMeta, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || value === '') {
    if (f.required) throw badRequest(`${f.label}: obrigatório`);
    return null;
  }
  switch (f.type) {
    case 'uuid':
    case 'ref':
      return z.uuid(`${f.label}: identificador inválido`).parse(value);
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n)) throw badRequest(`${f.label}: número inteiro esperado`);
      return n;
    }
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw badRequest(`${f.label}: número esperado`);
      return n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'false') return value === 'true';
      throw badRequest(`${f.label}: verdadeiro/falso esperado`);
    case 'date':
      if (typeof value !== 'string' || !isLocalDate(value)) throw badRequest(`${f.label}: data AAAA-MM-DD esperada`);
      return value;
    case 'datetime': {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) throw badRequest(`${f.label}: data/hora inválida`);
      return d;
    }
    case 'enum':
      if (!f.enumValues!.includes(String(value))) throw badRequest(`${f.label}: valor deve ser um de ${f.enumValues!.join(', ')}`);
      return String(value);
    case 'json':
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          throw badRequest(`${f.label}: JSON inválido`);
        }
      }
      return value;
    default:
      if (typeof value !== 'string') throw badRequest(`${f.label}: texto esperado`);
      if (value.length > 20_000) throw badRequest(`${f.label}: texto muito longo`);
      return value;
  }
}

async function validateSpecific(ctx: AppContext, def: ResourceDef, userId: string, values: Record<string, unknown>, existing: Record<string, unknown> | null) {
  const merged = { ...(existing ?? {}), ...values };
  if ('attributeWeights' in values && values.attributeWeights != null) {
    values.attributeWeights = await validateWeights(ctx.db, userId, parse(weightsSchema, values.attributeWeights));
  }
  if (def.key === 'achievements' && 'criteria' in values) values.criteria = parse(achievementCriteriaSchema, values.criteria);
  if (def.key === 'missions') {
    const { config } = await getActiveConfig(ctx.db, userId);
    const errors = validateDifficulty(
      { type: merged.type as never, difficulty: merged.difficulty as never, startDate: merged.startDate as string | null, dueDate: merged.dueDate as string | null, objectiveCount: 99 },
      config,
    ).filter((e) => !e.includes('objetivos'));
    if (errors.length) throw unprocessable(errors.join(' '));
  }
  if (def.key === 'users' && 'role' in values && existing && existing.id === userId && values.role !== 'admin') {
    throw conflict('Você não pode remover seu próprio papel de administrador.');
  }
}

export async function registerAdminRoutes(app: FastifyInstance, ctx: AppContext) {
  /** Usuário-alvo: por padrão o próprio administrador; `?userId=` permite gerenciar outra conta. */
  const targetUser = async (adminId: string, userId?: string) => {
    if (!userId || userId === adminId) return adminId;
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!u) throw notFound('Usuário');
    return u.id;
  };

  app.get('/api/admin/meta', async (req) => {
    requireAdmin(req);
    return RESOURCES.map((r) => ({
      key: r.key,
      label: r.label,
      group: r.group,
      mode: r.composite ? 'readonly' : r.mode,
      display: r.display,
      note: r.note ?? null,
      archivable: 'archivedAt' in getTableColumns(r.table),
      fields: fieldsOf(r),
    }));
  });

  const resolve = (key: string) => {
    const def = getResource(key);
    if (!def) throw notFound('Recurso');
    return def;
  };

  app.get('/api/admin/r/:resource', async (req) => {
    const admin = requireAdmin(req);
    const { resource } = parse(z.object({ resource: z.string() }), req.params);
    const def = resolve(resource);
    const q = parse(listQuery, req.query);
    const t = def.table as any;
    const uid = await targetUser(admin.id, q.userId);
    const conds: SQL[] = [];
    if (!def.global) conds.push(eq(t.userId, uid));
    if (q.includeArchived === 'false' && t.archivedAt) conds.push(isNull(t.archivedAt));
    const fields = fieldsOf(def);
    if (q.q) {
      const textCols = fields.filter((f) => ['text', 'longtext', 'enum'].includes(f.type));
      if (textCols.length) conds.push(or(...textCols.map((f) => sql`${t[f.key]}::text ilike ${'%' + q.q + '%'}`))!);
    }
    const sortField = fields.find((f) => f.key === q.sort) ?? fields.find((f) => f.key === 'createdAt') ?? fields[0]!;
    const where = conds.length ? and(...conds) : undefined;
    const rows = await ctx.db
      .select()
      .from(def.table)
      .where(where)
      .orderBy(q.dir === 'asc' ? asc(t[sortField.key]) : desc(t[sortField.key]))
      .limit(q.limit)
      .offset(q.offset);
    const [total] = await ctx.db.select({ n: count() }).from(def.table).where(where);
    const hidden = new Set(def.hidden ?? []);
    return {
      total: total?.n ?? 0,
      rows: rows.map((r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => !hidden.has(k)))),
    };
  });

  app.get('/api/admin/r/:resource/:id', async (req) => {
    const admin = requireAdmin(req);
    const { resource, id } = parse(z.object({ resource: z.string(), id: z.string() }), req.params);
    const def = resolve(resource);
    if (def.composite) throw badRequest('Recurso de chave composta: consulte pela listagem.');
    const t = def.table as any;
    const q = parse(listQuery.pick({ userId: true }), req.query);
    const uid = await targetUser(admin.id, q.userId);
    const [row] = await ctx.db
      .select()
      .from(def.table)
      .where(def.global ? eq(t.id, id) : and(eq(t[t.id ? 'id' : 'userId'], id), eq(t.userId, uid)));
    if (!row) throw notFound(def.label);
    for (const h of def.hidden ?? []) delete (row as Record<string, unknown>)[h];
    return row;
  });

  const buildValues = (def: ResourceDef, body: unknown, creating: boolean) => {
    if (typeof body !== 'object' || !body) throw badRequest('Corpo inválido');
    const fields = fieldsOf(def);
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.readonly) continue;
      const v = coerceField(f, (body as Record<string, unknown>)[f.key]);
      if (v !== undefined) values[f.key] = v;
      else if (creating && f.required) throw badRequest(`${f.label}: obrigatório`);
    }
    return values;
  };

  const writeGuard = (def: ResourceDef) => {
    if (def.mode !== 'crud' || def.composite) throw forbidden(`${def.label}: somente leitura. ${def.note ?? ''}`.trim());
  };

  const pgErrors = (err: unknown, def: ResourceDef) => {
    const code = pgCode(err);
    if (code === PG.foreignKeyViolation) throw conflict(`${def.label}: há registros vinculados (ou a referência informada não existe). Arquive em vez de excluir.`);
    if (code === PG.uniqueViolation) throw conflict(`${def.label}: valor duplicado em campo único.`);
    if (code === PG.checkViolation) throw unprocessable(`${def.label}: valor viola uma regra de integridade.`);
    throw err;
  };

  app.post('/api/admin/r/:resource', async (req, reply) => {
    const admin = requireAdmin(req);
    const { resource } = parse(z.object({ resource: z.string() }), req.params);
    const def = resolve(resource);
    writeGuard(def);
    if (def.key === 'users') throw badRequest('Use "Novo usuário" (POST /api/admin/users) para definir a senha.');
    const uid = await targetUser(admin.id, (req.query as { userId?: string }).userId);
    const values = buildValues(def, req.body, true);
    await validateSpecific(ctx, def, uid, values, null);
    try {
      const row = await ctx.db.transaction(async (tx) => {
        const [created] = await tx.insert(def.table).values({ ...values, userId: uid } as any).returning();
        await audit(tx, { actorId: admin.id, userId: uid, action: 'admin.create', entityType: def.key, entityId: (created as any).id, after: created });
        return created;
      });
      return reply.status(201).send(row);
    } catch (err) {
      return pgErrors(err, def);
    }
  });

  app.put('/api/admin/r/:resource/:id', async (req) => {
    const admin = requireAdmin(req);
    const { resource, id } = parse(z.object({ resource: z.string(), id: z.uuid() }), req.params);
    const def = resolve(resource);
    writeGuard(def);
    const t = def.table as any;
    const uid = await targetUser(admin.id, (req.query as { userId?: string }).userId);
    const values = buildValues(def, req.body, false);
    try {
      return await ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(def.table)
          .where(def.global ? eq(t.id, id) : and(eq(t.id, id), eq(t.userId, uid)))
          .for('update');
        if (!existing) throw notFound(def.label);
        await validateSpecific(ctx, def, admin.id, values, existing as Record<string, unknown>);
        if ('updatedAt' in getTableColumns(def.table)) values.updatedAt = new Date();
        const [updated] = await tx.update(def.table).set(values as any).where(eq(t.id, id)).returning();
        await audit(tx, { actorId: admin.id, userId: def.global ? id : uid, action: 'admin.update', entityType: def.key, entityId: id, before: existing, after: updated });
        for (const h of def.hidden ?? []) delete (updated as Record<string, unknown>)[h];
        return updated;
      });
    } catch (err) {
      return pgErrors(err, def);
    }
  });

  app.delete('/api/admin/r/:resource/:id', async (req, reply) => {
    const admin = requireAdmin(req);
    const { resource, id } = parse(z.object({ resource: z.string(), id: z.uuid() }), req.params);
    const def = resolve(resource);
    writeGuard(def);
    if (def.key === 'users') throw badRequest('Use a exclusão de conta (com confirmação) para remover usuários.');
    const t = def.table as any;
    const uid = await targetUser(admin.id, (req.query as { userId?: string }).userId);
    try {
      await ctx.db.transaction(async (tx) => {
        const [existing] = await tx.select().from(def.table).where(and(eq(t.id, id), eq(t.userId, uid)));
        if (!existing) throw notFound(def.label);
        await tx.delete(def.table).where(eq(t.id, id));
        await audit(tx, { actorId: admin.id, userId: uid, action: 'admin.delete', entityType: def.key, entityId: id, before: existing });
      });
    } catch (err) {
      return pgErrors(err, def);
    }
    return noContent(reply);
  });

  // ------------------------------------------------------------------ Ações auditadas sobre o livro-razão

  /** Ajuste manual de XP, moedas, atributos e habilidades — sempre como novo lançamento. */
  app.post('/api/admin/adjust', async (req) => {
    const admin = requireAdmin(req);
    const body = parse(adjustmentInput.extend({ userId: z.uuid().optional() }), req.body);
    const uid = await targetUser(admin.id, body.userId);
    const today = await todayFor(ctx.db, uid, ctx.now());
    if (!body.xp && !body.coins && !Object.keys(body.attributeXp).length && !Object.keys(body.skillXp).length) throw badRequest('Nada a ajustar.');
    return ctx.db.transaction(async (tx) => {
      const r = await grantReward(tx, {
        userId: uid,
        idempotencyKey: `adjustment:${crypto.randomUUID()}`,
        sourceType: 'adjustment',
        xpSource: 'adjustment',
        title: `Ajuste administrativo: ${body.reason}`,
        localDate: today,
        reward: { xp: body.xp, coins: body.coins, attributeXp: body.attributeXp, explanation: [`Ajuste por ${admin.displayName}`, `Motivo: ${body.reason}`] },
        skillXp: body.skillXp,
        actorId: admin.id,
        coinKind: 'adjustment',
        allowNegative: true,
      });
      await audit(tx, { actorId: admin.id, userId: uid, action: 'admin.adjust', entityType: 'reward_grants', entityId: r.grantId, after: body });
      return r;
    });
  });

  app.post('/api/admin/grants/:id/reverse', async (req) => {
    const admin = requireAdmin(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reason, userId } = parse(reversalInput.extend({ userId: z.uuid().optional() }), req.body);
    const uid = await targetUser(admin.id, userId);
    return ctx.db.transaction(async (tx) => {
      const r = await reverseGrant(tx, uid, id, reason, admin.id);
      await audit(tx, { actorId: admin.id, userId: uid, action: 'admin.grant_reverse', entityType: 'reward_grants', entityId: id, meta: { reason } });
      return r;
    });
  });

  /** Estorno de transação de moedas avulsa (ajustes). Transações de recompensas/compras usam suas próprias ações. */
  app.post('/api/admin/coins/:id/reverse', async (req) => {
    const admin = requireAdmin(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reason, userId } = parse(reversalInput.extend({ userId: z.uuid().optional() }), req.body);
    const uid = await targetUser(admin.id, userId);
    return ctx.db.transaction(async (tx) => {
      const [txRow] = await tx.select().from(coinTransactions).where(and(eq(coinTransactions.id, id), eq(coinTransactions.userId, uid)));
      if (!txRow) throw notFound('Transação');
      if (txRow.kind === 'reversal') throw conflict('Estornos não podem ser estornados.');
      if (txRow.grantId) throw conflict('Esta transação pertence a uma recompensa: estorne a recompensa.');
      if (txRow.purchaseId) throw conflict('Esta transação pertence a uma compra: use o reembolso.');
      if (txRow.penaltyId) throw conflict('Esta transação pertence a uma penalidade: reverta a penalidade.');
      const [already] = await tx.select({ id: coinTransactions.id }).from(coinTransactions).where(eq(coinTransactions.reversalOf, id));
      if (already) throw conflict('Transação já estornada.');
      const rev = await postCoinTx(tx, {
        userId: uid,
        amount: -txRow.amount,
        kind: 'reversal',
        category: txRow.category,
        reason: `Estorno: ${txRow.reason} — ${reason}`,
        localDate: await todayFor(tx, uid, ctx.now()),
        reversalOf: id,
        actorId: admin.id,
      });
      await audit(tx, { actorId: admin.id, userId: uid, action: 'admin.coin_reverse', entityType: 'coin_transactions', entityId: id, after: rev, meta: { reason } });
      return rev;
    });
  });

  /** Revoga uma conquista desbloqueada e estorna sua recompensa. */
  app.post('/api/admin/user-achievements/:id/revoke', async (req) => {
    const admin = requireAdmin(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reason, userId } = parse(reversalInput.extend({ userId: z.uuid().optional() }), req.body);
    const uid = await targetUser(admin.id, userId);
    return ctx.db.transaction(async (tx) => {
      const [ua] = await tx.select().from(userAchievements).where(and(eq(userAchievements.id, id), eq(userAchievements.userId, uid)));
      if (!ua) throw notFound('Conquista desbloqueada');
      if (ua.grantId) {
        const [g] = await tx.select().from(rewardGrants).where(eq(rewardGrants.id, ua.grantId));
        if (g && !g.reversedAt) await reverseGrant(tx, uid, ua.grantId, `Conquista revogada: ${reason}`, admin.id);
      }
      await tx.delete(userAchievements).where(eq(userAchievements.id, id));
      await audit(tx, { actorId: admin.id, userId: uid, action: 'admin.achievement_revoke', entityType: 'user_achievements', entityId: id, before: ua, meta: { reason } });
      return { revoked: true };
    });
  });

  app.get('/api/admin/integrity', async (req) => {
    const admin = requireAdmin(req);
    const uid = await targetUser(admin.id, (req.query as { userId?: string }).userId);
    const issues = await checkIntegrity(ctx.db, uid);
    return { ok: issues.length === 0, issues };
  });

  app.post('/api/admin/integrity/rebuild', async (req) => {
    const admin = requireAdmin(req);
    const uid = await targetUser(admin.id, (req.query as { userId?: string }).userId);
    const issues = await ctx.db.transaction(async (tx) => {
      const before = await checkIntegrity(tx, uid);
      const after = await rebuildProjections(tx, uid);
      await audit(tx, { actorId: admin.id, userId: uid, action: 'admin.rebuild_projections', entityType: 'projections', meta: { before, after } });
      return after;
    });
    return { ok: issues.length === 0, issues };
  });

  app.post('/api/admin/evaluate', async (req) => {
    const admin = requireAdmin(req);
    const uid = await targetUser(admin.id, (req.query as { userId?: string }).userId);
    return evaluateUser(ctx.db, uid, ctx.now());
  });

  // ------------------------------------------------------------------ Usuários

  app.get('/api/admin/users', async (req) => {
    requireAdmin(req);
    return ctx.db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, isDemo: users.isDemo, disabledAt: users.disabledAt, createdAt: users.createdAt })
      .from(users)
      .orderBy(asc(users.createdAt));
  });

  app.post('/api/admin/users', async (req, reply) => {
    const admin = requireAdmin(req);
    const input = parse(registerInput.extend({ role: z.enum(['admin', 'user']).default('user'), timezone: z.string().default('America/Sao_Paulo') }), req.body);
    const u = await ctx.db.transaction(async (tx) => {
      const [exists] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = lower(${input.email})`);
      if (exists) throw conflict('E-mail já cadastrado.');
      const [created] = await tx
        .insert(users)
        .values({ email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password), displayName: input.displayName, role: input.role })
        .returning();
      await seedUserDefaults(tx, created!.id, localDateOf(ctx.now(), input.timezone));
      await audit(tx, { actorId: admin.id, userId: created!.id, action: 'admin.user_create', entityType: 'users', entityId: created!.id, meta: { role: input.role } });
      return created!;
    });
    return reply.status(201).send({ id: u.id, email: u.email, displayName: u.displayName, role: u.role });
  });

  app.post('/api/admin/users/:id/password', async (req, reply) => {
    const admin = requireAdmin(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { password } = parse(z.object({ password: z.string().min(10).max(200) }), req.body);
    const [u] = await ctx.db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id });
    if (!u) throw notFound('Usuário');
    await audit(ctx.db, { actorId: admin.id, userId: id, action: 'admin.password_reset', entityType: 'users', entityId: id });
    return noContent(reply);
  });

  void localDate;
}
