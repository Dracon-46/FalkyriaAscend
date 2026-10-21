import type { FastifyInstance } from 'fastify';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { DbOrTx } from '../db/client';
import { conflict, notFound, pgCode, PG } from '../lib/errors';
import { idParam, noContent, parse, requireAdmin, requireUser } from '../lib/http';
import { audit } from '../services/audit';
import type { AppContext } from '../context';

export interface CrudOptions<S extends z.ZodType> {
  path: string;
  table: PgTable & { id: any; userId: any; archivedAt?: any };
  entity: string;
  label: string;
  input: S;
  orderBy?: (t: any) => SQL[];
  /** Transforma/valida a entrada antes de gravar. */
  prepare?: (tx: DbOrTx, userId: string, data: z.infer<S>, existing: any | null) => Promise<Record<string, unknown>>;
  /** Executado após gravar (ex.: relações filhas). */
  after?: (tx: DbOrTx, userId: string, row: any, data: z.infer<S>) => Promise<void>;
  /** Campos que não podem mudar após a criação (ex.: código de atributo). */
  immutable?: string[];
  /** Escrita restrita ao administrador (ex.: regras de economia em instalações multiusuário). */
  adminWrite?: boolean;
  /** Enriquecimento da listagem. */
  decorate?: (db: DbOrTx, userId: string, rows: any[]) => Promise<any[]>;
}

/**
 * CRUD com escopo por usuário, validação Zod, auditoria e semântica de arquivamento:
 * registros com histórico não são excluídos (409) e devem ser arquivados.
 */
export function registerCrud<S extends z.ZodType>(app: FastifyInstance, ctx: AppContext, o: CrudOptions<S>) {
  const t = o.table as any;
  const writer = (req: Parameters<typeof requireUser>[0]) => (o.adminWrite ? requireAdmin(req) : requireUser(req));

  app.get(o.path, async (req) => {
    const user = requireUser(req);
    const q = req.query as { includeArchived?: string };
    const conds: SQL[] = [eq(t.userId, user.id)];
    if (t.archivedAt && q.includeArchived !== 'true') conds.push(isNull(t.archivedAt));
    let query = ctx.db.select().from(o.table).where(and(...conds)).$dynamic();
    if (o.orderBy) query = query.orderBy(...o.orderBy(t));
    const rows = await query;
    return o.decorate ? o.decorate(ctx.db, user.id, rows) : rows;
  });

  app.get(`${o.path}/:id`, async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const [row] = await ctx.db.select().from(o.table).where(and(eq(t.id, id), eq(t.userId, user.id)));
    if (!row) throw notFound(o.label);
    return o.decorate ? (await o.decorate(ctx.db, user.id, [row]))[0] : row;
  });

  app.post(o.path, async (req, reply) => {
    const user = writer(req);
    const data = parse(o.input, req.body);
    const row = await ctx.db.transaction(async (tx) => {
      const values = o.prepare ? await o.prepare(tx, user.id, data, null) : (data as Record<string, unknown>);
      const [created] = await tx.insert(o.table).values({ ...values, userId: user.id } as any).returning();
      if (o.after) await o.after(tx, user.id, created, data);
      await audit(tx, { actorId: user.id, userId: user.id, action: 'create', entityType: o.entity, entityId: (created as any).id, after: created });
      return created;
    });
    return reply.status(201).send(row);
  });

  app.put(`${o.path}/:id`, async (req) => {
    const user = writer(req);
    const { id } = parse(idParam, req.params);
    const data = parse(o.input, req.body) as Record<string, unknown>;
    return ctx.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(o.table).where(and(eq(t.id, id), eq(t.userId, user.id))).for('update');
      if (!existing) throw notFound(o.label);
      for (const f of o.immutable ?? []) {
        if (f in data && data[f] !== (existing as any)[f]) throw conflict(`O campo "${f}" não pode ser alterado após a criação.`);
      }
      const values = o.prepare ? await o.prepare(tx, user.id, data as z.infer<S>, existing) : data;
      const [updated] = await tx.update(o.table).set(values as any).where(eq(t.id, id)).returning();
      if (o.after) await o.after(tx, user.id, updated, data as z.infer<S>);
      await audit(tx, { actorId: user.id, userId: user.id, action: 'update', entityType: o.entity, entityId: id, before: existing, after: updated });
      return updated;
    });
  });

  app.delete(`${o.path}/:id`, async (req, reply) => {
    const user = writer(req);
    const { id } = parse(idParam, req.params);
    try {
      await ctx.db.transaction(async (tx) => {
        const [existing] = await tx.select().from(o.table).where(and(eq(t.id, id), eq(t.userId, user.id)));
        if (!existing) throw notFound(o.label);
        await tx.delete(o.table).where(eq(t.id, id));
        await audit(tx, { actorId: user.id, userId: user.id, action: 'delete', entityType: o.entity, entityId: id, before: existing });
      });
    } catch (err) {
      if (pgCode(err) === PG.foreignKeyViolation) {
        throw conflict(
          t.archivedAt
            ? `${o.label} possui histórico vinculado e não pode ser excluído(a). Arquive em vez de excluir.`
            : `${o.label} possui registros vinculados e não pode ser excluído(a).`,
        );
      }
      throw err;
    }
    return noContent(reply);
  });

  if (t.archivedAt) {
    for (const [action, value] of [
      ['archive', () => new Date()],
      ['unarchive', () => null],
    ] as const) {
      app.post(`${o.path}/:id/${action}`, async (req) => {
        const user = writer(req);
        const { id } = parse(idParam, req.params);
        const [row] = await ctx.db
          .update(o.table)
          .set({ archivedAt: value() } as any)
          .where(and(eq(t.id, id), eq(t.userId, user.id)))
          .returning();
        if (!row) throw notFound(o.label);
        await audit(ctx.db, { actorId: user.id, userId: user.id, action, entityType: o.entity, entityId: id });
        return row;
      });
    }
  }
}
