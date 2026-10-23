/**
 * Administração: CRUD genérico auditado sobre todos os recursos, ações sobre o livro-razão
 * (ajuste, estorno, revogação), integridade das projeções e gestão de usuários.
 */
import { z } from 'zod';
import { attributeWeights as weightsSchema, type AdjustmentInput, type RegisterInput } from '@rpg/contracts';
import { achievementCriteriaSchema, isLocalDate, localDateOf, validateDifficulty } from '@rpg/engine';
import {
  deleteResourceRow,
  findResourceMeta,
  findResourceRow,
  insertResourceRow,
  listResourceRows,
  resourceCatalog,
  updateResourceRow,
  type FieldMeta,
  type ResourceMeta,
} from '../../persistence/repositories/admin-resources';
import { deleteUnlock, findUnlock } from '../../persistence/repositories/achievements';
import { findGrant } from '../../persistence/repositories/ledger';
import { findCoinTx, findReversalOf } from '../../persistence/repositories/wallets';
import { findUser, findUserByEmail, insertUser, listUsersSummary, updateUser } from '../../persistence/repositories/users';
import { inTransaction, type Db } from '../../persistence/unit-of-work';
import { hashPassword } from '../../shared/crypto';
import { badRequest, conflict, forbidden, notFound, pgCode, PG, unprocessable } from '../../shared/errors';
import { audit } from '../audit';
import { getActiveConfig } from '../config';
import { seedUserDefaults } from '../defaults';
import { evaluateUser } from '../evaluation';
import { checkIntegrity, rebuildProjections } from '../integrity';
import { grantReward, reverseGrant } from '../rewards';
import { todayFor } from '../time';
import { validateWeights } from '../validation';
import { postCoinTx } from '../wallet';

export interface AdminActor {
  id: string;
  displayName: string;
}

export interface ResourceListParams {
  userId?: string;
  limit: number;
  offset: number;
  q?: string;
  sort?: string;
  dir: 'asc' | 'desc';
  includeArchived: boolean;
}

// ------------------------------------------------------------------ Apoio

/** Usuário-alvo: por padrão o próprio administrador; `userId` permite gerenciar outra conta. */
async function targetUser(db: Db, adminId: string, userId?: string): Promise<string> {
  if (!userId || userId === adminId) return adminId;
  if (!(await findUser(db, userId))) throw notFound('Usuário');
  return userId;
}

function resolve(key: string): ResourceMeta {
  const meta = findResourceMeta(key);
  if (!meta) throw notFound('Recurso');
  return meta;
}

function writeGuard(meta: ResourceMeta) {
  if (meta.mode !== 'crud' || meta.composite) throw forbidden(`${meta.label}: somente leitura. ${meta.note ?? ''}`.trim());
}

function stripHidden(meta: ResourceMeta, row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !meta.hidden.includes(k)));
}

/** Traduz violações de integridade do banco em erros de aplicação. */
function translateDbError(err: unknown, meta: ResourceMeta): never {
  const code = pgCode(err);
  if (code === PG.foreignKeyViolation)
    throw conflict(`${meta.label}: há registros vinculados (ou a referência informada não existe). Arquive em vez de excluir.`);
  if (code === PG.uniqueViolation) throw conflict(`${meta.label}: valor duplicado em campo único.`);
  if (code === PG.checkViolation) throw unprocessable(`${meta.label}: valor viola uma regra de integridade.`);
  throw err;
}

/** Converte o valor recebido do formulário para o tipo da coluna, com validação. */
function coerceField(f: FieldMeta, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || value === '') {
    if (f.required) throw badRequest(`${f.label}: obrigatório`);
    return null;
  }
  switch (f.type) {
    case 'uuid':
    case 'ref': {
      const r = z.uuid().safeParse(value);
      if (!r.success) throw badRequest(`${f.label}: identificador inválido`);
      return r.data;
    }
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n)) throw badRequest(`${f.label}: número inteiro esperado`);
      return n;
    }
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw badRequest(`${f.label}: número esperado`);
      return n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'false') return value === 'true';
      throw badRequest(`${f.label}: verdadeiro/falso esperado`);
    case 'date':
      if (typeof value !== 'string' || !isLocalDate(value)) throw badRequest(`${f.label}: data AAAA-MM-DD esperada`);
      return value;
    case 'datetime': {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) throw badRequest(`${f.label}: data/hora inválida`);
      return d;
    }
    case 'enum':
      if (!f.enumValues!.includes(String(value))) throw badRequest(`${f.label}: valor deve ser um de ${f.enumValues!.join(', ')}`);
      return String(value);
    case 'json':
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          throw badRequest(`${f.label}: JSON inválido`);
        }
      }
      return value;
    default:
      if (typeof value !== 'string') throw badRequest(`${f.label}: texto esperado`);
      if (value.length > 20_000) throw badRequest(`${f.label}: texto muito longo`);
      return value;
  }
}

