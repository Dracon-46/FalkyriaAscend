/** Exportação completa dos dados do usuário (portabilidade). */
import { eq, getTableColumns, is, type Column } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../client';
import * as schema from '../schema';

const SKIP = new Set(['sessions', 'users']);

/** Todas as tabelas com `userId`, filtradas pelo usuário. Credenciais de integração nunca saem. */
export async function exportUserData(db: DbOrTx, userId: string) {
  const out: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(schema)) {
    if (!is(table, PgTable) || SKIP.has(name)) continue;
    const userIdColumn = (getTableColumns(table) as Record<string, Column | undefined>).userId;
    if (!userIdColumn) continue;
    out[name] = await db
      .select()
      .from(table as PgTable)
      .where(eq(userIdColumn, userId));
  }
  out.integrationConnections = (out.integrationConnections ?? []).map((c) => ({ ...(c as object), accessTokenEnc: undefined, refreshTokenEnc: undefined }));
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName, createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return { user, data: out };
}
