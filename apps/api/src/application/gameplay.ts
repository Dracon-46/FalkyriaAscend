import { addDays, consistencyMultiplier, type GameConfig, type XpSource } from '@rpg/engine';
import { habitStatusCounts, hardMissionsRewardedOn, xpOnDateBySource } from '../persistence/queries/gameplay';
import { activeMultiplierReduction } from '../persistence/repositories/penalties';
import type { DbOrTx } from '../persistence/unit-of-work';

/** XP geral recebido no dia local, por origem (para limites diários). */
export function xpTodayBySource(tx: DbOrTx, userId: string, localDate: string): Promise<Partial<Record<XpSource, number>>> {
  return xpOnDateBySource(tx, userId, localDate);
}

/** Quantidade de missões Difícil ou superior concluídas (e recompensadas) no dia. */
export function hardMissionsCompletedToday(tx: DbOrTx, userId: string, localDate: string): Promise<number> {
  return hardMissionsRewardedOn(tx, userId, localDate);
}

export interface MultiplierState {
  multiplier: number;
  completed: number;
  scheduled: number;
  dampening: number;
}

/**
 * Multiplicador de consistência: taxa de hábitos cumpridos na janela configurada
 * (cumpridos / (cumpridos + falhas + falhas toleradas)), reduzido por penalidades ativas.
 */
export async function currentMultiplier(tx: DbOrTx, userId: string, today: string, cfg: GameConfig): Promise<MultiplierState> {
  const by = await habitStatusCounts(tx, userId, addDays(today, -cfg.consistency.windowDays), today);
  const completed = by.done ?? 0;
  const scheduled = completed + (by.missed ?? 0) + (by.tolerated ?? 0);
  const dampening = await activeMultiplierReduction(tx, userId, today);
  return { multiplier: consistencyMultiplier({ completed, scheduled, dampening }, cfg.consistency), completed, scheduled, dampening };
}
