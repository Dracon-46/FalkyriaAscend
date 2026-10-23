/** Identidade: cadastro, login, sessões e troca de senha. A camada HTTP só lida com o cookie. */
import type { ChangePasswordInput, LoginInput, RegisterInput } from '@rpg/contracts';
import { localDateOf } from '@rpg/engine';
import {
  countRealUsers,
  deleteOtherSessions,
  deleteSession,
  findActiveSession,
  findUser,
  findUserByEmail,
  insertSession,
  insertUser,
  lockUserRegistration,
  touchSession,
  updateUser,
} from '../../persistence/repositories/users';
import { inTransaction, type Db, type DbOrTx } from '../../persistence/unit-of-work';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../shared/crypto';
import { conflict, forbidden, unauthorized } from '../../shared/errors';
import { audit } from '../audit';
import { seedUserDefaults } from '../defaults';

export interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  displayName: string;
  sessionId: string;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

const DAY_MS = 86_400_000;
// Hash fixo para igualar o tempo de resposta quando o e-mail não existe.
let dummyHash: Promise<string> | null = null;

/** Contas de demonstração não contam: o primeiro usuário real sempre vira administrador. */
export async function registrationStatus(db: DbOrTx, allowRegistration: boolean) {
  const n = await countRealUsers(db);
  return { hasUsers: n > 0, registrationOpen: n === 0 || allowRegistration };
}

/** Cria a conta com o conteúdo inicial editável. O primeiro cadastro real vira administrador. */
export async function registerUser(db: Db, input: RegisterInput, opts: { allowRegistration: boolean; timezone: string; now: Date }) {
  return inTransaction(db, async (tx) => {
    await lockUserRegistration(tx);
    const first = (await countRealUsers(tx)) === 0;
    if (!first && !opts.allowRegistration) throw forbidden('Novos cadastros estão desativados nesta instalação.');
    if (await findUserByEmail(tx, input.email)) throw conflict('E-mail já cadastrado.');
    const u = await insertUser(tx, {
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName,
      role: first ? 'admin' : 'user',
      // A avaliação diária começa no dia do cadastro: a data vem do relógio da aplicação, não do banco.
      createdAt: opts.now,
      updatedAt: opts.now,
    });
    await seedUserDefaults(tx, u.id, localDateOf(opts.now, opts.timezone));
    await audit(tx, { actorId: u.id, userId: u.id, action: 'user.register', entityType: 'users', entityId: u.id, meta: { role: u.role } });
    return u;
  });
}

/** Valida as credenciais em tempo constante (mesmo custo quando o e-mail não existe). */
export async function authenticate(db: Db, input: LoginInput) {
  const u = await findUserByEmail(db, input.email);
  dummyHash ??= hashPassword('senha-inexistente-para-tempo-constante');
  const ok = await verifyPassword(input.password, u?.passwordHash ?? (await dummyHash));
  if (!u || !ok) throw unauthorized('E-mail ou senha inválidos.');
  if (u.disabledAt) throw forbidden('Conta desativada.');
  await audit(db, { actorId: u.id, userId: u.id, action: 'user.login', entityType: 'users', entityId: u.id });
  return u;
}

/** Emite uma sessão: o banco guarda apenas o SHA-256 do token. */
export async function openSession(db: DbOrTx, userId: string, ttlDays: number, userAgent?: string): Promise<IssuedSession> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
  await insertSession(db, { id: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null });
  return { token, expiresAt };
}

/** Resolve o token do cookie. Renovação deslizante: atualiza no máximo uma vez por hora. */
export async function resolveSession(db: DbOrTx, token: string, ttlDays: number): Promise<SessionUser | null> {
  const sid = sha256(token);
  const row = await findActiveSession(db, sid, new Date());
  if (!row) return null;
  if (Date.now() - row.s.lastSeenAt.getTime() > 3_600_000) await touchSession(db, sid, new Date(Date.now() + ttlDays * DAY_MS));
  return { id: row.u.id, email: row.u.email, role: row.u.role, displayName: row.u.displayName, sessionId: sid };
}

export function closeSession(db: DbOrTx, sessionId: string) {
  return deleteSession(db, sessionId);
}

/** Troca a senha e encerra as demais sessões. */
export async function changePassword(db: Db, me: SessionUser, input: ChangePasswordInput): Promise<void> {
  const u = await findUser(db, me.id);
  if (!u || !(await verifyPassword(input.currentPassword, u.passwordHash))) throw unauthorized('Senha atual incorreta.');
  await updateUser(db, me.id, { passwordHash: await hashPassword(input.newPassword) });
  await deleteOtherSessions(db, me.id, me.sessionId);
  await audit(db, { actorId: me.id, userId: me.id, action: 'user.password_change', entityType: 'users', entityId: me.id });
}
