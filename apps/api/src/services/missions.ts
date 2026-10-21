import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  TERMINAL_MISSION_STATUSES,
  addDays,
  canTransitionMission,
  compositeProgress,
  computeMissionReward,
  diffDays,
  isoWeekKey,
  startOfIsoWeek,
  startOfMonth,
  validateDifficulty,
  weekdayOf,
  maskHasDay,
  MISSION_STATUS_LABELS,
  type MissionStatus,
} from '@rpg/engine';
import type { MissionInput } from '@rpg/contracts';
import type { DbOrTx } from '../db/client';
import {
  categories,
  goals,
  missionEvents,
  missionObjectives,
  missionPenaltyRules,
  missions,
  missionTemplates,
  penaltyRules,
  seasons,
} from '../db/schema';
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors';
import { getActiveConfig } from './config';
import { currentMultiplier, hardMissionsCompletedToday, xpTodayBySource } from './gameplay';
import { metricValue } from './metrics';
import { notify } from './notifications';
import { applyPenalties } from './penalties';
import { grantReward } from './rewards';
import { assertOwned, validatePenaltyRules, validateWeights } from './validation';

type Mission = typeof missions.$inferSelect;
type Actor = 'user' | 'system' | 'admin';

async function getMission(tx: DbOrTx, userId: string, id: string, lock = false): Promise<Mission> {
  const q = tx.select().from(missions).where(and(eq(missions.id, id), eq(missions.userId, userId)));
  const [m] = lock ? await q.for('update') : await q;
  if (!m) throw notFound('Missão');
  return m;
}

async function logEvent(tx: DbOrTx, m: Mission, to: string, actor: Actor, reason?: string | null, data?: unknown) {
  await tx.insert(missionEvents).values({
    userId: m.userId,
    missionId: m.id,
    fromStatus: m.status,
    toStatus: to,
    reason: reason ?? null,
    data: data ?? null,
    actor,
  });
}

async function validateMissionInput(tx: DbOrTx, userId: string, input: MissionInput) {
  const { config } = await getActiveConfig(tx, userId);
  const errors = validateDifficulty(
    {
      type: input.type,
      difficulty: input.difficulty,
      startDate: input.startDate,
      dueDate: input.dueDate,
      objectiveCount: input.objectives.filter((o) => !o.optional).length,
    },
    config,
  );
  if (input.startDate && input.dueDate && input.dueDate < input.startDate) errors.push('O prazo deve ser posterior ao início.');
  if (errors.length) throw unprocessable(errors.join(' '), { errors });
  await assertOwned(tx, categories, input.categoryId, userId, 'Categoria');
  await assertOwned(tx, goals, input.goalId, userId, 'Meta');
  await assertOwned(tx, seasons, input.seasonId, userId, 'Temporada');
  await assertOwned(tx, missions, input.parentId, userId, 'Missão-mãe');
  const weights = await validateWeights(tx, userId, input.attributeWeights);
  await validatePenaltyRules(tx, userId, input.penaltyRuleIds);
  return weights;
}

export async function createMission(
  tx: DbOrTx,
  userId: string,
  input: MissionInput,
  opts: { source?: Mission['source']; templateId?: string; periodKey?: string; actor?: Actor } = {},
): Promise<Mission | null> {
  const weights = await validateMissionInput(tx, userId, input);
  const inserted = await tx
    .insert(missions)
    .values({
      userId,
      title: input.title,
      description: input.description,
      type: input.type,
      difficulty: input.difficulty,
      categoryId: input.categoryId ?? null,
      goalId: input.goalId ?? null,
      seasonId: input.seasonId ?? null,
      parentId: input.parentId ?? null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      completionMode: input.completionMode,
      rewardXpOverride: input.rewardXpOverride ?? null,
      rewardCoinsOverride: input.rewardCoinsOverride ?? null,
      isSecret: input.isSecret,
      evidenceRequired: input.evidenceRequired,
      priority: input.priority,
      attributeWeights: weights,
      source: opts.source ?? 'manual',
      templateId: opts.templateId ?? null,
      periodKey: opts.periodKey ?? null,
    })
    .onConflictDoNothing()
    .returning();
  const m = inserted[0];
  if (!m) return null; // instância recorrente já existente
  if (input.objectives.length) {
    await tx.insert(missionObjectives).values(
      input.objectives.map((o, i) => ({
        userId,
        missionId: m.id,
        title: o.title,
        metric: o.metric,
        metricRefId: o.metricRefId ?? null,
        target: o.target,
        current: o.metric === 'manual' ? (o.current ?? 0) : 0,
        unit: o.unit ?? null,
        optional: o.optional,
        sortOrder: i,
      })),
    );
  }
  if (input.penaltyRuleIds.length) {
    await tx.insert(missionPenaltyRules).values(input.penaltyRuleIds.map((ruleId) => ({ userId, missionId: m.id, ruleId })));
  }
  await tx.insert(missionEvents).values({ userId, missionId: m.id, toStatus: m.status, actor: opts.actor ?? 'user', reason: 'Criada' });
  return m;
}

