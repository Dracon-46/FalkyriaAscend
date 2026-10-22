import { and, desc, eq } from 'drizzle-orm';
import { DEFAULT_GAME_CONFIG, gameConfigSchema, type GameConfig } from '@rpg/engine';
import type { DbOrTx } from '../persistence/client';
import { gameConfigs } from '../persistence/schema';

export interface ActiveConfig {
  version: number;
  config: GameConfig;
}

/** Configuração ativa do usuário (padrão do motor se nenhuma foi gravada). */
export async function getActiveConfig(db: DbOrTx, userId: string): Promise<ActiveConfig> {
  const [row] = await db
    .select()
    .from(gameConfigs)
    .where(and(eq(gameConfigs.userId, userId), eq(gameConfigs.active, true)))
    .limit(1);
  if (!row) return { version: DEFAULT_GAME_CONFIG.version, config: DEFAULT_GAME_CONFIG };
  const config = gameConfigSchema.parse(row.config);
  return { version: row.version, config: { ...config, version: row.version } };
}

/**
 * Publica uma nova versão da configuração. Versões anteriores permanecem gravadas;
 * recompensas já concedidas guardam a versão usada e não são recalculadas.
 */
export async function publishConfig(db: DbOrTx, userId: string, input: unknown, note: string): Promise<ActiveConfig> {
  const [last] = await db
    .select({ version: gameConfigs.version })
    .from(gameConfigs)
    .where(eq(gameConfigs.userId, userId))
    .orderBy(desc(gameConfigs.version))
    .limit(1);
  const version = (last?.version ?? DEFAULT_GAME_CONFIG.version) + 1;
  const config = gameConfigSchema.parse({ ...(input as object), version });
  await db.update(gameConfigs).set({ active: false }).where(eq(gameConfigs.userId, userId));
  await db.insert(gameConfigs).values({ userId, version, config, active: true, note });
  return { version, config };
}
