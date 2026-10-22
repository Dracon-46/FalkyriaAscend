/** Verificação de posse entre usuários: todo vínculo entre registros precisa apontar para dados do mesmo usuário. */
import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { achievements, attributes, categories, goals, items, knowledgeAreas, missions, seasons, skills, studyResources, studySubjects } from '../schema';

const OWNED_TABLES = {
  achievements,
  attributes,
  categories,
  goals,
  items,
  knowledgeAreas,
  missions,
  seasons,
  skills,
  studyResources,
  studySubjects,
} as const;

export type OwnedEntity = keyof typeof OWNED_TABLES;

export async function isOwnedBy(db: DbOrTx, entity: OwnedEntity, id: string, userId: string): Promise<boolean> {
  const table = OWNED_TABLES[entity];
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)));
  return Boolean(row);
}

/** Códigos de atributos existentes para o usuário, dentre os informados. */
export async function existingAttributeCodes(db: DbOrTx, userId: string, codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const rows = await db
    .select({ code: attributes.code })
    .from(attributes)
    .where(and(eq(attributes.userId, userId), inArray(attributes.code, codes)));
  return new Set(rows.map((r) => r.code));
}

export async function findCategory(db: DbOrTx, userId: string, categoryId: string) {
  const [cat] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
  return cat ?? null;
}