export async function updateMission(tx: DbOrTx, userId: string, id: string, input: MissionInput, today: string, actor: Actor = 'user') {
  const m = await getMission(tx, userId, id, true);
  if (TERMINAL_MISSION_STATUSES.includes(m.status) && actor !== 'admin') {
    throw conflict(`Missão ${MISSION_STATUS_LABELS[m.status].toLowerCase()} não pode ser editada.`);
  }
  if (m.dueDate && input.dueDate !== m.dueDate && m.dueDate < today && actor !== 'admin') {
    throw conflict('O prazo já passou: o reagendamento precisa ser feito antes do prazo.');
  }
  const weights = await validateMissionInput(tx, userId, input);
  const [updated] = await tx
    .update(missions)
    .set({
      title: input.title,
      description: input.description,
      type: input.type,
      difficulty: input.difficulty,
      categoryId: input.categoryId ?? null,
      goalId: input.goalId ?? null,
      seasonId: input.seasonId ?? null,
      parentId: input.parentId ?? null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      completionMode: input.completionMode,
      rewardXpOverride: input.rewardXpOverride ?? null,
      rewardCoinsOverride: input.rewardCoinsOverride ?? null,
      isSecret: input.isSecret,
      evidenceRequired: input.evidenceRequired,
      priority: input.priority,
      attributeWeights: weights,
      updatedAt: new Date(),
    })
    .where(eq(missions.id, id))
    .returning();

  // Objetivos: atualiza os existentes, cria novos e remove os ausentes.
  const existing = await tx.select().from(missionObjectives).where(eq(missionObjectives.missionId, id));
  const keep = new Set(input.objectives.map((o) => o.id).filter(Boolean) as string[]);
  const toDelete = existing.filter((o) => !keep.has(o.id)).map((o) => o.id);
  if (toDelete.length) await tx.delete(missionObjectives).where(inArray(missionObjectives.id, toDelete));
  for (const [i, o] of input.objectives.entries()) {
    const values = {
      title: o.title,
      metric: o.metric,
      metricRefId: o.metricRefId ?? null,
      target: o.target,
      unit: o.unit ?? null,
      optional: o.optional,
      sortOrder: i,
      ...(o.metric === 'manual' && o.current !== undefined ? { current: o.current } : {}),
    };
    if (o.id && existing.some((e) => e.id === o.id)) {
      await tx.update(missionObjectives).set(values).where(eq(missionObjectives.id, o.id));
    } else {
      await tx.insert(missionObjectives).values({ ...values, userId, missionId: id, current: o.current ?? 0 });
    }
  }
  await tx.delete(missionPenaltyRules).where(eq(missionPenaltyRules.missionId, id));
  if (input.penaltyRuleIds.length) {
    await tx.insert(missionPenaltyRules).values(input.penaltyRuleIds.map((ruleId) => ({ userId, missionId: id, ruleId })));
  }
  if (m.dueDate !== (input.dueDate ?? null)) {
    await logEvent(tx, m, m.status, actor, 'Prazo alterado', { from: m.dueDate, to: input.dueDate ?? null });
  }
  return updated!;
}

