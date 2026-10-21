import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { notifications, userSettings } from '../db/schema';

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
  const [s] = await db.select({ prefs: userSettings.notificationPrefs }).from(userSettings).where(eq(userSettings.userId, userId));
  if (s?.prefs?.categories && s.prefs.categories[input.category] === false) return;
  await db
    .insert(notifications)
    .values({
      userId,
      category: input.category,
      title: input.title,
      body: input.body ?? '',
      link: input.link ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing();
}
