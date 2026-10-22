import { existingAttributeCodes, findCategory, isOwnedBy, type OwnedEntity } from '../persistence/repositories/ownership';
import { findRulesOwnedBy } from '../persistence/repositories/penalties';
import type { DbOrTx } from '../persistence/unit-of-work';
import { unprocessable } from '../shared/errors';

export type { OwnedEntity };

/** Garante que os códigos de atributos existem para o usuário e normaliza pesos (remove zeros). */
export async function validateWeights(db: DbOrTx, userId: string, weights: Record<string, number>): Promise<Record<string, number>> {
  const clean = Object.fromEntries(Object.entries(weights ?? {}).filter(([, w]) => w > 0));
  const codes = Object.keys(clean);
  if (codes.length === 0) return {};
  const known = await existingAttributeCodes(db, userId, codes);
  const unknown = codes.filter((c) => !known.has(c));
  if (unknown.length > 0) throw unprocessable(`Atributos inexistentes: ${unknown.join(', ')}`);
  return clean;
}

/** Garante que as regras de penalidade pertencem ao usuário. */
export async function validatePenaltyRules(db: DbOrTx, userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await findRulesOwnedBy(db, userId, ids);
  if (rows.length !== new Set(ids).size) throw unprocessable('Regra de penalidade inválida');
  return rows;
}

/** Necessidades básicas nunca podem ter penalidades associadas. */
export async function assertNotBasicNeed(db: DbOrTx, userId: string, categoryId: string | null | undefined, isBasicNeed: boolean, ruleIds: string[]) {
  if (ruleIds.length === 0) return;
  if (isBasicNeed) throw unprocessable('Necessidades básicas (sono, alimentação, descanso) não podem ter penalidades.');
  if (!categoryId) return;
  const cat = await findCategory(db, userId, categoryId);
  if (cat?.isBasicNeed) throw unprocessable(`A categoria "${cat.name}" é de necessidades básicas e não admite penalidades.`);
}

/** Garante que um registro referenciado pertence ao usuário (proteção entre usuários). */
export async function assertOwned(db: DbOrTx, entity: OwnedEntity, id: string | null | undefined, userId: string, label: string): Promise<void> {
  if (!id) return;
  if (!(await isOwnedBy(db, entity, id, userId))) throw unprocessable(`${label} inválido(a)`);
}
