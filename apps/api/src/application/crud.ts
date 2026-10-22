/**
 * Serviço genérico de cadastro (Template Method): escopo por usuário, validação de domínio por
 * recurso (`prepare`), auditoria e semântica de arquivamento — registros com histórico não são
 * excluídos (409) e devem ser arquivados. Cada caso de uso abre sua própria Unit of Work.
 */
import {
  deleteOwnedRow,
  findOwnedRow,
  insertOwnedRow,
  isArchivable,
  listOwnedRows,
  setOwnedRowArchived,
  updateOwnedRow,
  type Ordering,
  type OwnedResource,
  type OwnedRow,
} from '../persistence/repositories/user-owned';
import { inTransaction, type Db, type DbOrTx } from '../persistence/unit-of-work';
import { conflict, notFound, pgCode, PG } from '../shared/errors';
import { audit } from './audit';

export type { OwnedRow };

export interface CrudSpec<I> {
  resource: OwnedResource;
  /** Nome da entidade na auditoria (ex.: `penalty_rules`). */
  entity: string;
  /** Rótulo exibido em mensagens (ex.: "Regra de penalidade"). */
  label: string;
  orderBy?: Ordering[];
  /** Valida e transforma a entrada antes de gravar. */
  prepare?: (tx: DbOrTx, userId: string, data: I, existing: OwnedRow | null) => Promise<Record<string, unknown>>;
  /** Executado após gravar, na mesma transação (ex.: relações filhas). */
  after?: (tx: DbOrTx, userId: string, row: OwnedRow, data: I) => Promise<void>;
  /** Campos que não podem mudar após a criação (ex.: código de atributo). */
  immutable?: string[];
  /** Enriquecimento da leitura (ex.: progresso calculado). */
  decorate?: (db: DbOrTx, userId: string, rows: OwnedRow[]) => Promise<OwnedRow[]>;
}

export interface CrudService<I> {
  readonly label: string;
  readonly archivable: boolean;
  list(db: Db, userId: string, opts?: { includeArchived?: boolean }): Promise<OwnedRow[]>;
  get(db: Db, userId: string, id: string): Promise<OwnedRow>;
  create(db: Db, userId: string, data: I): Promise<OwnedRow>;
  update(db: Db, userId: string, id: string, data: I): Promise<OwnedRow>;
  remove(db: Db, userId: string, id: string): Promise<void>;
  setArchived(db: Db, userId: string, id: string, archived: boolean): Promise<OwnedRow>;
}

export function crudService<I>(spec: CrudSpec<I>): CrudService<I> {
  const decorate = async (db: DbOrTx, userId: string, rows: OwnedRow[]) => (spec.decorate ? spec.decorate(db, userId, rows) : rows);
  const archivable = isArchivable(spec.resource);

  return {
    label: spec.label,
    archivable,

    async list(db, userId, opts = {}) {
      return decorate(db, userId, await listOwnedRows(db, spec.resource, userId, { includeArchived: opts.includeArchived, orderBy: spec.orderBy }));
    },

    async get(db, userId, id) {
      const row = await findOwnedRow(db, spec.resource, userId, id);
      if (!row) throw notFound(spec.label);
      return (await decorate(db, userId, [row]))[0]!;
    },

    create(db, userId, data) {
      return inTransaction(db, async (tx) => {
        const values = spec.prepare ? await spec.prepare(tx, userId, data, null) : (data as Record<string, unknown>);
        const created = await insertOwnedRow(tx, spec.resource, userId, values);
        if (spec.after) await spec.after(tx, userId, created, data);
        await audit(tx, { actorId: userId, userId, action: 'create', entityType: spec.entity, entityId: created.id, after: created });
        return created;
      });
    },

    update(db, userId, id, data) {
      return inTransaction(db, async (tx) => {
        const existing = await findOwnedRow(tx, spec.resource, userId, id, { lock: true });
        if (!existing) throw notFound(spec.label);
        const input = data as Record<string, unknown>;
        for (const f of spec.immutable ?? []) {
          if (f in input && input[f] !== existing[f]) throw conflict(`O campo "${f}" não pode ser alterado após a criação.`);
        }
        const values = spec.prepare ? await spec.prepare(tx, userId, data, existing) : input;
        const updated = await updateOwnedRow(tx, spec.resource, id, values);
        if (spec.after) await spec.after(tx, userId, updated, data);
        await audit(tx, { actorId: userId, userId, action: 'update', entityType: spec.entity, entityId: id, before: existing, after: updated });
        return updated;
      });
    },

    async remove(db, userId, id) {
      try {
        await inTransaction(db, async (tx) => {
          const existing = await findOwnedRow(tx, spec.resource, userId, id);
          if (!existing) throw notFound(spec.label);
          await deleteOwnedRow(tx, spec.resource, id);
          await audit(tx, { actorId: userId, userId, action: 'delete', entityType: spec.entity, entityId: id, before: existing });
        });
      } catch (err) {
        if (pgCode(err) === PG.foreignKeyViolation) {
          throw conflict(
            archivable
              ? `${spec.label} possui histórico vinculado e não pode ser excluído(a). Arquive em vez de excluir.`
              : `${spec.label} possui registros vinculados e não pode ser excluído(a).`,
          );
        }
        throw err;
      }
    },

    async setArchived(db, userId, id, archived) {
      const row = await setOwnedRowArchived(db, spec.resource, userId, id, archived);
      if (!row) throw notFound(spec.label);
      await audit(db, { actorId: userId, userId, action: archived ? 'archive' : 'unarchive', entityType: spec.entity, entityId: id });
      return row;
    },
  };
}
