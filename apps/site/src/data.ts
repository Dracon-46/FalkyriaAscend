// Conteúdo do site derivado das regras reais do jogo: scripts/game-data.ts gera o JSON a partir do @rpg/engine.
import game from './generated/game-data.json';

export const REPO_URL = 'https://github.com/Dracon-46/FalkyriaAscend';
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const WIKI_URL = `${REPO_URL}/wiki`;

const DIFFICULTY_LABELS: Record<string, string> = {
  routine: 'Rotineira',
  easy: 'Fácil',
  moderate: 'Moderada',
  hard: 'Difícil',
  very_hard: 'Muito difícil',
  epic: 'Épica',
  legendary: 'Lendária',
};

export const difficultyTable = game.difficulty.map((d) => ({ ...d, label: DIFFICULTY_LABELS[d.id] ?? d.id }));
export const highDifficultyRules = game.highDifficultyRules;
export const ranks = game.ranks;
export const dailyCaps = game.dailyXpCaps;
export const sampleCharacter = game.sampleCharacter;

/** Pontos da curva de XP acumulado até o nível 100, para o gráfico. */
export const xpCurve = game.cumulativeXp.slice(0, 100).map((xp, i) => ({ level: i + 1, xp }));

export function rankOf(level: number) {
  return [...ranks].reverse().find((r) => level >= r.minLevel) ?? ranks[0]!;
}

/** Atributos do catálogo inicial (docs/07-catalogo-inicial.md). */
export const ATTRIBUTES = [
  { code: 'FOR', name: 'Força' },
  { code: 'RES', name: 'Resistência' },
  { code: 'VIT', name: 'Vitalidade' },
  { code: 'INT', name: 'Intelecto' },
  { code: 'DIS', name: 'Disciplina' },
  { code: 'ORG', name: 'Organização' },
  { code: 'EXE', name: 'Execução' },
  { code: 'END', name: 'Fortaleza mental' },
] as const;

/** Itens do catálogo inicial da loja (docs/06-economia.md). */
export const SHOP_ITEMS = [
  { name: 'Episódio de série', price: 40, rule: 'Livre' },
  { name: '1 hora de lazer livre', price: 60, rule: 'Livre' },
  { name: 'Sessão de cinema em casa', price: 250, rule: 'Intervalo de 3 dias' },
  { name: 'Refeição especial', price: 300, rule: 'Intervalo de 7 dias' },
  { name: 'Título "O Persistente"', price: 400, rule: 'A partir do nível 5' },
  { name: 'Aura dourada', price: 600, rule: 'A partir do nível 10' },
  { name: 'Compra planejada', price: 1000, rule: 'Intervalo de 14 dias' },
  { name: 'Experiência especial', price: 3000, rule: 'A partir do nível 10' },
] as const;

export const THEMES = [
  { id: 'medieval', name: 'Medieval', tagline: 'Pergaminho, ouro e brasões.' },
  { id: 'vampiro', name: 'Vampiros', tagline: 'Gótico, prata e carmesim.' },
  { id: 'anjo', name: 'Anjos', tagline: 'Luz, marfim e azul celeste.' },
  { id: 'sistema', name: 'Sistema', tagline: 'Interface de jogo, neon e dados.' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

/** Números do projeto (CI da versão 0.3.0). */
export const PROJECT_STATS = [
  { value: 156, label: 'testes automatizados', hint: 'motor, API com PostgreSQL real e interface' },
  { value: 7, label: 'fluxos ponta a ponta', hint: 'Playwright, desktop e celular' },
  { value: 17, label: 'regras de arquitetura', hint: 'verificadas em todo pull request' },
  { value: 15, label: 'áreas no app', hint: 'do painel às temporadas' },
] as const;

export const DEFAULT_DIFFICULTY_HARD = game.difficulty.find((d) => d.id === 'hard')!;
