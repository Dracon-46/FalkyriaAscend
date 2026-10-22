/** Exportação completa dos dados do usuário (portabilidade). */
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import * as schema from '../schema';

const SKIP = new Set(['sessions', 'users']);

/** Todas as tabelas com `userId`, filtradas pelo usuário. Credenciais de integração nunca saem. */
export async function exportUserData(db: DbOrTx, userId: string) {
  const out: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(schema)) {
    if (typeof table !== 'object' || !table || !('userId' in (table as object)) || SKIP.has(name)) continue;
    out[name] = await db.select().from(table as any).where(eq((table as any).userId, userId));
  }
  out.integrationConnections = (out.integrationConnections ?? []).map((c: any) => ({ ...c, accessTokenEnc: undefined, refreshTokenEnc: undefined }));
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName, createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return { user, data: out };
}
