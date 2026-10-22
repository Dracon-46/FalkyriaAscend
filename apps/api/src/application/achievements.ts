import { achievementCriteriaSchema, computeFixedReward, evaluateAchievement, metricsNeeded } from '@rpg/engine';
import { computeMetrics } from '../persistence/queries/achievement-metrics';
import { insertUnlockIfNew, listLockedAchievements, setUnlockGrant } from '../persistence/repositories/achievements';
import type { DbOrTx } from '../persistence/unit-of-work';
import { getActiveConfig } from './config';
import { notify } from './notifications';
import { giveItem, grantReward } from './rewards';

export { computeMetrics };

/**
 * Avalia conquistas ainda bloqueadas e desbloqueia as atendidas (idempotente).
 * Executa algumas passadas porque recompensas de conquistas podem subir o nível.
 */
export async function evaluateAchievements(tx: DbOrTx, userId: string, localDate: string): Promise<string[]> {
  const unlockedNames: string[] = [];
  const { config } = await getActiveConfig(tx, userId);
  for (let pass = 0; pass < 3; pass++) {
    const pending = await listLockedAchievements(tx, userId, { includeSecret: true });
    if (pending.length === 0) break;
    const parsed = pending
      .map((a) => ({ a, criteria: achievementCriteriaSchema.safeParse(a.criteria) }))
      .filter((p) => p.criteria.success)
      .map((p) => ({ a: p.a, criteria: p.criteria.data! }));
    const metrics = await computeMetrics(tx, userId, metricsNeeded(parsed.map((p) => p.criteria)));
    let unlockedThisPass = 0;
    for (const { a, criteria } of parsed) {
      const result = evaluateAchievement(criteria, metrics);
      if (!result.unlocked) continue;
      const unlock = await insertUnlockIfNew(tx, { userId, achievementId: a.id, snapshot: { metrics: result.conditions } });
      if (!unlock) continue;
      unlockedThisPass++;
      unlockedNames.push(a.name);
      if (a.rewardXp > 0 || a.rewardCoins > 0) {
        const reward = computeFixedReward({ xp: a.rewardXp, coins: a.rewardCoins, label: `Conquista: ${a.name}` }, config);
        const g = await grantReward(tx, {
          userId,
          idempotencyKey: `achievement:${a.id}`,
          sourceType: 'achievement',
          sourceId: a.id,
          xpSource: 'achievement',
          title: `Conquista: ${a.name}`,
          localDate,
          reward,
        });
        await setUnlockGrant(tx, unlock.id, g.grantId);
      }
      if (a.rewardItemId) await giveItem(tx, userId, a.rewardItemId, 'achievement', `Conquista: ${a.name}`);
      await notify(tx, userId, {
        category: 'achievement',
        title: `Conquista desbloqueada: ${a.name}`,
        body: a.description,
        link: '/conquistas',
        dedupeKey: `achievement:${a.id}`,
      });
    }
    if (unlockedThisPass === 0) break;
  }
  return unlockedNames;
}

/** Próximas conquistas visíveis, ordenadas pelo progresso. */
export async function nextAchievements(db: DbOrTx, userId: string, limit: number) {
  const locked = await listLockedAchievements(db, userId, { includeSecret: false });
  const parsed = locked.map((a) => ({ a, c: achievementCriteriaSchema.safeParse(a.criteria) })).filter((x) => x.c.success);
  const metrics = await computeMetrics(db, userId, metricsNeeded(parsed.map((p) => p.c.data!)));
  return parsed
    .map(({ a, c }) => ({ id: a.id, name: a.name, description: a.description, icon: a.icon, rarity: a.rarity, ...evaluateAchievement(c.data!, metrics) }))
    .sort((x, y) => y.progress - x.progress)
    .slice(0, limit);
}
