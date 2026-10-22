/** Histórico e correções auditadas sobre o livro-razão. */
import { XP_SOURCES, type XpSource } from '@rpg/engine';
import { auditHistory, coinHistory, grantHistory, missionEventHistory, penaltyHistory, type Page } from '../../persistence/queries/history';
import { inTransaction, type Db, type DbOrTx } from '../../persistence/unit-of-work';
import { audit } from '../audit';
import { revertPenalty } from '../penalties';
import { reverseGrant } from '../rewards';

export interface HistoryQuery extends Page {
  from?: string;
  to?: string;
  source?: string;
}

const isXpSource = (s: string | undefined): s is XpSource => !!s && (XP_SOURCES as readonly string[]).includes(s);

export const historyOf = {
  grants: (db: DbOrTx, userId: string, q: HistoryQuery) => grantHistory(db, userId, { ...q, source: isXpSource(q.source) ? q.source : undefined }),
  coins: (db: DbOrTx, userId: string, q: HistoryQuery) => coinHistory(db, userId, q),
  penalties: (db: DbOrTx, userId: string, q: HistoryQuery) => penaltyHistory(db, userId, q),
  missions: (db: DbOrTx, userId: string, q: HistoryQuery) => missionEventHistory(db, userId, q),
  audit: (db: DbOrTx, userId: string, q: HistoryQuery) => auditHistory(db, userId, q),
};

/** Estorno de uma recompensa do próprio administrador, com trilha de auditoria. */
export function reverseOwnGrant(db: Db, adminId: string, grantId: string, reason: string) {
  return inTransaction(db, async (tx) => {
    const r = await reverseGrant(tx, adminId, grantId, reason, adminId);
    await audit(tx, { actorId: adminId, userId: adminId, action: 'grant.reverse', entityType: 'reward_grants', entityId: grantId, meta: { reason, reversalId: r.grantId } });
    return r;
  });
}

/** Reverte uma penalidade aplicada incorretamente (do próprio administrador ou de outro usuário). */
export function revertPenaltyAsAdmin(db: Db, adminId: string, penaltyId: string, input: { reason: string; userId?: string }) {
  return inTransaction(db, (tx) => revertPenalty(tx, input.userId ?? adminId, penaltyId, input.reason, adminId));
}
