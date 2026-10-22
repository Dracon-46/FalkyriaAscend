/** Configuração da progressão: consulta, pré-visualização (sem gravar) e publicação de novas versões. */
import { curveTable, DEFAULT_GAME_CONFIG, DEFAULT_PROFILES, formatDuration, gameConfigSchema, levelFromXp, simulateProfile } from '@rpg/engine';
import { listConfigVersions } from '../../persistence/repositories/configs';
import {
  findCharacterProgress,
  listAttributes,
  listSkills,
  lockCharacterProgress,
  setAttributeLevel,
  setSkillLevel,
  updateCharacterProgress,
} from '../../persistence/repositories/progression';
import { inTransaction, type Db, type DbOrTx } from '../../persistence/unit-of-work';
import { badRequest } from '../../shared/errors';
import { audit } from '../audit';
import { getActiveConfig, publishConfig } from '../config';

const CURVE_MARKS = [2, 5, 10, 20, 30, 45, 60, 80, 100];
const SIMULATION_MARKS = [5, 10, 20, 30, 45, 60, 80, 100];

export async function configView(db: DbOrTx, userId: string) {
  const active = await getActiveConfig(db, userId);
  const versions = (await listConfigVersions(db, userId)).map((v) => ({ version: v.version, active: v.active, note: v.note, createdAt: v.createdAt }));
  return { active, defaults: DEFAULT_GAME_CONFIG, versions, curveTable: curveTable(active.config.curves.character, CURVE_MARKS) };
}

function parseCandidate(config: unknown, version: number) {
  const r = gameConfigSchema.safeParse({ ...(config as object), version });
  if (!r.success) throw badRequest('Configuração inválida', { issues: r.error.issues });
  return r.data;
}

/** Impacto de uma configuração candidata (nível atual e simulações), sem gravar nada. */
export async function previewConfig(db: DbOrTx, userId: string, candidate: unknown) {
  const cfg = parseCandidate(candidate, 1);
  const xp = (await findCharacterProgress(db, userId))?.lifetimeXp ?? 0;
  const current = await getActiveConfig(db, userId);
  return {
    currentLevel: levelFromXp(xp, current.config.curves.character).level,
    newLevel: levelFromXp(xp, cfg.curves.character).level,
    curveTable: curveTable(cfg.curves.character, CURVE_MARKS),
    simulations: DEFAULT_PROFILES.map((p) => {
      const s = simulateProfile(p, cfg, { days: 365 * 10, levelMarks: SIMULATION_MARKS });
      return {
        profile: p.label,
        xpPerDay: Math.round(s.avgXpPerDay),
        coinsPerDay: Math.round(s.avgCoinsPerDay * 10) / 10,
        reached: SIMULATION_MARKS.map((m) => ({ level: m, when: formatDuration(s.levelReachedDay[m] ?? null) })),
      };
    }),
  };
}

/**
 * Publica nova versão. Nunca recalcula recompensas antigas: os níveis são derivados do XP
 * vitalício com a curva vigente e o histórico de níveis alcançados permanece.
 */
export function publishProgressionConfig(db: Db, userId: string, input: { config: unknown; note: string }) {
  return inTransaction(db, async (tx) => {
    const before = await getActiveConfig(tx, userId);
    const after = await publishConfig(tx, userId, parseCandidate(input.config, before.version + 1), input.note);
    const cp = await lockCharacterProgress(tx, userId);
    await updateCharacterProgress(tx, userId, { level: levelFromXp(cp.lifetimeXp, after.config.curves.character).level });
    for (const a of await listAttributes(tx, userId)) await setAttributeLevel(tx, a.id, levelFromXp(a.xp, after.config.curves.attribute).level);
    for (const s of await listSkills(tx, userId)) await setSkillLevel(tx, s.id, levelFromXp(s.xp, after.config.curves.mastery).level);
    await audit(tx, {
      actorId: userId,
      userId,
      action: 'config.publish',
      entityType: 'game_configs',
      entityId: String(after.version),
      before: before.config,
      after: after.config,
      meta: { note: input.note },
    });
    return after;
  });
}
