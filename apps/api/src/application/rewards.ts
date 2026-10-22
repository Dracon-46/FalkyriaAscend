import { levelFromXp, levelsCrossed, type RewardResult, type XpSource } from '@rpg/engine';
import { findOwnedItem, hasLiveInventoryOf, insertInventoryItems } from '../persistence/repositories/inventory';
import {
  attributeLinesOf,
  findGrantByKey,
  insertAttributeXpLine,
  insertGrant,
  insertGrantIfNew,
  insertSkillXpLine,
  lockGrant,
  markGrantReversed,
  skillLinesOf,
} from '../persistence/repositories/ledger';
import {
  findCharacterProgress,
  findLevelReward,
  insertLevelReachedIfNew,
  lockAttributesByCode,
  lockCharacterProgress,
  lockSkillsById,
  setAttributeXp,
  setSkillXp,
  updateCharacterProgress,
} from '../persistence/repositories/progression';
import { findCoinTxByGrant } from '../persistence/repositories/wallets';
import type { GRANT_SOURCES } from '../persistence/models';
import type { DbOrTx } from '../persistence/unit-of-work';
import { conflict, notFound, unprocessable } from '../shared/errors';
import { getActiveConfig } from './config';
import { notify } from './notifications';
import { postCoinTx } from './wallet';

export type GrantSource = (typeof GRANT_SOURCES)[number];

export interface GrantInput {
  userId: string;
  idempotencyKey: string;
  sourceType: GrantSource;
  sourceId?: string | null;
  xpSource: XpSource;
  categoryId?: string | null;
  title: string;
  localDate: string;
  reward: Pick<RewardResult, 'xp' | 'coins' | 'attributeXp' | 'explanation'> & { masteryXp?: number };
  /** Habilidade que recebe `reward.masteryXp`. */
  skillId?: string | null;
  /** XP de habilidade adicional (por id). */
  skillXp?: Record<string, number>;
  actorId?: string | null;
  coinKind?: 'earn' | 'adjustment';
  /** Interno: permite XP negativo (ajustes administrativos). */
  allowNegative?: boolean;
}

export interface GrantOutcome {
  grantId: string;
  created: boolean;
  xp: number;
  coins: number;
  levelUps: number[];
  level: number;
}

/**
 * Concede uma recompensa de forma idempotente e atômica (deve ser chamado dentro de uma transação).
 *
 * 1. Insere o cabeçalho com chave de idempotência única — repetições retornam o registro existente.
 * 2. Atualiza a projeção de XP do personagem (linha bloqueada) e registra níveis alcançados.
 * 3. Lança XP de atributos e habilidades e atualiza suas projeções.
 * 4. Lança moedas no livro-razão.
 * 5. Concede marcos de nível (títulos, itens, moedas) de forma também idempotente.
 */
