/**
 * Dados de demonstração — SEMPRE num usuário separado e identificado (is_demo = true).
 * Nunca toca nos dados reais. Gera ~60 dias de histórico usando os MESMOS serviços da API,
 * então todas as regras (limites, penalidades, conquistas) são respeitadas.
 *
 * Uso: npm run seed:demo  (DEMO_PASSWORD opcional; padrão: demonstracao-falkyria)
 */
import { eq } from 'drizzle-orm';
import { addDays, localDateOf, mulberry32 } from '@rpg/engine';
import { createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { activityTypes, exercises, habitPenaltyRules, habits, penaltyRules, studySubjects, users } from '../src/db/schema';
import { loadEnv } from '../src/env';
import { hashPassword } from '../src/lib/crypto';
import { recordActivity, quickLog } from '../src/services/activities';
import { seedUserDefaults } from '../src/services/defaults';
import { evaluateUser } from '../src/services/evaluation';
import { checkin } from '../src/services/habits';
import { afterAction } from '../src/services/hooks';
import { completeMission, createMission } from '../src/services/missions';
import { logAssessment, logStudySession } from '../src/services/study';
import { deleteUserData } from '../src/routes/core';

const DEMO_EMAIL = 'demo@falkyria.local';
const DAYS = 60;
const TZ = 'America/Sao_Paulo';

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);
await runMigrations(db);

const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
if (existing) {
  if (!existing.isDemo) throw new Error('Existe um usuário real com o e-mail de demonstração; abortando.');
  await db.transaction((tx) => deleteUserData(tx, existing.id));
}

const start = new Date(Date.now() - DAYS * 86_400_000);
const startLocal = localDateOf(start, TZ);
const [demo] = await db
  .insert(users)
  .values({
    email: DEMO_EMAIL,
    passwordHash: await hashPassword(process.env.DEMO_PASSWORD ?? 'demonstracao-falkyria'),
    displayName: 'Aventureiro de Demonstração',
    characterClass: 'Monge de Ferro',
    role: 'user',
    isDemo: true,
    createdAt: start,
  })
  .returning();
const uid = demo!.id;
await db.transaction((tx) => seedUserDefaults(tx, uid, startLocal));

const rules = await db.select().from(penaltyRules).where(eq(penaltyRules.userId, uid));
const fine = rules.find((r) => r.name === 'Multa leve')!;
const habitDefs: Array<{ title: string; attributeWeights: Record<string, number>; penaltyRuleIds: string[]; p: number }> = [
  { title: 'Planejar o dia', attributeWeights: { ORG: 1 }, penaltyRuleIds: [fine.id], p: 0.85 },
  { title: 'Leitura (20 páginas)', attributeWeights: { INT: 0.7, DIS: 0.3 }, penaltyRuleIds: [], p: 0.75 },
  { title: 'Arrumar o quarto', attributeWeights: { ORG: 0.6, DIS: 0.4 }, penaltyRuleIds: [], p: 0.7 },
  { title: 'Registrar despesas', attributeWeights: { ORG: 1 }, penaltyRuleIds: [fine.id], p: 0.6 },
  { title: 'Mobilidade (10 min)', attributeWeights: { VIT: 1 }, penaltyRuleIds: [], p: 0.65 },
];
const created: Array<typeof habits.$inferSelect & { p: number }> = [];
for (const h of habitDefs) {
  const [row] = await db
    .insert(habits)
    .values({ userId: uid, title: h.title, startDate: startLocal, attributeWeights: h.attributeWeights, tolerancePerWeek: 1 })
    .returning();
  if (h.penaltyRuleIds.length) await db.insert(habitPenaltyRules).values(h.penaltyRuleIds.map((ruleId) => ({ userId: uid, habitId: row!.id, ruleId })));
  created.push({ ...row!, p: h.p });
}
const subjects = await db.select().from(studySubjects).where(eq(studySubjects.userId, uid));
const types = await db.select().from(activityTypes).where(eq(activityTypes.userId, uid));
const exs = await db.select().from(exercises).where(eq(exercises.userId, uid));
const run = types.find((t) => t.category === 'run')!;
const lift = types.find((t) => t.category === 'strength')!;
const rand = mulberry32(2026);

for (let i = 0; i < DAYS; i++) {
  const day = addDays(startLocal, i);
  const noon = new Date(`${day}T15:00:00Z`);
  await evaluateUser(db, uid, noon);
  await db.transaction(async (tx) => {
    for (const h of created) if (rand() < h.p) await checkin(tx, uid, h.id, { status: 'done' }, day).catch(() => undefined);
    if (rand() < 0.65) {
      const subject = subjects[Math.floor(rand() * subjects.length)]!;
      await logStudySession(tx, uid, { subjectId: subject.id, minutes: 30 + Math.round(rand() * 60), activityType: 'reading', content: `Estudo de ${subject.name}`, unitsCompleted: rand() < 0.2 ? 1 : 0 }, day, { source: 'demo' });
    }
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if ([1, 3, 5].includes(weekday) && rand() < 0.85) {
      await recordActivity(
        tx,
        uid,
        {
          typeId: lift.id,
          title: 'Treino de força',
          date: day,
          durationMin: 50 + Math.round(rand() * 20),
          sets: exs.slice(0, 3).flatMap((e, k) => [1, 2, 3].map(() => ({ exerciseId: e.id, reps: 8, weightKg: 40 + k * 15 + Math.round(i / 6) * 2.5 }))),
          source: 'demo',
        },
        day,
      );
    }
    if ([2, 4, 6].includes(weekday) && rand() < 0.8) {
      const km = Math.round((5 + rand() * 4 + (weekday === 6 ? 6 + i / 10 : 0)) * 10) / 10;
      await recordActivity(tx, uid, { typeId: run.id, title: 'Corrida', date: day, durationMin: Math.round(km * 6), distanceKm: km, source: 'demo' }, day);
    }
    if (rand() < 0.5) {
      const m = await createMission(tx, uid, {
        title: ['Responder pendências', 'Revisar orçamento', 'Organizar arquivos', 'Avançar no projeto pessoal'][Math.floor(rand() * 4)]!,
        description: '',
        type: 'one_time',
        difficulty: rand() < 0.3 ? 'hard' : 'moderate',
        categoryId: null, goalId: null, seasonId: null, parentId: null,
        startDate: day, dueDate: addDays(day, 2), completionMode: 'manual',
        rewardXpOverride: null, rewardCoinsOverride: null, isSecret: false, evidenceRequired: false, priority: 0,
        attributeWeights: { EXE: 0.7, ORG: 0.3 }, objectives: [], penaltyRuleIds: [],
      }, { source: 'demo' });
      if (m && rand() < 0.8) await completeMission(tx, uid, m.id, day);
    }
    if (i % 14 === 13) {
      await logAssessment(tx, uid, { subjectId: subjects[0]!.id, title: `Simulado ${Math.ceil(i / 14)}`, date: day, score: 6 + Math.round(rand() * 4), maxScore: 10 }, day);
    }
    if (rand() < 0.3) await quickLog(tx, uid, { title: 'Lavar a louça' }, day);
    await afterAction(tx, uid, day);
  });
}
await evaluateUser(db, uid, new Date());
console.log(`Demonstração criada: ${DEMO_EMAIL} (senha: ${process.env.DEMO_PASSWORD ? '[DEMO_PASSWORD]' : 'demonstracao-falkyria'}) — ${DAYS} dias de histórico.`);
await pool.end();
