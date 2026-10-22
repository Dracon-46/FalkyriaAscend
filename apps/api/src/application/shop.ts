import { EQUIPPABLE_KINDS, SINGLE_USE_KINDS, purchaseBlockers } from '@rpg/engine';
import type { Item } from '../persistence/models';
import { hasUnlocked } from '../persistence/repositories/achievements';
import {
  countHeldInventory,
  countUsedUnitsOfPurchase,
  findOwnedItem,
  findPurchaseByKey,
  insertInventoryItems,
  insertPurchase,
  listEquipped,
  lockInventoryWithItem,
  lockPurchase,
  markPurchaseRefunded,
  purchaseTotalsOf,
  revokeUnitsOfPurchase,
  unequipSlot,
  updateInventoryItem,
} from '../persistence/repositories/inventory';
import { findCharacterProgress } from '../persistence/repositories/progression';
import { type DbOrTx } from '../persistence/unit-of-work';
import { conflict, notFound, unprocessable } from '../shared/errors';
import { audit } from './audit';
import { notify } from './notifications';
import { activeItemLocks } from './penalties';
import { lockWallet, postCoinTx } from './wallet';

export interface ItemAvailability {
  canBuy: boolean;
  blockers: string[];
  owned: number;
  purchased: number;
}

async function availability(tx: DbOrTx, userId: string, item: Item, quantity: number, balance: number, today: string, now: Date): Promise<ItemAvailability> {
  const cp = await findCharacterProgress(tx, userId);
  const bought = await purchaseTotalsOf(tx, userId, item.id);
  const reqUnlocked = item.requiredAchievementId ? await hasUnlocked(tx, userId, item.requiredAchievementId) : null;
  const locks = await activeItemLocks(tx, userId, today);
  const owned = await countHeldInventory(tx, userId, item.id);
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
    alreadyPurchased: bought.quantity,
    lockedUntil: locks.has(item.id) ? new Date(`${locks.get(item.id)}T23:59:59Z`) : null,
    lastPurchaseAt: bought.lastAt,
    cooldownDays: item.cooldownDays,
  });
  // Itens permanentes (cosméticos, títulos, colecionáveis únicos) só podem ser possuídos uma vez.
  if (permanent && item.kind !== 'collectible' && owned > 0) blockers.push('Você já possui este item');
  if (permanent && item.kind !== 'collectible' && quantity > 1) blockers.push('Itens permanentes são comprados uma unidade por vez');
  return { canBuy: blockers.length === 0, blockers, owned, purchased: bought.quantity };
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
  const existing = await findPurchaseByKey(tx, userId, idempotencyKey);
  if (existing) {
    if (existing.itemId !== itemId) throw conflict('Chave de idempotência já usada para outra compra.');
    return { purchase: existing, replayed: true };
  }
  const item = await findOwnedItem(tx, userId, itemId);
  if (!item) throw notFound('Item');
  const avail = await availability(tx, userId, item, quantity, wallet.balance, today, new Date());
  if (!avail.canBuy) throw conflict(avail.blockers.join('; '), { blockers: avail.blockers });

  const total = item.price! * quantity;
  const p = await insertPurchase(tx, {
    userId,
    itemId,
    quantity,
    unitPrice: item.price!,
    total,
    idempotencyKey,
    itemSnapshot: { name: item.name, kind: item.kind, category: item.category, price: item.price, rarity: item.rarity },
  });
  if (total > 0) {
    await postCoinTx(tx, {
      userId,
      amount: -total,
      kind: 'spend',
      category: item.category,
      reason: `Compra: ${item.name}${quantity > 1 ? ` ×${quantity}` : ''}`,
      localDate: today,
      purchaseId: p.id,
    });
  }
  const equippable = EQUIPPABLE_KINDS.includes(item.kind);
  await insertInventoryItems(
    tx,
    Array.from({ length: quantity }, () => ({ userId, itemId, purchaseId: p.id, source: 'purchase' as const, slot: equippable ? item.kind : null })),
  );
  await notify(tx, userId, { category: 'purchase', title: `Compra realizada: ${item.name}`, body: `−${total} moedas`, link: '/inventario', dedupeKey: `purchase:${p.id}` });
  return { purchase: p, replayed: false };
}

/** Reembolso administrativo: devolve moedas por lançamento de reembolso e revoga itens não usados. */
export async function refundPurchase(tx: DbOrTx, userId: string, purchaseId: string, reason: string, actorId: string | null, today: string) {
  const p = await lockPurchase(tx, userId, purchaseId);
  if (!p) throw notFound('Compra');
  if (p.status === 'refunded') throw conflict('Compra já reembolsada');
  if ((await countUsedUnitsOfPurchase(tx, p.id)) > 0) throw conflict('Itens desta compra já foram usados/resgatados; registre um ajuste em vez de reembolso.');
  if (p.total > 0) {
    await postCoinTx(tx, { userId, amount: p.total, kind: 'refund', category: 'shop', reason: `Reembolso: ${(p.itemSnapshot as { name: string }).name} — ${reason}`, localDate: today, purchaseId: p.id, actorId });
  }
  await revokeUnitsOfPurchase(tx, p.id, `Reembolso: ${reason}`);
  const u = await markPurchaseRefunded(tx, p.id, reason);
  await audit(tx, { actorId, userId, action: 'purchase.refund', entityType: 'purchases', entityId: p.id, before: p, after: u, meta: { reason } });
  return u;
}

/** Possuir ≠ equipar ≠ consumir ≠ resgatar: cada ação tem regras próprias. */
export async function inventoryAction(tx: DbOrTx, userId: string, inventoryId: string, action: 'equip' | 'unequip' | 'consume' | 'redeem', note?: string | null) {
  const row = await lockInventoryWithItem(tx, userId, inventoryId);
  if (!row) throw notFound('Item do inventário');
  const { inv, item } = row;
  if (inv.state === 'revoked' || inv.state === 'consumed' || inv.state === 'redeemed') throw conflict('Este item não está mais disponível.');
  switch (action) {
    case 'equip':
      if (!EQUIPPABLE_KINDS.includes(item.kind)) throw unprocessable('Este item não pode ser equipado.');
      await unequipSlot(tx, userId, item.kind, inv.id);
      break;
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
  return updateInventoryItem(tx, inv.id, { state, usedAt: action === 'consume' || action === 'redeem' ? new Date() : inv.usedAt, note: note ?? inv.note });
}

export function equippedItems(db: DbOrTx, userId: string) {
  return listEquipped(db, userId);
}
