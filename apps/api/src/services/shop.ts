import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { EQUIPPABLE_KINDS, SINGLE_USE_KINDS, purchaseBlockers } from '@rpg/engine';
import type { DbOrTx } from '../db/client';
import { characterProgress, inventoryItems, items, purchases, userAchievements } from '../db/schema';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { audit } from './audit';
import { notify } from './notifications';
import { activeItemLocks } from './penalties';
import { lockWallet, postCoinTx } from './wallet';

type Item = typeof items.$inferSelect;

export interface ItemAvailability {
  canBuy: boolean;
  blockers: string[];
  owned: number;
  purchased: number;
}

async function availability(tx: DbOrTx, userId: string, item: Item, quantity: number, balance: number, today: string, now: Date): Promise<ItemAvailability> {
  const [cp] = await tx.select().from(characterProgress).where(eq(characterProgress.userId, userId));
  const [bought] = await tx
    .select({ n: sql<number>`coalesce(sum(${purchases.quantity}),0)::int`, last: sql<Date | null>`max(${purchases.createdAt})` })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.itemId, item.id), eq(purchases.status, 'completed')));
  let reqUnlocked: boolean | null = null;
  if (item.requiredAchievementId) {
    const [ua] = await tx
      .select({ id: userAchievements.id })
      .from(userAchievements)
      .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, item.requiredAchievementId)));
    reqUnlocked = Boolean(ua);
  }
  const locks = await activeItemLocks(tx, userId, today);
  const [owned] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.itemId, item.id), inArray(inventoryItems.state, ['owned', 'equipped'])));
  const permanent = !SINGLE_USE_KINDS.includes(item.kind);
  const blockers = purchaseBlockers({
    price: item.price ?? 0,
    quantity,
    balance,
    active: item.active && item.price !== null && item.archivedAt === null,
    availableFrom: item.availableFrom,
    availableUntil: item.availableUntil,
    now,
    minLevel: item.minLevel,
    characterLevel: cp?.level ?? 1,
    requiredAchievementUnlocked: reqUnlocked,
    purchaseLimit: item.purchaseLimit,
    alreadyPurchased: bought?.n ?? 0,
    lockedUntil: locks.has(item.id) ? new Date(`${locks.get(item.id)}T23:59:59Z`) : null,
    lastPurchaseAt: bought?.last ? new Date(bought.last) : null,
    cooldownDays: item.cooldownDays,
  });
  // Itens permanentes (cosméticos, títulos, colecionáveis únicos) só podem ser possuídos uma vez.
  if (permanent && item.kind !== 'collectible' && (owned?.n ?? 0) > 0) blockers.push('Você já possui este item');
  if (permanent && item.kind !== 'collectible' && quantity > 1) blockers.push('Itens permanentes são comprados uma unidade por vez');
  return { canBuy: blockers.length === 0, blockers, owned: owned?.n ?? 0, purchased: bought?.n ?? 0 };
}

export async function itemAvailability(db: DbOrTx, userId: string, item: Item, balance: number, today: string) {
  return availability(db, userId, item, 1, balance, today, new Date());
}

/**
 * Compra atômica e idempotente:
 *  - a carteira é bloqueada (SELECT ... FOR UPDATE), serializando compras simultâneas;
 *  - a mesma chave de idempotência (repetição por falha de rede) retorna a compra original;
 *  - o preço e os dados do item são gravados na compra, preservando o histórico se o item mudar.
 */
export async function purchase(tx: DbOrTx, userId: string, itemId: string, quantity: number, idempotencyKey: string, today: string) {
  const wallet = await lockWallet(tx, userId);
  const [existing] = await tx
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.idempotencyKey, idempotencyKey)));
  if (existing) {
    if (existing.itemId !== itemId) throw conflict('Chave de idempotência já usada para outra compra.');
    return { purchase: existing, replayed: true };
  }
  const [item] = await tx.select().from(items).where(and(eq(items.id, itemId), eq(items.userId, userId)));
  if (!item) throw notFound('Item');
  const avail = await availability(tx, userId, item, quantity, wallet.balance, today, new Date());
  if (!avail.canBuy) throw conflict(avail.blockers.join('; '), { blockers: avail.blockers });

  const total = item.price! * quantity;
  const [p] = await tx
    .insert(purchases)
    .values({
      userId,
      itemId,
      quantity,
      unitPrice: item.price!,
      total,
      idempotencyKey,
      itemSnapshot: { name: item.name, kind: item.kind, category: item.category, price: item.price, rarity: item.rarity },
    })
    .returning();
  if (total > 0) {
    await postCoinTx(tx, {
      userId,
      amount: -total,
      kind: 'spend',
      category: item.category,
      reason: `Compra: ${item.name}${quantity > 1 ? ` ×${quantity}` : ''}`,
      localDate: today,
      purchaseId: p!.id,
    });
  }
  const equippable = EQUIPPABLE_KINDS.includes(item.kind);
  await tx.insert(inventoryItems).values(
    Array.from({ length: quantity }, () => ({
      userId,
      itemId,
      purchaseId: p!.id,
      source: 'purchase' as const,
      slot: equippable ? item.kind : null,
    })),
  );
  await notify(tx, userId, { category: 'purchase', title: `Compra realizada: ${item.name}`, body: `−${total} moedas`, link: '/inventario', dedupeKey: `purchase:${p!.id}` });
  return { purchase: p!, replayed: false };
}

