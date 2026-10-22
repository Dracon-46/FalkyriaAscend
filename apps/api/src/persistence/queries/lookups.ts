/** Opções para seletores de formulários. */
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { attributes, categories, penaltyRules, skills } from '../schema';

export async function formLookups(db: DbOrTx, userId: string) {
  const [cats, attrs, rules, sk] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name, color: categories.color, isBasicNeed: categories.isBasicNeed })
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.sortOrder)),
    db
      .select({ id: attributes.id, code: attributes.code, name: attributes.name, color: attributes.color })
      .from(attributes)
      .where(eq(attributes.userId, userId))
      .orderBy(asc(attributes.sortOrder)),
    db
      .select({ id: penaltyRules.id, name: penaltyRules.name, type: penaltyRules.type, active: penaltyRules.active })
      .from(penaltyRules)
      .where(eq(penaltyRules.userId, userId)),
    db.select({ id: skills.id, name: skills.name, parentId: skills.parentId }).from(skills).where(eq(skills.userId, userId)),
  ]);
  return { categories: cats, attributes: attrs, penaltyRules: rules, skills: sk };
}
