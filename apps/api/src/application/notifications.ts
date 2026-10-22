import { insertNotification } from '../persistence/repositories/notifications';
import { findSettings } from '../persistence/repositories/settings';
import type { DbOrTx } from '../persistence/unit-of-work';

export const NOTIFICATION_CATEGORIES = {
  deadline: 'Prazos de missões',
  habit: 'Hábitos pendentes',
  mission: 'Missões concluídas',
  level: 'Subida de nível',
  achievement: 'Conquistas',
  purchase: 'Compras',
  season: 'Temporadas',
  penalty: 'Penalidades',
  milestone: 'Marcos de progressão',
} as const;
export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

export interface NotifyInput {
  category: NotificationCategory;
  title: string;
  body?: string;
  link?: string;
  /** Evita notificações duplicadas para o mesmo evento. */
  dedupeKey?: string;
}

/** Cria uma notificação interna, respeitando as preferências por categoria. */
export async function notify(db: DbOrTx, userId: string, input: NotifyInput): Promise<void> {
  const prefs = (await findSettings(db, userId))?.notificationPrefs;
  if (prefs?.categories && prefs.categories[input.category] === false) return;
  await insertNotification(db, {
    userId,
    category: input.category,
    title: input.title,
    body: input.body ?? '',
    link: input.link ?? null,
    dedupeKey: input.dedupeKey ?? null,
  });
}
