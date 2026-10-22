import type { MissionInput } from '@rpg/contracts';
import { addDays } from '@rpg/engine';
import { goalsWithoutOpenMissions, habitAdherenceSince, neglectedCategories, studyMinutesSince } from '../persistence/queries/suggestions';
import type { DbOrTx } from '../persistence/unit-of-work';

export interface MissionSuggestion {
  reason: string;
  mission: MissionInput;
}

/**
 * Sugestões determinísticas e revisáveis (nunca criadas automaticamente e sem penalidades):
 * áreas negligenciadas, metas sem missões ativas, hábitos com baixa adesão e estudo abaixo do ritmo recente.
 */
export async function suggestMissions(db: DbOrTx, userId: string, today: string): Promise<MissionSuggestion[]> {
  const since = addDays(today, -14);
  const suggestions: MissionSuggestion[] = [];
  const base = (over: Partial<MissionInput>): MissionInput => ({
    title: '',
    description: '',
    type: 'one_time',
    difficulty: 'moderate',
    categoryId: null,
    goalId: null,
    seasonId: null,
    parentId: null,
    startDate: today,
    dueDate: addDays(today, 7),
    completionMode: 'manual',
    rewardXpOverride: null,
    rewardCoinsOverride: null,
    isSecret: false,
    evidenceRequired: false,
    priority: 0,
    attributeWeights: {},
    objectives: [],
    penaltyRuleIds: [],
    ...over,
  });

  for (const c of (await neglectedCategories(db, userId, since)).slice(0, 2)) {
    suggestions.push({
      reason: `Nenhuma atividade em "${c.name}" nos últimos 14 dias.`,
      mission: base({ title: `Retomar ${c.name.toLowerCase()}`, description: `Dedique uma sessão a ${c.name.toLowerCase()} nesta semana.`, categoryId: c.id, difficulty: 'easy' }),
    });
  }

  for (const g of (await goalsWithoutOpenMissions(db, userId)).slice(0, 2)) {
    suggestions.push({
      reason: `A meta "${g.title}" não tem missões ativas.`,
      mission: base({ title: `Avançar em: ${g.title}`, goalId: g.id, categoryId: g.categoryId, attributeWeights: { EXE: 1 } }),
    });
  }

  const lowAdherence = (await habitAdherenceSince(db, userId, since)).filter((h) => h.evaluated >= 4 && h.done / h.evaluated < 0.5);
  for (const h of lowAdherence.slice(0, 2)) {
    suggestions.push({
      reason: `"${h.title}" foi cumprido em ${Math.round((h.done / h.evaluated) * 100)}% das vezes nas últimas 2 semanas. Sugestão leve, sem penalidade.`,
      mission: base({
        title: `Reconstruir: ${h.title}`,
        type: 'weekly',
        difficulty: 'easy',
        completionMode: 'auto',
        attributeWeights: { DIS: 1 },
        objectives: [{ id: null, title: `Cumprir "${h.title}" 3 vezes`, metric: 'habit_checkins', metricRefId: h.id, target: 3, unit: 'vezes', optional: false }],
      }),
    });
  }

  const minutes = await studyMinutesSince(db, userId, addDays(today, -7));
  if (minutes < 120) {
    suggestions.push({
      reason: `Apenas ${minutes} minutos de estudo nos últimos 7 dias.`,
      mission: base({
        title: 'Duas horas de estudo nesta semana',
        type: 'weekly',
        completionMode: 'auto',
        attributeWeights: { INT: 0.8, DIS: 0.2 },
        objectives: [{ id: null, title: 'Estudar 120 minutos', metric: 'study_minutes', metricRefId: null, target: 120, unit: 'min', optional: false }],
      }),
    });
  }
  return suggestions;
}
