/** Casos de uso da loja e do inventário. */
import type { ItemInput } from '@rpg/contracts';
import { listInventory, listPurchases, listShopItems } from '../../persistence/repositories/inventory';
import { findWallet } from '../../persistence/repositories/wallets';
import { inTransaction, type Db, type DbOrTx } from '../../persistence/unit-of-work';
import { badRequest } from '../../shared/errors';
import { audit } from '../audit';
import { crudService } from '../crud';
import { afterAction } from '../hooks';
import { todayFor } from '../time';
import { assertOwned } from '../validation';
import { inventoryAction, itemAvailability, purchase, refundPurchase } from '../shop';

/** Vitrine: itens à venda com a disponibilidade calculada para o usuário. */
export async function shopView(db: Db, userId: string, now: Date) {
  const today = await todayFor(db, userId, now);
  const balance = (await findWallet(db, userId))?.balance ?? 0;
  const out = [];
  for (const it of await listShopItems(db, userId)) out.push({ ...it, availability: await itemAvailability(db, userId, it, balance, today) });
  return { balance, items: out };
}

/** Caso de uso de compra pela loja: valida a chave, compra e reavalia o progresso (sem repetir em replays). */
export async function buyItem(db: Db, userId: string, input: { itemId: string; quantity: number }, idempotencyKey: string, now: Date) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) throw badRequest('Cabeçalho Idempotency-Key obrigatório (8–100 caracteres).');
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => {
    const p = await purchase(tx, userId, input.itemId, input.quantity, idempotencyKey, today);
    return { ...p, after: p.replayed ? null : await afterAction(tx, userId, today) };
  });
}

/** Caso de uso administrativo: reembolsa a compra de um usuário (o próprio administrador por padrão). */
export async function refundPurchaseAsAdmin(db: Db, adminId: string, purchaseId: string, input: { reason: string; userId?: string }, now: Date) {
  const userId = input.userId ?? adminId;
  const today = await todayFor(db, userId, now);
  return inTransaction(db, (tx) => refundPurchase(tx, userId, purchaseId, input.reason, adminId, today));
}

export function purchasesOf(db: DbOrTx, userId: string) {
  return listPurchases(db, userId);
}

export async function inventoryView(db: DbOrTx, userId: string) {
  return (await listInventory(db, userId)).map((r) => ({ ...r.inv, item: r.item }));
}

/** Caso de uso: ação sobre um item do inventário, com auditoria. */
export function useInventoryItem(
  db: Db,
  userId: string,
  inventoryId: string,
  input: { action: 'equip' | 'unequip' | 'consume' | 'redeem'; note?: string | null },
) {
  return inTransaction(db, async (tx) => {
    const r = await inventoryAction(tx, userId, inventoryId, input.action, input.note);
    await audit(tx, { actorId: userId, userId, action: `inventory.${input.action}`, entityType: 'inventory_items', entityId: inventoryId, after: r });
    return r;
  });
}

export const itemsCrud = crudService<ItemInput>({
  resource: 'items',
  entity: 'items',
  label: 'Item',
  orderBy: [{ field: 'sortOrder' }, { field: 'price' }],
  prepare: async (tx, userId, data) => {
    await assertOwned(tx, 'achievements', data.requiredAchievementId, userId, 'Conquista');
    if (data.kind === 'theme' && typeof data.payload.theme !== 'string') throw badRequest('Itens de tema exigem payload.theme');
    return {
      ...data,
      availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
      availableUntil: data.availableUntil ? new Date(data.availableUntil) : null,
    };
  },
});
