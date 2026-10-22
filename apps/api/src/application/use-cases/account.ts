/** Conta do usuário: perfil, configurações, notificações, visitas, exportação e exclusão. */
import type { ProfileInput, SettingsInput } from '@rpg/contracts';
import { exportUserData } from '../../persistence/queries/data-export';
import { countUnreadNotifications, listNotifications, markNotificationsRead } from '../../persistence/repositories/notifications';
import { recordFirstVisit } from '../../persistence/repositories/page-visits';
import { findSettings, lockSettings, updateSettings } from '../../persistence/repositories/settings';
import { deleteUserCascade, findUser, updateUser } from '../../persistence/repositories/users';
import { inTransaction, type Db, type DbOrTx } from '../../persistence/unit-of-work';
import { verifyPassword } from '../../shared/crypto';
import { badRequest, unauthorized } from '../../shared/errors';
import { evaluateAchievements } from '../achievements';
import { audit } from '../audit';
import { characterSummary } from '../dashboard';
import { NOTIFICATION_CATEGORIES } from '../notifications';
import { isValidTimezone, todayFor } from '../time';

/** Sessão atual: usuário, configurações, data local, personagem e notificações não lidas. */
export async function currentAccount(db: Db, userId: string, now: Date) {
  const today = await todayFor(db, userId, now);
  const u = (await findUser(db, userId))!;
  return {
    user: {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      characterClass: u.characterClass,
      bio: u.bio,
      isDemo: u.isDemo,
      createdAt: u.createdAt,
    },
    settings: await findSettings(db, userId),
    today,
    character: await characterSummary(db, userId, today),
    unreadNotifications: await countUnreadNotifications(db, userId),
  };
}

export async function updateProfile(db: Db, userId: string, input: ProfileInput) {
  const before = await findUser(db, userId);
  const u = (await updateUser(db, userId, { displayName: input.displayName, characterClass: input.characterClass ?? null, bio: input.bio ?? null }))!;
  await audit(db, { actorId: userId, userId, action: 'profile.update', entityType: 'users', entityId: userId, before, after: u });
  return { id: u.id, displayName: u.displayName, characterClass: u.characterClass, bio: u.bio };
}

export function getSettings(db: DbOrTx, userId: string) {
  return findSettings(db, userId);
}

export async function saveSettings(db: Db, userId: string, input: SettingsInput) {
  if (input.timezone && !isValidTimezone(input.timezone)) throw badRequest('Fuso horário inválido');
  return inTransaction(db, async (tx) => {
    const before = await lockSettings(tx, userId);
    const after = await updateSettings(tx, userId, input);
    await audit(tx, { actorId: userId, userId, action: 'settings.update', entityType: 'user_settings', entityId: userId, before, after });
    return after;
  });
}

export async function notificationsOf(db: DbOrTx, userId: string) {
  return { categories: NOTIFICATION_CATEGORIES, items: await listNotifications(db, userId) };
}

/** Marca uma notificação (ou todas, sem `id`) como lida. */
export function markRead(db: DbOrTx, userId: string, id?: string) {
  return markNotificationsRead(db, userId, id);
}

/** Primeira visita a uma área pode desbloquear conquistas de exploração. */
export async function recordVisit(db: Db, userId: string, page: string, now: Date): Promise<void> {
  if (!(await recordFirstVisit(db, userId, page))) return;
  const today = await todayFor(db, userId, now);
  await inTransaction(db, (tx) => evaluateAchievements(tx, userId, today));
}

/** Exportação completa (portabilidade). Credenciais de integração nunca são exportadas. */
export async function exportAccount(db: Db, userId: string) {
  const { user, data } = await exportUserData(db, userId);
  await audit(db, { actorId: userId, userId, action: 'data.export', entityType: 'users', entityId: userId });
  return { format: 'ascend-export', version: 1, exportedAt: new Date().toISOString(), user, data };
}

/** Exclusão explícita da conta, confirmada por senha: remove todos os dados do usuário. */
export async function deleteAccount(db: Db, userId: string, password: string): Promise<void> {
  const u = await findUser(db, userId);
  if (!u || !(await verifyPassword(password, u.passwordHash))) throw unauthorized('Senha incorreta.');
  await inTransaction(db, (tx) => deleteUserCascade(tx, userId));
}
