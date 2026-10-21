import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { attributes, categories, penaltyRules } from '../db/schema';
import { unprocessable } from '../lib/errors';

/** Garante que os códigos de atributos existem para o usuário e normaliza pesos (remove zeros). */
export async function validateWeights(db: DbOrTx, userId: string, weights: Record<string, number>): Promise<Record<string, number>> {
  const clean = Object.fromEntries(Object.entries(weights ?? {}).filter(([, w]) => w > 0));
  const codes = Object.keys(clean);
  if (codes.length === 0) return {};
  const rows = await db
    .select({ code: attributes.code })
    .from(attributes)
    .where(and(eq(attributes.userId, userId), inArray(attributes.code, codes)));
  const known = new Set(rows.map((r) => r.code));
  const unknown = codes.filter((c) => !known.has(c));
  if (unknown.length > 0) throw unprocessable(`Atributos inexistentes: ${unknown.join(', ')}`);
  return clean;
}

/** Garante que as regras de penalidade pertencem ao usuário. */
export async function validatePenaltyRules(db: DbOrTx, userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(penaltyRules)
    .where(and(eq(penaltyRules.userId, userId), inArray(penaltyRules.id, ids)));
  if (rows.length !== new Set(ids).size) throw unprocessable('Regra de penalidade inválida');
  return rows;
}

/** Necessidades básicas nunca podem ter penalidades associadas. */
export async function assertNotBasicNeed(db: DbOrTx, userId: string, categoryId: string | null | undefined, isBasicNeed: boolean, ruleIds: string[]) {
  if (ruleIds.length === 0) return;
  if (isBasicNeed) throw unprocessable('Necessidades básicas (sono, alimentação, descanso) não podem ter penalidades.');
  if (!categoryId) return;
  const [cat] = await db.select().from(categories).where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
  if (cat?.isBasicNeed) throw unprocessable(`A categoria "${cat.name}" é de necessidades básicas e não admite penalidades.`);
}

/** Garante que um registro referenciado pertence ao usuário (proteção entre usuários). */
export async function assertOwned(db: DbOrTx, table: any, id: string | null | undefined, userId: string, label: string): Promise<void> {
  if (!id) return;
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.userId, userId)));
  if (!row) throw unprocessable(`${label} inválido(a)`);
}
