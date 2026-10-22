import { and, eq, inArray, sql } from 'drizzle-orm';
import { levelFromXp, levelsCrossed, type RewardResult, type XpSource } from '@rpg/engine';
import type { DbOrTx } from '../persistence/client';
import {
  attributes,
  characterProgress,
  coinTransactions,
  grantAttributeXp,
  grantSkillXp,
  inventoryItems,
  items,
  levelHistory,
  levelRewards,
  rewardGrants,
  skills,
  GRANT_SOURCES,
} from '../persistence/schema';
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

  const inserted = await tx
    .insert(rewardGrants)
    .values({
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
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    const [existing] = await tx
      .select()
      .from(rewardGrants)
      .where(and(eq(rewardGrants.userId, input.userId), eq(rewardGrants.idempotencyKey, input.idempotencyKey)));
    const [cp] = await tx.select().from(characterProgress).where(eq(characterProgress.userId, input.userId));
    return { grantId: existing!.id, created: false, xp: existing!.xp, coins: existing!.coins, levelUps: [], level: cp?.level ?? 1 };
  }
  const grant = inserted[0]!;

  // --- XP do personagem (projeção bloqueada para serializar subidas de nível)
  await tx.insert(characterProgress).values({ userId: input.userId }).onConflictDoNothing();
  const [cp] = await tx.select().from(characterProgress).where(eq(characterProgress.userId, input.userId)).for('update');
  const before = cp!.lifetimeXp;
  const after = before + input.reward.xp;
  if (after < 0) throw unprocessable(`O XP vitalício não pode ficar negativo (atual ${before}).`);
  const levelState = levelFromXp(after, config.curves.character);
  const crossed = levelsCrossed(before, after, config.curves.character);
  await tx
    .update(characterProgress)
    .set({ lifetimeXp: after, level: levelState.level, updatedAt: new Date() })
    .where(eq(characterProgress.userId, input.userId));

  // --- XP de atributos
  const attrCodes = Object.keys(input.reward.attributeXp).filter((c) => input.reward.attributeXp[c] !== 0);
  if (attrCodes.length > 0) {
    const attrs = await tx
      .select()
      .from(attributes)
      .where(and(eq(attributes.userId, input.userId), inArray(attributes.code, attrCodes)))
      .for('update');
    for (const a of attrs) {
      const amount = input.reward.attributeXp[a.code]!;
      const newXp = a.xp + amount;
      if (newXp < 0) throw unprocessable(`O XP do atributo ${a.code} não pode ficar negativo.`);
      await tx.insert(grantAttributeXp).values({ grantId: grant.id, attributeId: a.id, userId: input.userId, amount });
      await tx
        .update(attributes)
        .set({ xp: newXp, level: levelFromXp(newXp, config.curves.attribute).level })
        .where(eq(attributes.id, a.id));
    }
  }

  // --- XP de habilidades (maestria)
  const skillXp: Record<string, number> = { ...(input.skillXp ?? {}) };
  if (input.skillId && input.reward.masteryXp) {
    skillXp[input.skillId] = (skillXp[input.skillId] ?? 0) + input.reward.masteryXp;
  }
  const skillIds = Object.keys(skillXp).filter((k) => skillXp[k] !== 0);
  if (skillIds.length > 0) {
    const rows = await tx
      .select()
      .from(skills)
      .where(and(eq(skills.userId, input.userId), inArray(skills.id, skillIds)))
      .for('update');
    for (const s of rows) {
      const amount = skillXp[s.id]!;
      const newXp = s.xp + amount;
      if (newXp < 0) throw unprocessable(`O XP da habilidade ${s.name} não pode ficar negativo.`);
      await tx.insert(grantSkillXp).values({ grantId: grant.id, skillId: s.id, userId: input.userId, amount });
      await tx
        .update(skills)
        .set({ xp: newXp, level: levelFromXp(newXp, config.curves.mastery).level })
        .where(eq(skills.id, s.id));
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
    const hist = await tx
      .insert(levelHistory)
      .values({ userId: input.userId, level, grantId: grant.id, configVersion: version })
      .onConflictDoNothing()
      .returning();
    if (hist.length === 0) continue; // nível já alcançado anteriormente: marcos não se repetem
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
  const [milestone] = await tx
    .select()
    .from(levelRewards)
    .where(and(eq(levelRewards.userId, userId), eq(levelRewards.level, level)));
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
  const [item] = await tx.select().from(items).where(and(eq(items.id, itemId), eq(items.userId, userId)));
  if (!item) return;
  const equippable = ['title', 'badge', 'frame', 'theme', 'effect'].includes(item.kind);
  // Itens permanentes não são duplicados.
  if (item.kind !== 'consumable' && item.kind !== 'real_reward') {
    const [owned] = await tx
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.itemId, itemId), sql`${inventoryItems.state} <> 'revoked'`))
      .limit(1);
    if (owned) return;
  }
  await tx.insert(inventoryItems).values({ userId, itemId, source, slot: equippable ? item.kind : null, note });
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
  const [g] = await tx
    .select()
    .from(rewardGrants)
    .where(and(eq(rewardGrants.id, grantId), eq(rewardGrants.userId, userId)))
    .for('update');
  if (!g) throw notFound('Recompensa');
  if (g.reversalOf) throw conflict('Um estorno não pode ser estornado; registre um ajuste.');
  if (g.reversedAt) throw conflict('Esta recompensa já foi estornada.');

  const attrLines = await tx
    .select({ code: attributes.code, amount: grantAttributeXp.amount })
    .from(grantAttributeXp)
    .innerJoin(attributes, eq(attributes.id, grantAttributeXp.attributeId))
    .where(eq(grantAttributeXp.grantId, g.id));
  const skillLines = await tx.select().from(grantSkillXp).where(eq(grantSkillXp.grantId, g.id));
  const [coinTx] = await tx.select().from(coinTransactions).where(eq(coinTransactions.grantId, g.id));

  const inserted = await tx
    .insert(rewardGrants)
    .values({
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
    })
    .returning();
  const rev = inserted[0]!;
  await tx.update(rewardGrants).set({ reversedAt: new Date() }).where(eq(rewardGrants.id, g.id));

  const { config } = await getActiveConfig(tx, userId);
  await tx.insert(characterProgress).values({ userId }).onConflictDoNothing();
  const [cp] = await tx.select().from(characterProgress).where(eq(characterProgress.userId, userId)).for('update');
  const newXp = cp!.lifetimeXp - g.xp;
  if (newXp < 0) throw unprocessable('Estorno deixaria o XP vitalício negativo; verifique ajustes anteriores.');
  const level = levelFromXp(newXp, config.curves.character).level;
  await tx.update(characterProgress).set({ lifetimeXp: newXp, level, updatedAt: new Date() }).where(eq(characterProgress.userId, userId));

  for (const line of attrLines) {
    const [a] = await tx
      .select()
      .from(attributes)
      .where(and(eq(attributes.userId, userId), eq(attributes.code, line.code)))
      .for('update');
    const xp = a!.xp - line.amount;
    if (xp < 0) throw unprocessable(`Estorno deixaria o atributo ${line.code} negativo.`);
    await tx.insert(grantAttributeXp).values({ grantId: rev.id, attributeId: a!.id, userId, amount: -line.amount });
    await tx.update(attributes).set({ xp, level: levelFromXp(xp, config.curves.attribute).level }).where(eq(attributes.id, a!.id));
  }
  for (const line of skillLines) {
    const [s] = await tx.select().from(skills).where(eq(skills.id, line.skillId)).for('update');
    const xp = s!.xp - line.amount;
    if (xp < 0) throw unprocessable(`Estorno deixaria a habilidade ${s!.name} negativa.`);
    await tx.insert(grantSkillXp).values({ grantId: rev.id, skillId: s!.id, userId, amount: -line.amount });
    await tx.update(skills).set({ xp, level: levelFromXp(xp, config.curves.mastery).level }).where(eq(skills.id, s!.id));
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
