import type { DbOrTx } from '../persistence/unit-of-work';
import { evaluateAchievements } from './achievements';
import { refreshActiveGoals } from './goals';
import { refreshActiveMissions } from './missions';

export interface AfterActionResult {
  autoCompletedMissions: string[];
  unlockedAchievements: string[];
}

/**
 * Executado após qualquer ação que altere progresso (na mesma transação):
 * atualiza objetivos automáticos, metas e conquistas — avaliados pelo motor central, nunca pelas telas.
 */
export async function afterAction(tx: DbOrTx, userId: string, today: string): Promise<AfterActionResult> {
  const autoCompletedMissions = await refreshActiveMissions(tx, userId, today);
  await refreshActiveGoals(tx, userId, today);
  const unlockedAchievements = await evaluateAchievements(tx, userId, today);
  return { autoCompletedMissions, unlockedAchievements };
}