function buildValues(meta: ResourceMeta, body: unknown, creating: boolean): Record<string, unknown> {
  if (typeof body !== 'object' || !body) throw badRequest('Corpo inválido');
  const values: Record<string, unknown> = {};
  for (const f of meta.fields) {
    if (f.readonly) continue;
    const v = coerceField(f, (body as Record<string, unknown>)[f.key]);
    if (v !== undefined) values[f.key] = v;
    else if (creating && f.required) throw badRequest(`${f.label}: obrigatório`);
  }
  return values;
}

function parseOrBadRequest<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw badRequest(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}

/** Regras de domínio que valem também para a edição administrativa direta. */
async function validateSpecific(db: Db, meta: ResourceMeta, userId: string, values: Record<string, unknown>, existing: Record<string, unknown> | null) {
  const merged = { ...(existing ?? {}), ...values };
  if ('attributeWeights' in values && values.attributeWeights != null) {
    values.attributeWeights = await validateWeights(db, userId, parseOrBadRequest(weightsSchema, values.attributeWeights));
  }
  if (meta.key === 'achievements' && 'criteria' in values) values.criteria = parseOrBadRequest(achievementCriteriaSchema, values.criteria);
  if (meta.key === 'missions') {
    const { config } = await getActiveConfig(db, userId);
    const errors = validateDifficulty(
      {
        type: merged.type as never,
        difficulty: merged.difficulty as never,
        startDate: merged.startDate as string | null,
        dueDate: merged.dueDate as string | null,
        objectiveCount: 99,
      },
      config,
    ).filter((e) => !e.includes('objetivos'));
    if (errors.length) throw unprocessable(errors.join(' '));
  }
  if (meta.key === 'users' && 'role' in values && existing && existing.id === userId && values.role !== 'admin') {
    throw conflict('Você não pode remover seu próprio papel de administrador.');
  }
}

// ------------------------------------------------------------------ CRUD genérico

export function adminCatalog() {
  return resourceCatalog().map((r) => ({
    key: r.key,
    label: r.label,
    group: r.group,
    mode: r.composite ? 'readonly' : r.mode,
    display: r.display,
    note: r.note,
    archivable: r.archivable,
    fields: r.fields,
  }));
}

export async function listResource(db: Db, admin: AdminActor, key: string, p: ResourceListParams) {
  const meta = resolve(key);
  const userId = await targetUser(db, admin.id, p.userId);
  const sortField = meta.fields.find((f) => f.key === p.sort) ?? meta.fields.find((f) => f.key === 'createdAt') ?? meta.fields[0]!;
  const { total, rows } = await listResourceRows(db, meta, {
    userId,
    includeArchived: p.includeArchived,
    search: p.q,
    searchFields: meta.fields.filter((f) => ['text', 'longtext', 'enum'].includes(f.type)).map((f) => f.key),
    sortField: sortField.key,
    direction: p.dir,
    limit: p.limit,
    offset: p.offset,
  });
  return { total, rows: rows.map((r) => stripHidden(meta, r)) };
}

export async function getResourceRow(db: Db, admin: AdminActor, key: string, id: string, targetUserId?: string) {
  const meta = resolve(key);
  if (meta.composite) throw badRequest('Recurso de chave composta: consulte pela listagem.');
  const row = await findResourceRow(db, meta, await targetUser(db, admin.id, targetUserId), id);
  if (!row) throw notFound(meta.label);
  return stripHidden(meta, row);
}

export async function createResourceRow(db: Db, admin: AdminActor, key: string, body: unknown, targetUserId?: string) {
  const meta = resolve(key);
  writeGuard(meta);
  if (meta.key === 'users') throw badRequest('Use "Novo usuário" (POST /api/admin/users) para definir a senha.');
  const userId = await targetUser(db, admin.id, targetUserId);
  const values = buildValues(meta, body, true);
  await validateSpecific(db, meta, userId, values, null);
  try {
    return await inTransaction(db, async (tx) => {
      const created = await insertResourceRow(tx, meta, { ...values, userId });
      await audit(tx, { actorId: admin.id, userId, action: 'admin.create', entityType: meta.key, entityId: created.id as string, after: created });
      return created;
    });
  } catch (err) {
    return translateDbError(err, meta);
  }
}

