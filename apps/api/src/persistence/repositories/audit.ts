import type { DbOrTx } from '../client';
import { auditLog } from '../schema';

export type AuditEntry = typeof auditLog.$inferInsert;

export async function insertAuditEntry(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values(entry);
}
