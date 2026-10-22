import { computeFixedReward, goalProgress } from '@rpg/engine';
import type { Goal, GoalMilestone } from '../persistence/models';
import { metricValue } from '../persistence/queries/metrics';
import {
  countOwnedGoals,
  listActiveGoals,
  listDependencies,
  listMilestones,
  lockGoal,
  prerequisitesOf,
  updateGoalRow,
} from '../persistence/repositories/goals';
import { listMissionsOfGoal } from '../persistence/repositories/missions';
import { type DbOrTx } from '../persistence/unit-of-work';
import { conflict, notFound } from '../shared/errors';
import { getActiveConfig } from './config';
import { notify } from './notifications';
import { grantReward } from './rewards';

export interface GoalProgressView {
  progress: number;
  milestones: GoalMilestone[];
  missions: Array<{ id: string; title: string; status: string }>;
  metricCurrent: number | null;
  blockedBy: Array<{ id: string; title: string; status: string }>;
}

/** Progresso calculado por critério explícito (etapas ponderadas, missões vinculadas ou métrica). */
export async function computeGoalProgress(db: DbOrTx, g: Goal, today: string): Promise<GoalProgressView> {
  const milestones = await listMilestones(db, g.id);
  const linked = await listMissionsOfGoal(db, g.id);
  let metricCurrent: number | null = null;
  if (g.progressMode === 'metric' && g.metric) {
    metricCurrent =
      g.metric === 'manual'
        ? Number(g.metricCurrent ?? 0)
        : await metricValue(db, g.userId, g.metric, {
            from: g.startDate ?? g.createdAt.toISOString().slice(0, 10),
            to: g.deadline && g.deadline < today ? g.deadline : today,
            refId: g.metricRefId,
          });
  }
  const progress = goalProgress({
    mode: g.progressMode,
    milestones: milestones.map((m) => ({ weight: m.weight, done: m.doneAt !== null })),
    missions: linked,
    metric:
      g.progressMode === 'metric' && g.metricTarget != null
        ? { current: metricCurrent ?? 0, target: Number(g.metricTarget), start: g.metricStart != null ? Number(g.metricStart) : 0 }
        : undefined,
  });
  const deps = await prerequisitesOf(db, g.id);
  return { progress, milestones, missions: linked, metricCurrent, blockedBy: deps.filter((d) => d.status !== 'completed') };
}

/** Conclui a meta quando o progresso chega a 100% e as dependências estão concluídas. */
export async function maybeCompleteGoal(tx: DbOrTx, userId: string, goalId: string, today: string) {
  const g = await lockGoal(tx, userId, goalId);
  if (!g) throw notFound('Meta');
  if (g.status !== 'active') return null;
  const view = await computeGoalProgress(tx, g, today);
  if (view.progress < 1 || view.blockedBy.length > 0) return null;
  const { config } = await getActiveConfig(tx, userId);
  const table = config.difficulty[g.difficulty];
  const reward = computeFixedReward(
    {
      xp: table.xp,
      coins: table.coins,
      attributeWeights: { EXE: 0.7, ORG: 0.3 },
      label: `Meta concluída (${g.difficulty}): ${table.xp} XP / ${table.coins} moedas`,
    },
    config,
  );
  const grant = await grantReward(tx, {
    userId,
    idempotencyKey: `goal:${g.id}:complete`,
    sourceType: 'goal',
    sourceId: g.id,
    xpSource: 'goal',
    categoryId: g.categoryId,
    title: `Meta: ${g.title}`,
    localDate: today,
    reward,
  });
  await updateGoalRow(tx, g.id, { status: 'completed', completedAt: new Date(), grantId: grant.grantId });
  await notify(tx, userId, { category: 'milestone', title: `Meta concluída: ${g.title}`, link: `/metas`, dedupeKey: `goal:${g.id}` });
  return grant;
}

export async function refreshActiveGoals(tx: DbOrTx, userId: string, today: string) {
  for (const g of await listActiveGoals(tx, userId)) await maybeCompleteGoal(tx, userId, g.id, today);
}

/** Impede ciclos de dependência (A depende de B que depende de A). */
export async function assertNoDependencyCycle(db: DbOrTx, userId: string, goalId: string, dependsOn: string[]) {
  if (dependsOn.includes(goalId)) throw conflict('Uma meta não pode depender de si mesma.');
  const all = await listDependencies(db, userId);
  const graph = new Map<string, string[]>();
  for (const d of all) if (d.goalId !== goalId) graph.set(d.goalId, [...(graph.get(d.goalId) ?? []), d.dependsOnId]);
  graph.set(goalId, dependsOn);
  const seen = new Set<string>();
  const stack = [...dependsOn];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === goalId) throw conflict('Dependência circular entre metas.');
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(graph.get(cur) ?? []));
  }
  if (dependsOn.length && (await countOwnedGoals(db, userId, dependsOn)) !== new Set(dependsOn).size) throw conflict('Dependência inválida.');
}
