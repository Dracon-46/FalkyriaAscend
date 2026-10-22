/** Casos de uso de conquistas. */
import type { AchievementInput } from '@rpg/contracts';
import { achievementCriteriaSchema, evaluateAchievement, metricsNeeded } from '@rpg/engine';
import { computeMetrics } from '../../persistence/queries/achievement-metrics';
import { listActiveAchievements, listUnlocks } from '../../persistence/repositories/achievements';
import type { DbOrTx } from '../../persistence/unit-of-work';
import { crudService } from '../crud';
import { assertOwned } from '../validation';

/** Conquistas com progresso; secretas ficam ocultas até serem desbloqueadas. */
export async function achievementsView(db: DbOrTx, userId: string) {
  const defs = await listActiveAchievements(db, userId);
  const unlocked = await listUnlocks(db, userId);
  const parsed = defs.map((d) => ({ d, c: achievementCriteriaSchema.safeParse(d.criteria) }));
  const metrics = await computeMetrics(db, userId, metricsNeeded(parsed.filter((p) => p.c.success).map((p) => p.c.data!)));
  return parsed.map(({ d, c }) => {
    const u = unlocked.find((x) => x.achievementId === d.id);
    const ev = c.success ? evaluateAchievement(c.data, metrics) : null;
    const hidden = d.secret && !u;
    return {
      id: d.id,
      key: d.key,
      name: hidden ? 'Conquista secreta' : d.name,
      description: hidden ? 'Continue explorando para revelá-la.' : d.description,
      category: d.category,
      icon: hidden ? 'lock' : d.icon,
      rarity: d.rarity,
      secret: d.secret,
      hidden,
      rewardXp: d.rewardXp,
      rewardCoins: d.rewardCoins,
      unlockedAt: u?.unlockedAt ?? null,
      progress: u ? 1 : (ev?.progress ?? 0),
      conditions: hidden ? [] : (ev?.conditions ?? []),
    };
  });
}

export const achievementDefinitionsCrud = crudService<AchievementInput>({
  resource: 'achievements',
  entity: 'achievements',
  label: 'Conquista',
  immutable: ['key'],
  orderBy: [{ field: 'sortOrder' }],
  prepare: async (tx, userId, data) => {
    await assertOwned(tx, 'items', data.rewardItemId, userId, 'Item');
    return { ...data };
  },
});