export async function updateResourceRowAsAdmin(db: Db, admin: AdminActor, key: string, id: string, body: unknown, targetUserId?: string) {
  const meta = resolve(key);
  writeGuard(meta);
  const userId = await targetUser(db, admin.id, targetUserId);
  const values = buildValues(meta, body, false);
  try {
    return await inTransaction(db, async (tx) => {
      const existing = await findResourceRow(tx, meta, userId, id, { lock: true });
      if (!existing) throw notFound(meta.label);
      await validateSpecific(db, meta, admin.id, values, existing);
      const updated = await updateResourceRow(tx, meta, id, values);
      await audit(tx, {
        actorId: admin.id,
        userId: meta.global ? id : userId,
        action: 'admin.update',
        entityType: meta.key,
        entityId: id,
        before: existing,
        after: updated,
      });
      return stripHidden(meta, updated);
    });
  } catch (err) {
    return translateDbError(err, meta);
  }
}

export async function deleteResourceRowAsAdmin(db: Db, admin: AdminActor, key: string, id: string, targetUserId?: string): Promise<void> {
  const meta = resolve(key);
  writeGuard(meta);
  if (meta.key === 'users') throw badRequest('Use a exclusão de conta (com confirmação) para remover usuários.');
  const userId = await targetUser(db, admin.id, targetUserId);
  try {
    await inTransaction(db, async (tx) => {
      const existing = await findResourceRow(tx, meta, userId, id);
      if (!existing) throw notFound(meta.label);
      await deleteResourceRow(tx, meta, id);
      await audit(tx, { actorId: admin.id, userId, action: 'admin.delete', entityType: meta.key, entityId: id, before: existing });
    });
  } catch (err) {
    translateDbError(err, meta);
  }
}

// ------------------------------------------------------------------ Ações auditadas sobre o livro-razão

/** Ajuste manual de XP, moedas, atributos e habilidades — sempre como novo lançamento. */
export async function adjustProgress(db: Db, admin: AdminActor, input: AdjustmentInput & { userId?: string }, now: Date) {
  const userId = await targetUser(db, admin.id, input.userId);
  const today = await todayFor(db, userId, now);
  if (!input.xp && !input.coins && !Object.keys(input.attributeXp).length && !Object.keys(input.skillXp).length) throw badRequest('Nada a ajustar.');
  return inTransaction(db, async (tx) => {
    const r = await grantReward(tx, {
      userId,
      idempotencyKey: `adjustment:${crypto.randomUUID()}`,
      sourceType: 'adjustment',
      xpSource: 'adjustment',
      title: `Ajuste administrativo: ${input.reason}`,
      localDate: today,
      reward: { xp: input.xp, coins: input.coins, attributeXp: input.attributeXp, explanation: [`Ajuste por ${admin.displayName}`, `Motivo: ${input.reason}`] },
      skillXp: input.skillXp,
      actorId: admin.id,
      coinKind: 'adjustment',
      allowNegative: true,
    });
    await audit(tx, { actorId: admin.id, userId, action: 'admin.adjust', entityType: 'reward_grants', entityId: r.grantId, after: input });
    return r;
  });
}

export async function reverseGrantAsAdmin(db: Db, admin: AdminActor, grantId: string, input: { reason: string; userId?: string }) {
  const userId = await targetUser(db, admin.id, input.userId);
  return inTransaction(db, async (tx) => {
    const r = await reverseGrant(tx, userId, grantId, input.reason, admin.id);
    await audit(tx, {
      actorId: admin.id,
      userId,
      action: 'admin.grant_reverse',
      entityType: 'reward_grants',
      entityId: grantId,
      meta: { reason: input.reason },
    });
    return r;
  });
}

