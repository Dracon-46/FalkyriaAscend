import type { DbOrTx } from '../db/client';
import { auditLog } from '../db/schema';

export interface AuditInput {
  actorId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
}

const SENSITIVE = /password|token|secret|hash/i;

/** Remove campos sensíveis antes de gravar no log de auditoria. */
export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.test(k) ? '[redigido]' : redact(v)]),
    );
  }
  return value;
}

export async function audit(db: DbOrTx, input: AuditInput): Promise<void> {
  await db.insert(auditLog).values({
    actorId: input.actorId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: redact(input.before) as object | null,
    after: redact(input.after) as object | null,
    meta: redact(input.meta) as object | null,
  });
}
