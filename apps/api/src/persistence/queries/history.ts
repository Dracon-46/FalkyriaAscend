/** Read model do histórico: recompensas, moedas, penalidades, eventos de missões e auditoria. */
import { and, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import type { XpSource } from '@rpg/engine';
import type { DbOrTx } from '../client';
import {
  attributes,
  auditLog,
  coinTransactions,
  grantAttributeXp,
  grantSkillXp,
  missionEvents,
  missions,
  penaltyApplications,
  rewardGrants,
  skills,
} from '../schema';

export interface Page {
  limit: number;
  offset: number;
}

export interface GrantHistoryFilter extends Page {
  from?: string;
  to?: string;
  source?: XpSource;
}

/** Recompensas com as linhas de XP de atributos e habilidades. */
export async function grantHistory(db: DbOrTx, userId: string, f: GrantHistoryFilter) {
  const conds: SQL[] = [eq(rewardGrants.userId, userId)];
  if (f.from) conds.push(gte(rewardGrants.localDate, f.from));
  if (f.to) conds.push(lte(rewardGrants.localDate, f.to));
  if (f.source) conds.push(eq(rewardGrants.xpSource, f.source));
  const rows = await db
    .select()
    .from(rewardGrants)
    .where(and(...conds))
    .orderBy(desc(rewardGrants.createdAt))
    .limit(f.limit)
    .offset(f.offset);
  const ids = rows.map((r) => r.id);
  const attrs = ids.length
    ? await db
        .select({ grantId: grantAttributeXp.grantId, code: attributes.code, amount: grantAttributeXp.amount })
        .from(grantAttributeXp)
        .innerJoin(attributes, eq(attributes.id, grantAttributeXp.attributeId))
        .where(inArray(grantAttributeXp.grantId, ids))
    : [];
  const sk = ids.length
    ? await db
        .select({ grantId: grantSkillXp.grantId, name: skills.name, amount: grantSkillXp.amount })
        .from(grantSkillXp)
        .innerJoin(skills, eq(skills.id, grantSkillXp.skillId))
        .where(inArray(grantSkillXp.grantId, ids))
    : [];
  return rows.map((r) => ({ ...r, attributes: attrs.filter((a) => a.grantId === r.id), skills: sk.filter((s) => s.grantId === r.id) }));
}

export function coinHistory(db: DbOrTx, userId: string, f: Page & { from?: string; to?: string }) {
  const conds: SQL[] = [eq(coinTransactions.userId, userId)];
  if (f.from) conds.push(gte(coinTransactions.localDate, f.from));
  if (f.to) conds.push(lte(coinTransactions.localDate, f.to));
  return db
    .select()
    .from(coinTransactions)
    .where(and(...conds))
    .orderBy(desc(coinTransactions.createdAt))
    .limit(f.limit)
    .offset(f.offset);
}

export function penaltyHistory(db: DbOrTx, userId: string, p: Page) {
  return db
    .select()
    .from(penaltyApplications)
    .where(eq(penaltyApplications.userId, userId))
    .orderBy(desc(penaltyApplications.createdAt))
    .limit(p.limit)
    .offset(p.offset);
}

export async function missionEventHistory(db: DbOrTx, userId: string, p: Page) {
  const rows = await db
    .select({ e: missionEvents, title: missions.title })
    .from(missionEvents)
    .innerJoin(missions, eq(missions.id, missionEvents.missionId))
    .where(eq(missionEvents.userId, userId))
    .orderBy(desc(missionEvents.createdAt))
    .limit(p.limit)
    .offset(p.offset);
  return rows.map((r) => ({ ...r.e, missionTitle: r.title }));
}

export function auditHistory(db: DbOrTx, userId: string, p: Page) {
  return db.select().from(auditLog).where(eq(auditLog.userId, userId)).orderBy(desc(auditLog.createdAt)).limit(p.limit).offset(p.offset);
}