export async function grantReward(tx: DbOrTx, input: GrantInput): Promise<GrantOutcome> {
  const { version, config } = await getActiveConfig(tx, input.userId);
  if (!input.allowNegative && (input.reward.xp < 0 || input.reward.coins < 0)) {
    throw new Error('Recompensa negativa só é permitida em ajustes');
  }

  const grant = await insertGrantIfNew(tx, {
    userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      xpSource: input.xpSource,
      categoryId: input.categoryId ?? null,
      title: input.title,
      xp: input.reward.xp,
      coins: input.reward.coins,
      localDate: input.localDate,
      configVersion: version,
      explanation: input.reward.explanation,
    actorId: input.actorId ?? null,
  });

  if (!grant) {
    const existing = await findGrantByKey(tx, input.userId, input.idempotencyKey);
    const cp = await findCharacterProgress(tx, input.userId);
    return { grantId: existing!.id, created: false, xp: existing!.xp, coins: existing!.coins, levelUps: [], level: cp?.level ?? 1 };
  }

  // --- XP do personagem (projeção bloqueada para serializar subidas de nível)
  const cp = await lockCharacterProgress(tx, input.userId);
  const before = cp.lifetimeXp;
  const after = before + input.reward.xp;
  if (after < 0) throw unprocessable(`O XP vitalício não pode ficar negativo (atual ${before}).`);
  const levelState = levelFromXp(after, config.curves.character);
  const crossed = levelsCrossed(before, after, config.curves.character);
  await updateCharacterProgress(tx, input.userId, { lifetimeXp: after, level: levelState.level });

  // --- XP de atributos
  const attrCodes = Object.keys(input.reward.attributeXp).filter((c) => input.reward.attributeXp[c] !== 0);
  if (attrCodes.length > 0) {
    const attrs = await lockAttributesByCode(tx, input.userId, attrCodes);
    for (const a of attrs) {
      const amount = input.reward.attributeXp[a.code]!;
      const newXp = a.xp + amount;
      if (newXp < 0) throw unprocessable(`O XP do atributo ${a.code} não pode ficar negativo.`);
      await insertAttributeXpLine(tx, { grantId: grant.id, attributeId: a.id, userId: input.userId, amount });
      await setAttributeXp(tx, a.id, newXp, levelFromXp(newXp, config.curves.attribute).level);
    }
  }

  // --- XP de habilidades (maestria)
  const skillXp: Record<string, number> = { ...(input.skillXp ?? {}) };
  if (input.skillId && input.reward.masteryXp) {
    skillXp[input.skillId] = (skillXp[input.skillId] ?? 0) + input.reward.masteryXp;
  }
  const skillIds = Object.keys(skillXp).filter((k) => skillXp[k] !== 0);
  if (skillIds.length > 0) {
    const rows = await lockSkillsById(tx, input.userId, skillIds);
    for (const s of rows) {
      const amount = skillXp[s.id]!;
      const newXp = s.xp + amount;
      if (newXp < 0) throw unprocessable(`O XP da habilidade ${s.name} não pode ficar negativo.`);
      await insertSkillXpLine(tx, { grantId: grant.id, skillId: s.id, userId: input.userId, amount });
      await setSkillXp(tx, s.id, newXp, levelFromXp(newXp, config.curves.mastery).level);
    }
  }

  // --- Moedas
  if (input.reward.coins !== 0) {
    await postCoinTx(tx, {
      userId: input.userId,
      amount: input.reward.coins,
      kind: input.coinKind ?? 'earn',
      category: input.sourceType,
      reason: input.title,
      localDate: input.localDate,
      grantId: grant.id,
      actorId: input.actorId ?? null,
    });
  }

  // --- Níveis alcançados (registro histórico + marcos)
  for (const level of crossed) {
    const reached = await insertLevelReachedIfNew(tx, { userId: input.userId, level, grantId: grant.id, configVersion: version });
    if (!reached) continue; // nível já alcançado anteriormente: marcos não se repetem
    await notify(tx, input.userId, {
      category: 'level',
      title: `Nível ${level} alcançado`,
      body: `Seu personagem subiu para o nível ${level}.`,
      link: '/personagem',
      dedupeKey: `level:${level}`,
    });
    await grantLevelMilestone(tx, input.userId, level, input.localDate);
  }

  return {
    grantId: grant.id,
    created: true,
    xp: grant.xp,
    coins: grant.coins,
    levelUps: crossed,
    level: levelState.level,
  };
}

async function grantLevelMilestone(tx: DbOrTx, userId: string, level: number, localDate: string): Promise<void> {
  const milestone = await findLevelReward(tx, userId, level);
  if (!milestone) return;
  if (milestone.itemId) await giveItem(tx, userId, milestone.itemId, 'level', `Marco do nível ${level}`);
  if (milestone.coins > 0) {
    await grantReward(tx, {
      userId,
      idempotencyKey: `level:${level}`,
      sourceType: 'level',
      xpSource: 'achievement',
      title: `Marco do nível ${level}: ${milestone.description}`,
      localDate,
      reward: { xp: 0, coins: milestone.coins, attributeXp: {}, explanation: [`Marco do nível ${level}`] },
    });
  }
}

