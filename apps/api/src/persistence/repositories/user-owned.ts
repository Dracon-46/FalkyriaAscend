/**
 * Repositório genérico para cadastros com escopo por usuário (categorias, atributos, itens…).
 * Usado pelo serviço genérico de CRUD da aplicação; toda operação filtra por `userId`.
 */
import { and, asc, desc, eq, isNull, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import {
  achievements,
  activityTypes,
  attributes,
  categories,
  exercises,
  items,
  knowledgeAreas,
  levelRewards,
  missionTemplates,
  penaltyRules,
  ranks,
  skills,
  studyResources,
  studySubjects,
  unavailability,
} from '../schema';

const RESOURCES = {
  achievements,
  activityTypes,
  attributes,
  categories,
  exercises,
  items,
  knowledgeAreas,
  levelRewards,
  missionTemplates,
  penaltyRules,
  ranks,
  skills,
  studyResources,
  studySubjects,
  unavailability,
} as const;

export type OwnedResource = keyof typeof RESOURCES;
/** Linha genérica: o serviço de CRUD trata os registros como dados opacos. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- colunas variam por recurso; o serviço genérico trata a linha como opaca.
export type OwnedRow = Record<string, any> & { id: string };
export interface Ordering {
  field: string;
  direction?: 'asc' | 'desc';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- acesso dinâmico às colunas; o tipo concreto varia por recurso.
const table = (resource: OwnedResource) => RESOURCES[resource] as any;

export function isArchivable(resource: OwnedResource): boolean {
  return 'archivedAt' in RESOURCES[resource];
}

export async function listOwnedRows(
  db: DbOrTx,
  resource: OwnedResource,
  userId: string,
  opts: { includeArchived?: boolean; orderBy?: Ordering[] } = {},
): Promise<OwnedRow[]> {
  const t = table(resource);
  const conds: SQL[] = [eq(t.userId, userId)];
  if (isArchivable(resource) && !opts.includeArchived) conds.push(isNull(t.archivedAt));
  let query = db
    .select()
    .from(t)
    .where(and(...conds))
    .$dynamic();
  if (opts.orderBy?.length) query = query.orderBy(...opts.orderBy.map((o) => (o.direction === 'desc' ? desc(t[o.field]) : asc(t[o.field]))));
  return (await query) as OwnedRow[];
}

export async function findOwnedRow(db: DbOrTx, resource: OwnedResource, userId: string, id: string, opts: { lock?: boolean } = {}): Promise<OwnedRow | null> {
  const t = table(resource);
  const query = db
    .select()
    .from(t)
    .where(and(eq(t.id, id), eq(t.userId, userId)));
  const rows = (opts.lock ? await query.for('update') : await query) as OwnedRow[];
  return rows[0] ?? null;
}

export async function insertOwnedRow(tx: DbOrTx, resource: OwnedResource, userId: string, values: Record<string, unknown>): Promise<OwnedRow> {
  const rows = (await tx
    .insert(table(resource))
    .values({ ...values, userId })
    .returning()) as OwnedRow[];
  return rows[0]!;
}

export async function updateOwnedRow(tx: DbOrTx, resource: OwnedResource, id: string, values: Record<string, unknown>): Promise<OwnedRow> {
  const t = table(resource);
  const [row] = await tx.update(t).set(values).where(eq(t.id, id)).returning();
  return row as OwnedRow;
}

export async function deleteOwnedRow(tx: DbOrTx, resource: OwnedResource, id: string): Promise<void> {
  const t = table(resource);
  await tx.delete(t).where(eq(t.id, id));
}

/** Arquiva ou desarquiva; retorna `null` se o registro não pertencer ao usuário. */
export async function setOwnedRowArchived(db: DbOrTx, resource: OwnedResource, userId: string, id: string, archived: boolean): Promise<OwnedRow | null> {
  const t = table(resource);
  const [row] = await db
    .update(t)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(t.id, id), eq(t.userId, userId)))
    .returning();
  return (row as OwnedRow | undefined) ?? null;
}
