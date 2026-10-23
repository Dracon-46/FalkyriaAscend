// Gera src/generated/game-data.json a partir das regras reais do motor (@rpg/engine).
// O site usa só esses números; assim não carrega o motor (nem o zod) no navegador.
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_GAME_CONFIG, DEFAULT_RANKS, DIFFICULTIES, cumulativeXpForLevel, levelFromXp } from '@rpg/engine';

const curve = DEFAULT_GAME_CONFIG.curves.character;
const MAX_LEVEL_SHOWN = 120;

const data = {
  difficulty: DIFFICULTIES.map((id) => ({ id, ...DEFAULT_GAME_CONFIG.difficulty[id] })),
  highDifficultyRules: DEFAULT_GAME_CONFIG.highDifficultyRules,
  dailyXpCaps: DEFAULT_GAME_CONFIG.dailyXpCaps,
  ranks: DEFAULT_RANKS.map((r) => ({ ...r, xp: cumulativeXpForLevel(r.minLevel, curve) })),
  /** XP acumulado para alcançar cada nível (índice 0 = nível 1). */
  cumulativeXp: Array.from({ length: MAX_LEVEL_SHOWN }, (_, i) => cumulativeXpForLevel(i + 1, curve)),
  sampleCharacter: levelFromXp(4_380, curve),
};

const out = new URL('../src/generated/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('game-data.json', out), `${JSON.stringify(data, null, 2)}\n`);
console.log('Dados do jogo gerados a partir do @rpg/engine.');