/** Atualiza objetivos automáticos a partir dos registros e retorna o progresso composto. */
export async function refreshObjectives(tx: DbOrTx, m: Mission, today: string) {
  const objectives = await tx
    .select()
    .from(missionObjectives)
    .where(eq(missionObjectives.missionId, m.id))
    .orderBy(asc(missionObjectives.sortOrder));
  const from = m.startDate ?? m.createdAt.toISOString().slice(0, 10);
  const to = m.dueDate && m.dueDate < today ? m.dueDate : today;
  for (const o of objectives) {
    if (o.metric === 'manual') continue;
    const value = await metricValue(tx, m.userId, o.metric, { from, to, refId: o.metricRefId, excludeMissionId: m.id });
    if (value !== Number(o.current)) {
      await tx.update(missionObjectives).set({ current: value }).where(eq(missionObjectives.id, o.id));
      o.current = value;
    }
  }
  return { objectives, progress: compositeProgress(objectives.map((o) => ({ target: Number(o.target), current: Number(o.current), optional: o.optional }))) };
}

/** Atualiza missões ativas com objetivos automáticos e conclui as de modo automático. */
export async function refreshActiveMissions(tx: DbOrTx, userId: string, today: string): Promise<string[]> {
  const active = await tx
    .select()
    .from(missions)
    .where(and(eq(missions.userId, userId), inArray(missions.status, ['available', 'in_progress'])));
  const completed: string[] = [];
  for (const m of active) {
    const { objectives, progress } = await refreshObjectives(tx, m, today);
    if (m.completionMode === 'auto' && objectives.length > 0 && progress.complete) {
      await completeMission(tx, userId, m.id, today, { actor: 'system' });
      completed.push(m.title);
    }
  }
  return completed;
}

export async function completeMission(
  tx: DbOrTx,
  userId: string,
  id: string,
  today: string,
  opts: { actor?: Actor; evidence?: string | null } = {},
) {
  const m = await getMission(tx, userId, id, true);
  if (m.status === 'completed') return { mission: m, reward: null };
  if (!canTransitionMission(m.status, 'completed')) {
    throw conflict(`Não é possível concluir uma missão ${MISSION_STATUS_LABELS[m.status].toLowerCase()}.`);
  }
  if (m.startDate && m.startDate > today) throw conflict('A missão ainda não começou.');
  const { objectives, progress } = await refreshObjectives(tx, m, today);
  if (objectives.length > 0 && !progress.complete) {
    throw conflict(`Objetivos obrigatórios pendentes: ${progress.requiredDone}/${progress.requiredTotal} concluídos.`);
  }
  const evidence = opts.evidence ?? m.evidence;
  if (m.evidenceRequired && !evidence) throw badRequest('Esta missão exige evidência para ser concluída.');

  const { config } = await getActiveConfig(tx, userId);
  const today_ = await xpTodayBySource(tx, userId, today);
  const mult = await currentMultiplier(tx, userId, today, config);
  const reward = computeMissionReward(
    {
      difficulty: m.difficulty,
      attributeWeights: m.attributeWeights,
      hardCompletedToday: await hardMissionsCompletedToday(tx, userId, today),
      xpFromMissionsToday: today_.mission ?? 0,
      multiplier: mult.multiplier,
      override: { xp: m.rewardXpOverride, coins: m.rewardCoinsOverride },
    },
    config,
  );
  const grant = await grantReward(tx, {
    userId,
    idempotencyKey: `mission:${m.id}:complete`,
    sourceType: 'mission',
    sourceId: m.id,
    xpSource: 'mission',
    categoryId: m.categoryId,
    title: `Missão: ${m.title}`,
    localDate: today,
    reward,
  });
  const [updated] = await tx
    .update(missions)
    .set({ status: 'completed', completedAt: new Date(), completedOn: today, grantId: grant.grantId, evidence, updatedAt: new Date() })
    .where(eq(missions.id, m.id))
    .returning();
  await logEvent(tx, m, 'completed', opts.actor ?? 'user', null, { xp: grant.xp, coins: grant.coins });
  await notify(tx, userId, {
    category: 'mission',
    title: `Missão concluída: ${m.title}`,
    body: `+${grant.xp} XP · +${grant.coins} moedas`,
    link: `/missoes/${m.id}`,
    dedupeKey: `mission-complete:${m.id}`,
  });
  return { mission: updated!, reward: { ...grant, explanation: reward.explanation } };
}

