import type { GoalInput } from '@rpg/contracts';
import type { Goal } from '../../persistence/models';
import {
  deleteGoalRow,
  deleteMilestones,
  findGoal,
  findMilestone,
  insertGoal,
  insertMilestone,
  listDependencies,
  listGoals,
  listMilestones,
  lockGoal,
  replaceDependencies,
  updateGoalRow,
  updateMilestone,
} from '../../persistence/repositories/goals';
import { inTransaction, type Db } from '../../persistence/unit-of-work';
import { conflict, notFound } from '../../shared/errors';
import { audit } from '../audit';
import { afterAction } from '../hooks';
import { todayFor } from '../time';
import { assertOwned } from '../validation';
import { assertNoDependencyCycle, computeGoalProgress, maybeCompleteGoal } from '../goals';

// ------------------------------------------------------------------ Casos de uso

export async function listGoalsView(db: Db, userId: string, now: Date) {
  const today = await todayFor(db, userId, now);
  const rows = await listGoals(db, userId);
  const deps = await listDependencies(db, userId);
  return Promise.all(
    rows.map(async (g) => ({ ...g, ...(await computeGoalProgress(db, g, today)), dependsOn: deps.filter((d) => d.goalId === g.id).map((d) => d.dependsOnId) })),
  );
}

/** Cria (existingId = null) ou atualiza uma meta, suas etapas e dependências. */
export async function saveGoal(db: Db, userId: string, data: GoalInput, existingId: string | null, now: Date) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => {
    await assertOwned(tx, 'categories', data.categoryId, userId, 'Categoria');
    if (data.progressMode === 'metric' && (!data.metric || data.metricTarget == null)) throw conflict('Metas por métrica exigem métrica e alvo.');
    if (data.progressMode === 'milestones' && data.milestones.length === 0) throw conflict('Metas por etapas exigem ao menos uma etapa.');
    const { milestones, dependsOn, ...rest } = data;
    let before: Goal | null = null;
    let row: Goal;
    if (existingId) {
      before = await lockGoal(tx, userId, existingId);
      if (!before) throw notFound('Meta');
      if (before.status === 'completed') throw conflict('Meta concluída não pode ser editada.');
      row = await updateGoalRow(tx, existingId, rest);
    } else {
      row = await insertGoal(tx, { ...rest, userId });
    }
    await assertNoDependencyCycle(tx, userId, row.id, dependsOn);
    await replaceDependencies(tx, userId, row.id, dependsOn);
    const existing = await listMilestones(tx, row.id);
    const keep = new Set(milestones.map((m) => m.id).filter(Boolean) as string[]);
    await deleteMilestones(tx, existing.filter((e) => !keep.has(e.id)).map((e) => e.id));
    for (const [i, m] of milestones.entries()) {
      const prev = existing.find((e) => e.id === m.id);
      const values = { title: m.title, weight: m.weight, dueDate: m.dueDate ?? null, sortOrder: i, doneAt: m.done ? (prev?.doneAt ?? new Date()) : null };
      if (prev) await updateMilestone(tx, prev.id, values);
      else await insertMilestone(tx, { ...values, userId, goalId: row.id });
    }
    await audit(tx, { actorId: userId, userId, action: existingId ? 'update' : 'create', entityType: 'goals', entityId: row.id, before, after: { ...row, milestones, dependsOn } });
    await maybeCompleteGoal(tx, userId, row.id, today);
    await afterAction(tx, userId, today);
    return row;
  });
}

/** Marca/desmarca uma etapa, conclui a meta se chegar a 100% e devolve a meta atualizada. */
export async function toggleMilestone(db: Db, userId: string, goalId: string, milestoneId: string, now: Date) {
  const today = await todayFor(db, userId, now);
  return inTransaction(db, async (tx) => {
    const g = await findGoal(tx, userId, goalId);
    if (!g) throw notFound('Meta');
    if (g.status !== 'active') throw conflict('A meta não está ativa.');
    const m = await findMilestone(tx, goalId, milestoneId);
    if (!m) throw notFound('Etapa');
    await updateMilestone(tx, milestoneId, { doneAt: m.doneAt ? null : new Date() });
    const grant = await maybeCompleteGoal(tx, userId, goalId, today);
    await afterAction(tx, userId, today);
    const goal = (await findGoal(tx, userId, goalId))!;
    return { goal, ...(await computeGoalProgress(tx, goal, today)), completedReward: grant };
  });
}

export function setGoalStatus(db: Db, userId: string, id: string, status: Goal['status']) {
  return inTransaction(db, async (tx) => {
    const before = await lockGoal(tx, userId, id);
    if (!before) throw notFound('Meta');
    if (before.status === 'completed') throw conflict('Meta concluída não muda de estado.');
    const u = await updateGoalRow(tx, id, { status });
    await audit(tx, { actorId: userId, userId, action: `goal.${status}`, entityType: 'goals', entityId: id, before, after: u });
    return u;
  });
}

export function deleteGoal(db: Db, userId: string, id: string): Promise<void> {
  return inTransaction(db, async (tx) => {
    const g = await findGoal(tx, userId, id);
    if (!g) throw notFound('Meta');
    if (g.grantId) throw conflict('Meta concluída e recompensada não pode ser excluída.');
    await deleteGoalRow(tx, id);
    await audit(tx, { actorId: userId, userId, action: 'delete', entityType: 'goals', entityId: id, before: g });
  });
}
