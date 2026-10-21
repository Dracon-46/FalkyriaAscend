import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_CONFIG as cfg,
  DEFAULT_RANKS,
  addDays,
  canTransitionMission,
  compositeProgress,
  computePenalty,
  computeStreak,
  dateRange,
  daysToAfford,
  evaluateAchievement,
  goalProgress,
  isMissTolerated,
  isScheduledOn,
  isoWeekKey,
  localDateOf,
  maskFromDays,
  nextRank,
  penaltySuppressionReason,
  purchaseBlockers,
  rankForLevel,
  startOfIsoWeek,
  streakMilestonesCrossed,
  totalsFromLedger,
  validateDifficulty,
  verifyLedger,
  weeklyShortfall,
  type PenaltyRule,
} from '../src';

describe('datas', () => {
  it('converte instantes para a data local do fuso', () => {
    const instant = new Date('2026-10-21T02:30:00Z');
    expect(localDateOf(instant, 'America/Sao_Paulo')).toBe('2026-10-20');
    expect(localDateOf(instant, 'UTC')).toBe('2026-10-21');
  });
  it('aritmética e semanas ISO', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(startOfIsoWeek('2026-10-25')).toBe('2026-10-19');
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
    expect(dateRange('2026-10-01', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });
});

describe('agenda de hábitos', () => {
  const base = { weekdaysMask: maskFromDays([1, 3, 5]), timesPerWeek: 3, startDate: '2026-10-01' };
  it('dias da semana programados', () => {
    const s = { ...base, frequency: 'weekdays' as const };
    expect(isScheduledOn(s, '2026-10-19')).toBe(true); // segunda
    expect(isScheduledOn(s, '2026-10-20')).toBe(false); // terça
    expect(isScheduledOn(s, '2026-09-28')).toBe(false); // antes do início
  });
  it('meta semanal reduzida proporcionalmente por dias dispensados', () => {
    const s = { ...base, frequency: 'times_per_week' as const };
    expect(weeklyShortfall(s, '2026-10-21', 1, 0)).toMatchObject({ target: 3, shortfall: 2 });
    expect(weeklyShortfall(s, '2026-10-21', 1, 7)).toMatchObject({ target: 0, shortfall: 0 });
  });
});

describe('sequências', () => {
  it('descanso e dispensa não quebram a sequência; falha quebra', () => {
    const s = computeStreak([
      { date: '2026-10-01', status: 'done' },
      { date: '2026-10-02', status: 'rest' },
      { date: '2026-10-03', status: 'done' },
      { date: '2026-10-04', status: 'excused' },
      { date: '2026-10-05', status: 'tolerated' },
      { date: '2026-10-06', status: 'done' },
      { date: '2026-10-07', status: 'missed' },
      { date: '2026-10-08', status: 'done' },
    ]);
    expect(s.current).toBe(1);
    expect(s.best).toBe(3);
    expect(s.totalDone).toBe(4);
    expect(s.interruptions).toEqual([{ date: '2026-10-07', lengthBefore: 3 }]);
  });
  it('tolerância por janela móvel', () => {
    const hist = [{ date: '2026-10-02', status: 'tolerated' as const }];
    expect(isMissTolerated('2026-10-05', hist, 1)).toBe(false);
    expect(isMissTolerated('2026-10-09', hist, 1)).toBe(true);
    expect(isMissTolerated('2026-10-05', hist, 2)).toBe(true);
    expect(isMissTolerated('2026-10-05', [], 0)).toBe(false);
  });
  it('marcos de sequência cruzados', () => {
    expect(streakMilestonesCrossed(6, 7, [7, 30])).toEqual([7]);
    expect(streakMilestonesCrossed(7, 8, [7, 30])).toEqual([]);
  });
});

describe('penalidades', () => {
  const coinRule: PenaltyRule = { type: 'coin_loss', baseAmount: 5, escalationStep: 5, maxAmount: 20 };
  const ctx = { consecutiveMisses: 1, coinsLostToday: 0, coinsLostThisWeek: 0, balance: 1000, allowSkillXpLoss: false };

  it('escalonam por falhas consecutivas até o teto', () => {
    expect([1, 2, 3, 4, 10].map((n) => computePenalty(coinRule, { ...ctx, consecutiveMisses: n }, cfg).amount)).toEqual([
      5, 10, 15, 20, 20,
    ]);
  });
  it('respeitam limites diário, semanal e o saldo (nunca negativo)', () => {
    expect(computePenalty(coinRule, { ...ctx, consecutiveMisses: 4, coinsLostToday: 35 }, cfg).amount).toBe(5);
    expect(computePenalty(coinRule, { ...ctx, consecutiveMisses: 4, coinsLostThisWeek: 145 }, cfg).amount).toBe(5);
    const broke = computePenalty(coinRule, { ...ctx, consecutiveMisses: 4, balance: 3 }, cfg);
    expect(broke.amount).toBe(3);
    expect(broke.limited).toBe(true);
    expect(computePenalty(coinRule, { ...ctx, balance: 0 }, cfg).recordOnly).toBe(true);
  });
  it('perda de XP de habilidade é opcional e limitada', () => {
    const rule: PenaltyRule = { type: 'skill_xp_loss', baseAmount: 100, escalationStep: 0, maxAmount: 100 };
    expect(computePenalty(rule, ctx, cfg).amount).toBe(0);
    expect(computePenalty(rule, { ...ctx, allowSkillXpLoss: true }, cfg).amount).toBe(cfg.penalties.skillXpLossCap);
  });
  it('tipos de registro não têm efeito material', () => {
    expect(computePenalty({ ...coinRule, type: 'failure_record' }, ctx, cfg)).toMatchObject({ amount: 0, recordOnly: true });
  });
  it('redução de multiplicador e bloqueio têm duração limitada', () => {
    const m = computePenalty({ type: 'multiplier_reduction', baseAmount: 3, escalationStep: 0, maxAmount: 3, reductionPct: 0.9, durationDays: 99 }, ctx, cfg);
    expect(m.reductionPct).toBe(0.5);
    expect(m.durationDays).toBe(30);
    const l = computePenalty({ type: 'reward_lock', baseAmount: 2, escalationStep: 2, maxAmount: 7 }, { ...ctx, consecutiveMisses: 3 }, cfg);
    expect(l.durationDays).toBe(6);
  });
  it('suspensões válidas impedem penalidade', () => {
    expect(penaltySuppressionReason({})).toBeNull();
    expect(penaltySuppressionReason({ isBasicNeed: true })).toMatch(/Necessidade básica/);
    expect(penaltySuppressionReason({ unavailable: true })).toMatch(/Indisponibilidade/);
    expect(penaltySuppressionReason({ isRestDay: true })).toMatch(/descanso/);
    expect(penaltySuppressionReason({ recoveryMode: true })).toMatch(/recuperação/);
    expect(penaltySuppressionReason({ rescheduledBeforeDeadline: true })).toMatch(/Reagendada/);
  });
});

describe('dificuldade e estados de missão', () => {
  it('limita dificuldade por tipo e exige escopo para Épica/Lendária', () => {
    expect(validateDifficulty({ type: 'daily', difficulty: 'legendary', objectiveCount: 0 }, cfg).length).toBeGreaterThan(0);
    expect(
      validateDifficulty(
        { type: 'project', difficulty: 'legendary', startDate: '2026-10-01', dueDate: '2026-12-01', objectiveCount: 4 },
        cfg,
      ),
    ).toEqual([]);
    expect(
      validateDifficulty({ type: 'project', difficulty: 'legendary', startDate: '2026-10-01', dueDate: '2026-10-05', objectiveCount: 4 }, cfg),
    ).toHaveLength(1);
  });
  it('transições: cancelada/suspensa não viram falha; terminais são finais', () => {
    expect(canTransitionMission('in_progress', 'suspended')).toBe(true);
    expect(canTransitionMission('suspended', 'failed')).toBe(false);
    expect(canTransitionMission('completed', 'in_progress')).toBe(false);
    expect(canTransitionMission('cancelled', 'failed')).toBe(false);
  });
});

describe('progresso composto e metas', () => {
  it('missão composta só conclui com todos os objetivos obrigatórios', () => {
    const p = compositeProgress([
      { target: 5, current: 5 },
      { target: 3, current: 1 },
      { target: 1, current: 0, optional: true },
    ]);
    expect(p.complete).toBe(false);
    expect(p.progress).toBeCloseTo((1 + 1 / 3) / 2);
    expect(compositeProgress([{ target: 2, current: 3 }, { target: 1, current: 1 }]).complete).toBe(true);
    expect(compositeProgress([]).complete).toBe(false);
  });
  it('metas por etapas ponderadas, missões e métrica', () => {
    expect(goalProgress({ mode: 'milestones', milestones: [{ weight: 3, done: true }, { weight: 1, done: false }] })).toBe(0.75);
    expect(goalProgress({ mode: 'missions', missions: [{ status: 'completed' }, { status: 'cancelled' }, { status: 'failed' }] })).toBe(0.5);
    expect(goalProgress({ mode: 'metric', metric: { start: 80, current: 75, target: 70 } })).toBe(0.5);
  });
});

describe('conquistas', () => {
  it('avalia todas as condições e calcula progresso', () => {
    const crit = { all: [{ metric: 'study_sessions' as const, gte: 100 }, { metric: 'character_level' as const, gte: 10 }] };
    const r = evaluateAchievement(crit, { study_sessions: 50, character_level: 12 });
    expect(r.unlocked).toBe(false);
    expect(r.progress).toBeCloseTo(0.75);
    expect(evaluateAchievement(crit, { study_sessions: 100, character_level: 10 }).unlocked).toBe(true);
  });
});

describe('economia', () => {
  it('verifica a cadeia de saldos do livro-razão', () => {
    const ok = [
      { amount: 50, kind: 'earn' as const, balanceAfter: 50 },
      { amount: -30, kind: 'spend' as const, balanceAfter: 20 },
      { amount: 30, kind: 'reversal' as const, balanceAfter: 50 },
      { amount: -10, kind: 'penalty' as const, balanceAfter: 40 },
    ];
    expect(verifyLedger(ok)).toEqual([]);
    expect(totalsFromLedger(ok)).toEqual({ balance: 40, totalEarned: 50, totalSpent: 30, totalPenalties: 10 });
    expect(verifyLedger([{ amount: 10, kind: 'earn', balanceAfter: 11 }])).toHaveLength(1);
    expect(verifyLedger([{ amount: -10, kind: 'spend', balanceAfter: -10 }])).toHaveLength(1);
  });
  it('bloqueios de compra', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    const base = { price: 100, quantity: 1, balance: 500, active: true, now, characterLevel: 5, alreadyPurchased: 0 };
    expect(purchaseBlockers(base)).toEqual([]);
    expect(purchaseBlockers({ ...base, balance: 99 })).toContain('Saldo insuficiente');
    expect(purchaseBlockers({ ...base, minLevel: 10 })).toContain('Requer nível 10');
    expect(purchaseBlockers({ ...base, purchaseLimit: 1, alreadyPurchased: 1 })[0]).toMatch(/Limite/);
    expect(purchaseBlockers({ ...base, lockedUntil: new Date('2026-10-25T00:00:00Z') })[0]).toMatch(/bloqueada/);
    expect(purchaseBlockers({ ...base, quantity: 0 })).toContain('Quantidade inválida');
    expect(purchaseBlockers({ ...base, cooldownDays: 7, lastPurchaseAt: new Date('2026-10-20T00:00:00Z') })[0]).toMatch(/novamente/);
  });
  it('estimativa de dias para comprar', () => {
    expect(daysToAfford(100, 40, 20)).toBe(3);
    expect(daysToAfford(100, 140, 0)).toBe(0);
    expect(daysToAfford(100, 40, 0)).toBeNull();
  });
});

describe('ranks', () => {
  it('rank por nível e próximo rank', () => {
    expect(rankForLevel(1, DEFAULT_RANKS)?.code).toBe('G');
    expect(rankForLevel(29, DEFAULT_RANKS)?.code).toBe('D');
    expect(rankForLevel(100, DEFAULT_RANKS)?.code).toBe('SS');
    expect(nextRank(29, DEFAULT_RANKS)?.code).toBe('C');
    expect(nextRank(150, DEFAULT_RANKS)).toBeNull();
  });
});