/** Falha explícita ou por prazo: aplica as penalidades configuradas na missão. */
export async function failMission(
  tx: DbOrTx,
  userId: string,
  id: string,
  today: string,
  opts: { actor: Actor; reason?: string | null; status?: 'failed' | 'expired'; suppressPenalty?: string | null },
) {
  const m = await getMission(tx, userId, id, true);
  const to = opts.status ?? 'failed';
  if (!canTransitionMission(m.status, to)) throw conflict(`Transição inválida: ${m.status} → ${to}`);
  const [updated] = await tx
    .update(missions)
    .set({ status: to, statusReason: opts.reason ?? null, updatedAt: new Date() })
    .where(eq(missions.id, id))
    .returning();
  await logEvent(tx, m, to, opts.actor, opts.reason ?? (opts.suppressPenalty ? `Sem penalidade: ${opts.suppressPenalty}` : null));
  const rules = await tx
    .select({ r: penaltyRules })
    .from(missionPenaltyRules)
    .innerJoin(penaltyRules, eq(penaltyRules.id, missionPenaltyRules.ruleId))
    .where(eq(missionPenaltyRules.missionId, id));
  if (rules.length && !opts.suppressPenalty) {
    // Falhas consecutivas da mesma série recorrente escalonam a penalidade.
    let consecutive = 1;
    if (m.templateId) {
      const previous = await tx
        .select({ status: missions.status })
        .from(missions)
        .where(and(eq(missions.templateId, m.templateId), inArray(missions.status, ['completed', 'failed', 'expired'])))
        .orderBy(desc(missions.dueDate))
        .limit(10);
      for (const p of previous.slice(1)) {
        if (p.status === 'completed') break;
        consecutive++;
      }
    }
    await applyPenalties(tx, {
      userId,
      rules: rules.map((r) => r.r),
      sourceType: 'mission',
      sourceId: m.id,
      sourceTitle: m.title,
      localDate: m.dueDate && m.dueDate < today ? m.dueDate : today,
      consecutiveMisses: consecutive,
      keyBase: `mission:${m.id}:fail`,
      categoryId: m.categoryId,
    });
  }
  return updated!;
}

export async function transitionMission(
  tx: DbOrTx,
  userId: string,
  id: string,
  action: 'start' | 'cancel' | 'suspend' | 'resume' | 'reschedule',
  today: string,
  opts: { reason?: string | null; dueDate?: string | null; actor?: Actor },
) {
  const m = await getMission(tx, userId, id, true);
  const actor = opts.actor ?? 'user';
  let to: MissionStatus = m.status;
  const patch: Partial<Mission> = {};
  switch (action) {
    case 'start':
      to = 'in_progress';
      break;
    case 'cancel':
      if (!opts.reason) throw badRequest('Informe o motivo do cancelamento.');
      to = 'cancelled';
      break;
    case 'suspend':
      if (!opts.reason) throw badRequest('Informe o motivo da suspensão.');
      to = 'suspended';
      break;
    case 'resume':
      if (m.status !== 'suspended') throw conflict('Apenas missões suspensas podem ser retomadas.');
      to = 'in_progress';
      break;
    case 'reschedule': {
      if (!opts.dueDate) throw badRequest('Informe o novo prazo.');
      if (TERMINAL_MISSION_STATUSES.includes(m.status)) throw conflict('Missão encerrada não pode ser reagendada.');
      if (m.dueDate && m.dueDate < today && actor !== 'admin') throw conflict('O prazo já passou: reagende antes do prazo.');
      if (opts.dueDate < today) throw badRequest('O novo prazo não pode estar no passado.');
      patch.dueDate = opts.dueDate;
      await logEvent(tx, m, m.status, actor, opts.reason ?? 'Reagendada', { from: m.dueDate, to: opts.dueDate });
      const [u] = await tx.update(missions).set({ ...patch, updatedAt: new Date() }).where(eq(missions.id, id)).returning();
      return u!;
    }
  }
  if (!canTransitionMission(m.status, to)) {
    throw conflict(`Transição inválida: ${MISSION_STATUS_LABELS[m.status]} → ${MISSION_STATUS_LABELS[to]}`);
  }
  const [u] = await tx
    .update(missions)
    .set({ status: to, statusReason: opts.reason ?? null, updatedAt: new Date() })
    .where(eq(missions.id, id))
    .returning();
  await logEvent(tx, m, to, actor, opts.reason);
  return u!;
}