/** Reembolso administrativo: devolve moedas por lançamento de reembolso e revoga itens não usados. */
export async function refundPurchase(tx: DbOrTx, userId: string, purchaseId: string, reason: string, actorId: string | null, today: string) {
  const [p] = await tx.select().from(purchases).where(and(eq(purchases.id, purchaseId), eq(purchases.userId, userId))).for('update');
  if (!p) throw notFound('Compra');
  if (p.status === 'refunded') throw conflict('Compra já reembolsada');
  const used = await tx
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.purchaseId, p.id), inArray(inventoryItems.state, ['consumed', 'redeemed'])));
  if (used.length > 0) throw conflict('Itens desta compra já foram usados/resgatados; registre um ajuste em vez de reembolso.');
  if (p.total > 0) {
    await postCoinTx(tx, { userId, amount: p.total, kind: 'refund', category: 'shop', reason: `Reembolso: ${(p.itemSnapshot as { name: string }).name} — ${reason}`, localDate: today, purchaseId: p.id, actorId });
  }
  await tx.update(inventoryItems).set({ state: 'revoked', usedAt: new Date(), note: `Reembolso: ${reason}` }).where(eq(inventoryItems.purchaseId, p.id));
  const [u] = await tx.update(purchases).set({ status: 'refunded', refundedAt: new Date(), refundReason: reason }).where(eq(purchases.id, p.id)).returning();
  await audit(tx, { actorId, userId, action: 'purchase.refund', entityType: 'purchases', entityId: p.id, before: p, after: u, meta: { reason } });
  return u!;
}

/** Possuir ≠ equipar ≠ consumir ≠ resgatar: cada ação tem regras próprias. */
export async function inventoryAction(tx: DbOrTx, userId: string, inventoryId: string, action: 'equip' | 'unequip' | 'consume' | 'redeem', note?: string | null) {
  const [row] = await tx
    .select({ inv: inventoryItems, item: items })
    .from(inventoryItems)
    .innerJoin(items, eq(items.id, inventoryItems.itemId))
    .where(and(eq(inventoryItems.id, inventoryId), eq(inventoryItems.userId, userId)))
    .for('update');
  if (!row) throw notFound('Item do inventário');
  const { inv, item } = row;
  if (inv.state === 'revoked' || inv.state === 'consumed' || inv.state === 'redeemed') throw conflict('Este item não está mais disponível.');
  switch (action) {
    case 'equip': {
      if (!EQUIPPABLE_KINDS.includes(item.kind)) throw unprocessable('Este item não pode ser equipado.');
      await tx
        .update(inventoryItems)
        .set({ state: 'owned' })
        .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.slot, item.kind), eq(inventoryItems.state, 'equipped'), ne(inventoryItems.id, inv.id)));
      break;
    }
    case 'unequip':
      if (inv.state !== 'equipped') throw conflict('Item não está equipado.');
      break;
    case 'consume':
      if (item.kind !== 'consumable') throw unprocessable('Apenas consumíveis podem ser consumidos.');
      break;
    case 'redeem':
      if (item.kind !== 'real_reward') throw unprocessable('Apenas recompensas reais são resgatadas.');
      break;
  }
  const state = action === 'equip' ? 'equipped' : action === 'unequip' ? 'owned' : action === 'consume' ? 'consumed' : 'redeemed';
  const [u] = await tx
    .update(inventoryItems)
    .set({ state, usedAt: action === 'consume' || action === 'redeem' ? new Date() : inv.usedAt, note: note ?? inv.note })
    .where(eq(inventoryItems.id, inv.id))
    .returning();
  return u!;
}

export async function equippedItems(db: DbOrTx, userId: string) {
  return db
    .select({ inv: inventoryItems, item: items })
    .from(inventoryItems)
    .innerJoin(items, eq(items.id, inventoryItems.itemId))
    .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.state, 'equipped')))
    .orderBy(desc(inventoryItems.acquiredAt));
}