/** Entrega um item ao inventário (fora da loja). Itens equipáveis recebem slot. */
export async function giveItem(
  tx: DbOrTx,
  userId: string,
  itemId: string,
  source: 'achievement' | 'level' | 'season' | 'streak' | 'admin',
  note: string,
): Promise<void> {
  const item = await findOwnedItem(tx, userId, itemId);
  if (!item) return;
  const equippable = ['title', 'badge', 'frame', 'theme', 'effect'].includes(item.kind);
  // Itens permanentes não são duplicados.
  if (item.kind !== 'consumable' && item.kind !== 'real_reward') {
    if (await hasLiveInventoryOf(tx, userId, itemId)) return;
  }
  await insertInventoryItems(tx, [{ userId, itemId, source, slot: equippable ? item.kind : null, note }]);
}

/**
 * Estorna uma recompensa: cria um lançamento espelhado (XP, atributos, habilidades e moedas negativos).
 * O registro original permanece intacto e é marcado como estornado.
 */
export async function reverseGrant(
  tx: DbOrTx,
  userId: string,
  grantId: string,
  reason: string,
  actorId: string | null,
): Promise<GrantOutcome> {
  const g = await lockGrant(tx, userId, grantId);
  if (!g) throw notFound('Recompensa');
  if (g.reversalOf) throw conflict('Um estorno não pode ser estornado; registre um ajuste.');
  if (g.reversedAt) throw conflict('Esta recompensa já foi estornada.');

  const attrLines = await attributeLinesOf(tx, g.id);
  const skillLines = await skillLinesOf(tx, g.id);
  const coinTx = await findCoinTxByGrant(tx, g.id);

  const rev = await insertGrant(tx, {
    userId,
      idempotencyKey: `reversal:${g.id}`,
      sourceType: 'reversal',
      sourceId: g.sourceId,
      xpSource: g.xpSource,
      categoryId: g.categoryId,
      title: `Estorno: ${g.title}`,
      xp: -g.xp,
      coins: -g.coins,
      localDate: g.localDate,
      configVersion: g.configVersion,
      explanation: [`Estorno de "${g.title}"`, `Motivo: ${reason}`],
      reversalOf: g.id,
    actorId,
  });
  await markGrantReversed(tx, g.id);

  const { config } = await getActiveConfig(tx, userId);
  const cp = await lockCharacterProgress(tx, userId);
  const newXp = cp.lifetimeXp - g.xp;
  if (newXp < 0) throw unprocessable('Estorno deixaria o XP vitalício negativo; verifique ajustes anteriores.');
  const level = levelFromXp(newXp, config.curves.character).level;
  await updateCharacterProgress(tx, userId, { lifetimeXp: newXp, level });

  for (const line of attrLines) {
    const [a] = await lockAttributesByCode(tx, userId, [line.code]);
    const xp = a!.xp - line.amount;
    if (xp < 0) throw unprocessable(`Estorno deixaria o atributo ${line.code} negativo.`);
    await insertAttributeXpLine(tx, { grantId: rev.id, attributeId: a!.id, userId, amount: -line.amount });
    await setAttributeXp(tx, a!.id, xp, levelFromXp(xp, config.curves.attribute).level);
  }
  for (const line of skillLines) {
    const [s] = await lockSkillsById(tx, userId, [line.skillId]);
    const xp = s!.xp - line.amount;
    if (xp < 0) throw unprocessable(`Estorno deixaria a habilidade ${s!.name} negativa.`);
    await insertSkillXpLine(tx, { grantId: rev.id, skillId: s!.id, userId, amount: -line.amount });
    await setSkillXp(tx, s!.id, xp, levelFromXp(xp, config.curves.mastery).level);
  }
  if (coinTx) {
    await postCoinTx(tx, {
      userId,
      amount: -coinTx.amount,
      kind: 'reversal',
      category: coinTx.category,
      reason: `Estorno: ${g.title} — ${reason}`,
      localDate: g.localDate,
      grantId: rev.id,
      reversalOf: coinTx.id,
      actorId,
    });
  }
  return { grantId: rev.id, created: true, xp: rev.xp, coins: rev.coins, levelUps: [], level };
}
