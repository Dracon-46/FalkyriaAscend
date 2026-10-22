import { DEFAULT_GAME_CONFIG, gameConfigSchema, type GameConfig } from '@rpg/engine';
import { activateNewConfig, findActiveConfig, findLatestConfigVersion } from '../persistence/repositories/configs';
import type { DbOrTx } from '../persistence/unit-of-work';

export interface ActiveConfig {
  version: number;
  config: GameConfig;
}

/** Configuração ativa do usuário (padrão do motor se nenhuma foi gravada). */
export async function getActiveConfig(db: DbOrTx, userId: string): Promise<ActiveConfig> {
  const row = await findActiveConfig(db, userId);
  if (!row) return { version: DEFAULT_GAME_CONFIG.version, config: DEFAULT_GAME_CONFIG };
  const config = gameConfigSchema.parse(row.config);
  return { version: row.version, config: { ...config, version: row.version } };
}

/**
 * Publica uma nova versão da configuração. Versões anteriores permanecem gravadas;
 * recompensas já concedidas guardam a versão usada e não são recalculadas.
 */
export async function publishConfig(db: DbOrTx, userId: string, input: unknown, note: string): Promise<ActiveConfig> {
  const version = ((await findLatestConfigVersion(db, userId)) ?? DEFAULT_GAME_CONFIG.version) + 1;
  const config = gameConfigSchema.parse({ ...(input as object), version });
  await activateNewConfig(db, userId, version, config, note);
  return { version, config };
}