/** Gera instâncias de modelos recorrentes para o período atual (idempotente por período). */
export async function generateRecurringMissions(tx: DbOrTx, userId: string, today: string): Promise<number> {
  const templates = await tx
    .select()
    .from(missionTemplates)
    .where(and(eq(missionTemplates.userId, userId), eq(missionTemplates.active, true)));
  let created = 0;
  for (const t of templates) {
    if (t.recurrence === 'none') continue;
    let periodKey: string;
    let start: string;
    let due: string;
    if (t.recurrence === 'daily') {
      if (!maskHasDay(t.weekdaysMask, weekdayOf(today))) continue;
      periodKey = today;
      start = today;
      due = today;
    } else if (t.recurrence === 'weekly') {
      periodKey = isoWeekKey(today);
      start = startOfIsoWeek(today);
      due = addDays(start, 6);
    } else {
      periodKey = today.slice(0, 7);
      start = startOfMonth(today);
      const nextMonth = addDays(start, 32);
      due = addDays(startOfMonth(nextMonth), -1);
    }
    const ruleIds = (await validatePenaltyRules(tx, userId, t.penaltyRuleIds).catch(() => [])).map((r) => r.id);
    const m = await createMission(
      tx,
      userId,
      {
        title: t.title,
        description: t.description,
        type: t.type,
        difficulty: t.difficulty,
        categoryId: t.categoryId,
        goalId: null,
        seasonId: null,
        parentId: null,
        startDate: start,
        dueDate: due,
        completionMode: t.objectives.length ? 'auto' : 'manual',
        rewardXpOverride: null,
        rewardCoinsOverride: null,
        isSecret: false,
        evidenceRequired: false,
        priority: 0,
        attributeWeights: t.attributeWeights,
        objectives: t.objectives.map((o) => ({
          title: o.title,
          metric: o.metric as MissionInput['objectives'][number]['metric'],
          target: o.target,
          unit: o.unit ?? null,
          optional: o.optional ?? false,
        })),
        penaltyRuleIds: ruleIds,
      },
      { source: 'template', templateId: t.id, periodKey, actor: 'system' },
    ).catch((err) => {
      // Um modelo inválido (ex.: atributo removido) não deve interromper os demais.
      if (err?.status === 422) return null;
      throw err;
    });
    if (m) created++;
  }
  return created;
}

/** Expira/falha missões cujo prazo terminou em `date`. */
export async function closeOverdueMissions(tx: DbOrTx, userId: string, date: string, isUnavailable: (d: string, categoryId: string | null) => boolean) {
  const overdue = await tx
    .select()
    .from(missions)
    .where(and(eq(missions.userId, userId), inArray(missions.status, ['available', 'in_progress']), eq(missions.dueDate, date)));
  for (const m of overdue) {
    const hasRules =
      (await tx.select({ id: missionPenaltyRules.ruleId }).from(missionPenaltyRules).where(eq(missionPenaltyRules.missionId, m.id)).limit(1))
        .length > 0;
    const unavailable = isUnavailable(date, m.categoryId);
    await failMission(tx, userId, m.id, addDays(date, 1), {
      actor: 'system',
      status: hasRules && !unavailable ? 'failed' : 'expired',
      reason: 'Prazo encerrado',
      suppressPenalty: unavailable ? 'Indisponibilidade registrada' : null,
    });
  }
  return overdue.length;
}

/** Missões que vencem hoje ou amanhã: notificação de prazo (uma por missão). */
export async function notifyDeadlines(tx: DbOrTx, userId: string, today: string) {
  const soon = await tx
    .select()
    .from(missions)
    .where(and(eq(missions.userId, userId), inArray(missions.status, ['available', 'in_progress']), isNull(missions.completedAt)));
  for (const m of soon) {
    if (!m.dueDate) continue;
    const days = diffDays(today, m.dueDate);
    if (days < 0 || days > 1) continue;
    await notify(tx, userId, {
      category: 'deadline',
      title: days === 0 ? `Prazo hoje: ${m.title}` : `Prazo amanhã: ${m.title}`,
      link: `/missoes/${m.id}`,
      dedupeKey: `deadline:${m.id}:${m.dueDate}`,
    });
  }
}
