import type { AssessmentInput, StudySessionInput, SubjectMilestoneInput } from '@rpg/contracts';
import { assessmentMastery, computeFixedReward, computeTimedReward } from '@rpg/engine';
import {
  addCompletedUnits,
  deleteStudySessionRow,
  findResource,
  findSessionByExternalId,
  findSkillByName,
  findStudySession,
  findSubject,
  hasEquivalentManualSession,
  insertAssessment,
  insertSkill,
  insertStudySession,
  insertSubjectMilestone,
  setAssessmentGrant,
  setSessionGrant,
  setSubjectMilestoneGrant,
} from '../persistence/repositories/study';
import { type DbOrTx } from '../persistence/unit-of-work';
import { badRequest, notFound } from '../shared/errors';
import { getActiveConfig } from './config';
import { xpTodayBySource } from './gameplay';
import { grantReward, reverseGrant } from './rewards';

const STUDY_WEIGHTS = { INT: 0.8, DIS: 0.2 };

async function getSubject(tx: DbOrTx, userId: string, id: string) {
  const s = await findSubject(tx, userId, id);
  if (!s) throw notFound('Disciplina');
  return s;
}

/**
 * Registra uma sessão de estudo. Tempo gera XP com retornos decrescentes e limite diário;
 * a maestria por tempo é limitada — domínio demonstrado vem de conteúdos, avaliações e marcos.
 * Sessões importadas com `externalId` são deduplicadas; uma importação equivalente a um
 * registro manual existente (mesma data, disciplina e duração ±10%) não recebe recompensa nova.
 */
export async function logStudySession(
  tx: DbOrTx,
  userId: string,
  input: StudySessionInput,
  today: string,
  opts: { source?: 'manual' | 'import' | 'demo'; externalId?: string | null } = {},
) {
  const subject = await getSubject(tx, userId, input.subjectId);
  const date = input.date ?? today;
  if (date > today) throw badRequest('Não é possível registrar sessões no futuro.');
  if (input.resourceId) {
    const r = await findResource(tx, userId, input.resourceId);
    if (!r || r.subjectId !== subject.id) throw badRequest('Recurso inválido para esta disciplina.');
  }
  const source = opts.source ?? 'manual';
  if (opts.externalId) {
    const dup = await findSessionByExternalId(tx, userId, source, opts.externalId);
    if (dup) return { session: dup, reward: null, duplicate: true };
  }
  const equivalentManual = source !== 'manual' && (await hasEquivalentManualSession(tx, userId, subject.id, date, input.minutes));

  const session = await insertStudySession(tx, {
    userId,
      subjectId: subject.id,
      resourceId: input.resourceId ?? null,
      localDate: date,
      minutes: input.minutes,
      activityType: input.activityType,
      content: input.content,
      result: input.result ?? null,
      notes: input.notes ?? null,
      evidenceUrl: input.evidenceUrl ?? null,
      unitsCompleted: input.unitsCompleted,
      source,
    externalId: opts.externalId ?? null,
  });

  if (equivalentManual) return { session, reward: null, duplicate: true };

  const { config } = await getActiveConfig(tx, userId);
  const todayXp = await xpTodayBySource(tx, userId, date);
  const reward = computeTimedReward(
    { kind: 'study', minutes: input.minutes, attributeWeights: STUDY_WEIGHTS, alreadyToday: todayXp.study ?? 0 },
    config,
  );
  let masteryFromUnits = 0;
  if (input.unitsCompleted > 0) {
    masteryFromUnits = input.unitsCompleted * config.study.unitCompletionMastery;
    reward.explanation.push(`${input.unitsCompleted} unidade(s) de conteúdo concluída(s): +${masteryFromUnits} maestria`);
    if (input.resourceId) await addCompletedUnits(tx, input.resourceId, input.unitsCompleted);
  }
  const grant = await grantReward(tx, {
    userId,
    idempotencyKey: `study:${session.id}`,
    sourceType: 'study_session',
    sourceId: session.id,
    xpSource: 'study',
    title: `Estudo: ${subject.name} (${input.minutes} min)`,
    localDate: date,
    reward,
    skillId: subject.skillId,
    skillXp: subject.skillId && masteryFromUnits ? { [subject.skillId]: masteryFromUnits } : undefined,
  });
  await setSessionGrant(tx, session.id, grant.grantId);
  return { session: { ...session, grantId: grant.grantId }, reward: { ...grant, explanation: reward.explanation }, duplicate: false };
}