/** Estorno de transação de moedas avulsa (ajustes). Transações de recompensas/compras usam suas próprias ações. */
export async function reverseCoinTransaction(db: Db, admin: AdminActor, txId: string, input: { reason: string; userId?: string }, now: Date) {
  const userId = await targetUser(db, admin.id, input.userId);
  return inTransaction(db, async (tx) => {
    const row = await findCoinTx(tx, userId, txId);
    if (!row) throw notFound('Transação');
    if (row.kind === 'reversal') throw conflict('Estornos não podem ser estornados.');
    if (row.grantId) throw conflict('Esta transação pertence a uma recompensa: estorne a recompensa.');
    if (row.purchaseId) throw conflict('Esta transação pertence a uma compra: use o reembolso.');
    if (row.penaltyId) throw conflict('Esta transação pertence a uma penalidade: reverta a penalidade.');
    if (await findReversalOf(tx, txId)) throw conflict('Transação já estornada.');
    const rev = await postCoinTx(tx, {
      userId,
      amount: -row.amount,
      kind: 'reversal',
      category: row.category,
      reason: `Estorno: ${row.reason} — ${input.reason}`,
      localDate: await todayFor(tx, userId, now),
      reversalOf: txId,
      actorId: admin.id,
    });
    await audit(tx, {
      actorId: admin.id,
      userId,
      action: 'admin.coin_reverse',
      entityType: 'coin_transactions',
      entityId: txId,
      after: rev,
      meta: { reason: input.reason },
    });
    return rev;
  });
}

/** Revoga uma conquista desbloqueada e estorna sua recompensa. */
export async function revokeAchievement(db: Db, admin: AdminActor, unlockId: string, input: { reason: string; userId?: string }) {
  const userId = await targetUser(db, admin.id, input.userId);
  return inTransaction(db, async (tx) => {
    const ua = await findUnlock(tx, userId, unlockId);
    if (!ua) throw notFound('Conquista desbloqueada');
    if (ua.grantId) {
      const g = await findGrant(tx, ua.grantId);
      if (g && !g.reversedAt) await reverseGrant(tx, userId, ua.grantId, `Conquista revogada: ${input.reason}`, admin.id);
    }
    await deleteUnlock(tx, unlockId);
    await audit(tx, {
      actorId: admin.id,
      userId,
      action: 'admin.achievement_revoke',
      entityType: 'user_achievements',
      entityId: unlockId,
      before: ua,
      meta: { reason: input.reason },
    });
    return { revoked: true };
  });
}

// ------------------------------------------------------------------ Integridade e avaliação

export async function integrityReport(db: Db, admin: AdminActor, targetUserId?: string) {
  const issues = await checkIntegrity(db, await targetUser(db, admin.id, targetUserId));
  return { ok: issues.length === 0, issues };
}

export async function rebuildUserProjections(db: Db, admin: AdminActor, targetUserId?: string) {
  const userId = await targetUser(db, admin.id, targetUserId);
  const issues = await inTransaction(db, async (tx) => {
    const before = await checkIntegrity(tx, userId);
    const after = await rebuildProjections(tx, userId);
    await audit(tx, { actorId: admin.id, userId, action: 'admin.rebuild_projections', entityType: 'projections', meta: { before, after } });
    return after;
  });
  return { ok: issues.length === 0, issues };
}

export async function evaluateNow(db: Db, admin: AdminActor, now: Date, targetUserId?: string) {
  return evaluateUser(db, await targetUser(db, admin.id, targetUserId), now);
}

// ------------------------------------------------------------------ Usuários

export function listAllUsers(db: Db) {
  return listUsersSummary(db);
}

/** Cria uma conta (com o conteúdo inicial editável) definida pelo administrador. */
export async function createUserAsAdmin(db: Db, admin: AdminActor, input: RegisterInput & { role: 'admin' | 'user'; timezone: string }, now: Date) {
  const u = await inTransaction(db, async (tx) => {
    if (await findUserByEmail(tx, input.email)) throw conflict('E-mail já cadastrado.');
    const created = await insertUser(tx, {
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName,
      role: input.role,
      // A avaliação diária começa no dia do cadastro: a data vem do relógio da aplicação, não do banco.
      createdAt: now,
      updatedAt: now,
    });
    await seedUserDefaults(tx, created.id, localDateOf(now, input.timezone));
    await audit(tx, {
      actorId: admin.id,
      userId: created.id,
      action: 'admin.user_create',
      entityType: 'users',
      entityId: created.id,
      meta: { role: input.role },
    });
    return created;
  });
  return { id: u.id, email: u.email, displayName: u.displayName, role: u.role };
}

export async function resetPassword(db: Db, admin: AdminActor, userId: string, password: string): Promise<void> {
  if (!(await updateUser(db, userId, { passwordHash: await hashPassword(password) }))) throw notFound('Usuário');
  await audit(db, { actorId: admin.id, userId, action: 'admin.password_reset', entityType: 'users', entityId: userId });
}
