import { and, asc, eq, inArray } from 'drizzle-orm';
import { computeFixedReward, goalProgress } from '@rpg/engine';
import type { DbOrTx } from '../db/client';
import { goalDependencies, goalMilestones, goals, missions } from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { getActiveConfig } from './config';
import { metricValue } from './metrics';
import { notify } from './notifications';
import { grantReward } from './rewards';

type Goal = typeof goals.$inferSelect;

export interface GoalProgressView {
  progress: number;
  milestones: Array<typeof goalMilestones.$inferSelect>;
  missions: Array<{ id: string; title: string; status: string }>;
  metricCurrent: number | null;
  blockedBy: Array<{ id: string; title: string; status: string }>;
}

/** Progresso calculado por critério explícito (etapas ponderadas, missões vinculadas ou métrica). */
export async function computeGoalProgress(db: DbOrTx, g: Goal, today: string): Promise<GoalProgressView> {
  const milestones = await db.select().from(goalMilestones).where(eq(goalMilestones.goalId, g.id)).orderBy(asc(goalMilestones.sortOrder));
  const linked = await db
    .select({ id: missions.id, title: missions.title, status: missions.status })
    .from(missions)
    .where(eq(missions.goalId, g.id));
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
  const deps = await db
    .select({ id: goals.id, title: goals.title, status: goals.status })
    .from(goalDependencies)
    .innerJoin(goals, eq(goals.id, goalDependencies.dependsOnId))
    .where(eq(goalDependencies.goalId, g.id));
  return { progress, milestones, missions: linked, metricCurrent, blockedBy: deps.filter((d) => d.status !== 'completed') };
}

/** Conclui a meta quando o progresso chega a 100% e as dependências estão concluídas. */
export async function maybeCompleteGoal(tx: DbOrTx, userId: string, goalId: string, today: string) {
  const [g] = await tx.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.userId, userId))).for('update');
  if (!g) throw notFound('Meta');
  if (g.status !== 'active') return null;
  const view = await computeGoalProgress(tx, g, today);
  if (view.progress < 1 || view.blockedBy.length > 0) return null;
  const { config } = await getActiveConfig(tx, userId);
  const table = config.difficulty[g.difficulty];
  const reward = computeFixedReward(
    { xp: table.xp, coins: table.coins, attributeWeights: { EXE: 0.7, ORG: 0.3 }, label: `Meta concluída (${g.difficulty}): ${table.xp} XP / ${table.coins} moedas` },
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
  await tx.update(goals).set({ status: 'completed', completedAt: new Date(), grantId: grant.grantId, updatedAt: new Date() }).where(eq(goals.id, g.id));
  await notify(tx, userId, { category: 'milestone', title: `Meta concluída: ${g.title}`, link: `/metas`, dedupeKey: `goal:${g.id}` });
  return grant;
}

export async function refreshActiveGoals(tx: DbOrTx, userId: string, today: string) {
  const active = await tx.select({ id: goals.id }).from(goals).where(and(eq(goals.userId, userId), eq(goals.status, 'active')));
  for (const g of active) await maybeCompleteGoal(tx, userId, g.id, today);
}

/** Impede ciclos de dependência (A depende de B que depende de A). */
export async function assertNoDependencyCycle(db: DbOrTx, userId: string, goalId: string, dependsOn: string[]) {
  if (dependsOn.includes(goalId)) throw conflict('Uma meta não pode depender de si mesma.');
  const all = await db.select().from(goalDependencies).where(eq(goalDependencies.userId, userId));
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
  if (dependsOn.length) {
    const rows = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.userId, userId), inArray(goals.id, dependsOn)));
    if (rows.length !== new Set(dependsOn).size) throw conflict('Dependência inválida.');
  }
}