export async function deleteStudySession(tx: DbOrTx, userId: string, id: string, actorId: string) {
  const s = await findStudySession(tx, userId, id);
  if (!s) throw notFound('Sessão');
  if (s.grantId) await reverseGrant(tx, userId, s.grantId, 'Sessão de estudo excluída', actorId).catch((e) => {
    if (e?.status !== 409) throw e;
  });
  await setSessionGrant(tx, id, null);
  await deleteStudySessionRow(tx, id);
}

/** Avaliação: maestria proporcional ao desempenho; XP moderado se aprovado (≥ 70%), fácil caso contrário. */
export async function logAssessment(tx: DbOrTx, userId: string, input: AssessmentInput, today: string) {
  const subject = await getSubject(tx, userId, input.subjectId);
  if (input.score > input.maxScore) throw badRequest('A nota não pode exceder a nota máxima.');
  const date = input.date ?? today;
  const row = await insertAssessment(tx, { userId, subjectId: subject.id, title: input.title, localDate: date, score: input.score, maxScore: input.maxScore, notes: input.notes ?? null });
  const { config } = await getActiveConfig(tx, userId);
  const pct = input.score / input.maxScore;
  const tier = pct >= 0.7 ? config.difficulty.moderate : config.difficulty.easy;
  const mastery = assessmentMastery(input.score, input.maxScore, config);
  const reward = computeFixedReward(
    { xp: tier.xp, coins: tier.coins, attributeWeights: { INT: 1 }, label: `Avaliação ${Math.round(pct * 100)}% (${pct >= 0.7 ? 'aprovado' : 'abaixo de 70%'})` },
    config,
  );
  reward.explanation.push(`Maestria por desempenho: ${mastery}`);
  const grant = await grantReward(tx, {
    userId,
    idempotencyKey: `assessment:${row.id}`,
    sourceType: 'assessment',
    sourceId: row.id,
    xpSource: 'study',
    title: `Avaliação: ${input.title}`,
    localDate: date,
    reward,
    skillXp: subject.skillId ? { [subject.skillId]: mastery } : undefined,
  });
  await setAssessmentGrant(tx, row.id, grant.grantId);
  return { assessment: row, reward: { ...grant, explanation: reward.explanation } };
}

/** Marco de domínio demonstrado (projeto, certificação, prova importante). */
export async function logSubjectMilestone(tx: DbOrTx, userId: string, input: SubjectMilestoneInput, today: string) {
  const subject = await getSubject(tx, userId, input.subjectId);
  const date = input.achievedOn ?? today;
  const row = await insertSubjectMilestone(tx, { userId, subjectId: subject.id, title: input.title, description: input.description, evidenceUrl: input.evidenceUrl ?? null, achievedOn: date });
  const { config } = await getActiveConfig(tx, userId);
  const reward = computeFixedReward(
    { xp: config.difficulty.hard.xp, coins: config.difficulty.hard.coins, attributeWeights: { INT: 0.7, EXE: 0.3 }, label: `Domínio demonstrado em ${subject.name}` },
    config,
  );
  reward.explanation.push(`Maestria: +${config.study.milestoneMastery}`);
  const grant = await grantReward(tx, {
    userId,
    idempotencyKey: `subject-milestone:${row.id}`,
    sourceType: 'subject_milestone',
    sourceId: row.id,
    xpSource: 'study',
    title: `Marco: ${input.title}`,
    localDate: date,
    reward,
    skillXp: subject.skillId ? { [subject.skillId]: config.study.milestoneMastery } : undefined,
  });
  await setSubjectMilestoneGrant(tx, row.id, grant.grantId);
  return { milestone: row, reward: grant };
}

/** Cria a habilidade de maestria de uma disciplina sob o ramo "Conhecimento". */
export async function ensureSubjectSkill(tx: DbOrTx, userId: string, subjectName: string): Promise<string | null> {
  const branch = await findSkillByName(tx, userId, 'Conhecimento');
  const existing = await findSkillByName(tx, userId, subjectName);
  if (existing) return existing.id;
  const s = await insertSkill(tx, { userId, name: subjectName, parentId: branch?.id ?? null, attributeId: branch?.attributeId ?? null, icon: 'book-open' });
  return s.id;
}
