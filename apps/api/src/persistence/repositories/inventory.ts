/** Itens, inventário e compras. */
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { inventoryItems, items, purchases } from '../schema';

export type InventoryPatch = Partial<Pick<typeof inventoryItems.$inferInsert, 'state' | 'usedAt' | 'note'>>;

// ------------------------------------------------------------------ Itens

export async function findOwnedItem(db: DbOrTx, userId: string, itemId: string) {
  const [item] = await db.select().from(items).where(and(eq(items.id, itemId), eq(items.userId, userId)));
  return item ?? null;
}

// ------------------------------------------------------------------ Inventário

/** Existe unidade não revogada do item no inventário? */
export async function hasLiveInventoryOf(db: DbOrTx, userId: string, itemId: string): Promise<boolean> {
  const [owned] = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.itemId, itemId), sql`${inventoryItems.state} <> 'revoked'`))
    .limit(1);
  return Boolean(owned);
}

/** Unidades possuídas ou equipadas do item. */
export async function countHeldInventory(db: DbOrTx, userId: string, itemId: string): Promise<number> {
  const [owned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.itemId, itemId), inArray(inventoryItems.state, ['owned', 'equipped'])));
  return owned?.n ?? 0;
}

export async function insertInventoryItems(tx: DbOrTx, rows: Array<typeof inventoryItems.$inferInsert>): Promise<void> {
  if (rows.length) await tx.insert(inventoryItems).values(rows);
}

export async function lockInventoryWithItem(tx: DbOrTx, userId: string, inventoryId: string) {
  const [row] = await tx
    .select({ inv: inventoryItems, item: items })
    .from(inventoryItems)
    .innerJoin(items, eq(items.id, inventoryItems.itemId))
    .where(and(eq(inventoryItems.id, inventoryId), eq(inventoryItems.userId, userId)))
    .for('update');
  return row ?? null;
}

/** Desequipa o que estiver no mesmo slot (exceto o item informado). */
export async function unequipSlot(tx: DbOrTx, userId: string, slot: string, exceptId: string): Promise<void> {
  await tx
    .update(inventoryItems)
    .set({ state: 'owned' })
    .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.slot, slot), eq(inventoryItems.state, 'equipped'), ne(inventoryItems.id, exceptId)));
}

export async function updateInventoryItem(tx: DbOrTx, inventoryId: string, patch: InventoryPatch) {
  const [u] = await tx.update(inventoryItems).set(patch).where(eq(inventoryItems.id, inventoryId)).returning();
  return u!;
}

export function listEquipped(db: DbOrTx, userId: string) {
  return db
    .select({ inv: inventoryItems, item: items })
    .from(inventoryItems)
    .innerJoin(items, eq(items.id, inventoryItems.itemId))
    .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.state, 'equipped')))
    .orderBy(desc(inventoryItems.acquiredAt));
}

export function listInventory(db: DbOrTx, userId: string) {
  return db
    .select({ inv: inventoryItems, item: items })
    .from(inventoryItems)
    .innerJoin(items, eq(items.id, inventoryItems.itemId))
    .where(eq(inventoryItems.userId, userId))
    .orderBy(desc(inventoryItems.acquiredAt));
}

// ------------------------------------------------------------------ Compras

/** Quantidade já comprada (compras concluídas) e data da última compra do item. */
export async function purchaseTotalsOf(db: DbOrTx, userId: string, itemId: string) {
  const [bought] = await db
    .select({ n: sql<number>`coalesce(sum(${purchases.quantity}),0)::int`, last: sql<Date | null>`max(${purchases.createdAt})` })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.itemId, itemId), eq(purchases.status, 'completed')));
  return { quantity: bought?.n ?? 0, lastAt: bought?.last ? new Date(bought.last) : null };
}

export async function findPurchaseByKey(db: DbOrTx, userId: string, idempotencyKey: string) {
  const [p] = await db.select().from(purchases).where(and(eq(purchases.userId, userId), eq(purchases.idempotencyKey, idempotencyKey)));
  return p ?? null;
}

export async function insertPurchase(tx: DbOrTx, values: typeof purchases.$inferInsert) {
  const [p] = await tx.insert(purchases).values(values).returning();
  return p!;
}

export async function lockPurchase(tx: DbOrTx, userId: string, purchaseId: string) {
  const [p] = await tx.select().from(purchases).where(and(eq(purchases.id, purchaseId), eq(purchases.userId, userId))).for('update');
  return p ?? null;
}

/** Unidades da compra já consumidas ou resgatadas. */
export async function countUsedUnitsOfPurchase(db: DbOrTx, purchaseId: string): Promise<number> {
  const used = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.purchaseId, purchaseId), inArray(inventoryItems.state, ['consumed', 'redeemed'])));
  return used.length;
}

export async function revokeUnitsOfPurchase(tx: DbOrTx, purchaseId: string, note: string): Promise<void> {
  await tx.update(inventoryItems).set({ state: 'revoked', usedAt: new Date(), note }).where(eq(inventoryItems.purchaseId, purchaseId));
}

export async function markPurchaseRefunded(tx: DbOrTx, purchaseId: string, reason: string) {
  const [u] = await tx
    .update(purchases)
    .set({ status: 'refunded', refundedAt: new Date(), refundReason: reason })
    .where(eq(purchases.id, purchaseId))
    .returning();
  return u!;
}

/** Itens à venda: ativos, não arquivados e com preço. */
export function listShopItems(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(items)
    .where(and(eq(items.userId, userId), isNull(items.archivedAt), sql`${items.price} is not null`, eq(items.active, true)))
    .orderBy(asc(items.sortOrder), asc(items.price));
}

export function listPurchases(db: DbOrTx, userId: string, limit = 300) {
  return db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(desc(purchases.createdAt)).limit(limit);
}
