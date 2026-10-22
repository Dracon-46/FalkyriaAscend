import { MISSION_STATUSES, type MissionType, type MissionStatus } from '@rpg/engine';
import type { MissionActionInput, MissionInput } from '@rpg/contracts';
import {
  findMission,
  findObjective,
  listMissionEvents,
  listMissions,
  listObjectivesOf,
  ruleIdsOfMission,
  lockMission,
  updateMissionRow,
  updateObjective,
} from '../../persistence/repositories/missions';
import { grantsOfSource } from '../../persistence/repositories/ledger';
import { applicationsOfSource } from '../../persistence/repositories/penalties';
import { inTransaction, type Db, type DbOrTx } from '../../persistence/unit-of-work';
import { conflict, notFound } from '../../shared/errors';
import { afterAction } from '../hooks';
import { suggestMissions } from '../mission-suggestions';
import { todayFor } from '../time';
import { completeMission, createMission, failMission, refreshObjectives, transitionMission, updateMission, type Actor } from '../missions';

// ------------------------------------------------------------------ Casos de uso

export interface MissionListFilter {
  /** Lista separada por vírgula; valores desconhecidos são ignorados. */
  status?: string;
  type?: MissionType;
  goalId?: string;
  q?: string;
}

/** Lista de missões com objetivos. Missões secretas ativas aparecem ocultas até serem concluídas. */
export async function listMissionsView(db: DbOrTx, userId: string, f: MissionListFilter) {
  const statuses = (f.status ?? '').split(',').filter((s): s is MissionStatus => (MISSION_STATUSES as readonly string[]).includes(s));
  const rows = await listMissions(db, userId, { statuses, type: f.type, goalId: f.goalId, titleContains: f.q });
  const objs = await listObjectivesOf(db, rows.map((r) => r.id));
  return rows.map((m) => {
    const objectives = objs.filter((o) => o.missionId === m.id);
    if (m.isSecret && m.status !== 'completed') {
      return { ...m, title: 'Missão secreta', description: 'Revelada ao ser concluída.', objectives: objectives.map((o) => ({ ...o, title: '???' })), hidden: true };
    }
    return { ...m, objectives, hidden: false };
  });
}

/** Detalhe da missão: objetivos recalculados, eventos, regras, recompensas e penalidades. */
export async function missionDetail(db: Db, userId: string, id: string, now: Date) {
  const today = await todayFor(db, userId, now);
  const m = await findMission(db, userId, id);
  if (!m) throw notFound('Missão');
  const { objectives, progress } = await inTransaction(db, (tx) => refreshObjectives(tx, m, today));
  return {
    ...m,
    objectives,
    progress,
    events: await listMissionEvents(db, id),
    penaltyRuleIds: await ruleIdsOfMission(db, id),
    grants: await grantsOfSource(db, userId, id),
    penalties: await applicationsOfSource(db, userId, id),
  };
}

export function createMissionFor(db: Db, userId: string, input: MissionInput) {
  return inTransaction(db, (tx) => createMission(tx, userId, input));
}

export async function updateMissionFor(db: Db, userId: string, id: string, input: MissionInput, now: Date, actor: Actor) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, (tx) => updateMission(tx, userId, id, input, today, actor));
}

/** Concluir, falhar, iniciar, cancelar, suspender, retomar ou reagendar. */
export async function runMissionAction(db: Db, userId: string, id: string, input: MissionActionInput, now: Date) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => {
    if (input.action === 'complete') {
      const r = await completeMission(tx, userId, id, today, { evidence: input.evidence });
      return { ...r, after: await afterAction(tx, userId, today) };
    }
    if (input.action === 'fail') {
      return { mission: await failMission(tx, userId, id, today, { actor: 'user', reason: input.reason ?? 'Falha declarada pelo usuário' }) };
    }
    return { mission: await transitionMission(tx, userId, id, input.action, today, { reason: input.reason, dueDate: input.dueDate }) };
  });
}

/** Progresso manual de um objetivo (objetivos automáticos são calculados dos registros). */
export async function setObjectiveProgress(db: Db, userId: string, missionId: string, objectiveId: string, current: number, now: Date) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => {
    const m = await lockMission(tx, userId, missionId);
    if (!m) throw notFound('Missão');
    if (!['available', 'in_progress'].includes(m.status)) throw conflict('A missão não está ativa.');
    const o = await findObjective(tx, missionId, objectiveId);
    if (!o) throw notFound('Objetivo');
    if (o.metric !== 'manual') throw conflict('Objetivos automáticos são calculados a partir dos registros.');
    await updateObjective(tx, objectiveId, { current });
    if (m.status === 'available') await updateMissionRow(tx, missionId, { status: 'in_progress' });
    await afterAction(tx, userId, today);
    const fresh = (await findMission(tx, userId, missionId))!;
    return { ...(await refreshObjectives(tx, fresh, today)), status: fresh.status };
  });
}

export async function missionSuggestionsFor(db: Db, userId: string, now: Date) {
  return suggestMissions(db, userId, await todayFor(db, userId, now));
}
