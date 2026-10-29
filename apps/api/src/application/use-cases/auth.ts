/** Identidade: cadastro, confirmação de e-mail, login, sessões e troca de senha. A camada HTTP só lida com o cookie. */
import type { ChangePasswordInput, LoginInput, RegisterInput } from '@rpg/contracts';
import type { Mailer } from '../../integrations/mailer';
import { localDateOf } from '@rpg/engine';
import {
  countRealUsers,
  deleteEmailVerificationTokens,
  deleteOtherSessions,
  deleteSession,
  findActiveSession,
  findEmailVerificationToken,
  findUser,
  findUserByEmail,
  insertSession,
  insertUser,
  latestEmailVerificationToken,
  lockUserRegistration,
  replaceEmailVerificationToken,
  touchSession,
  updateUser,
} from '../../persistence/repositories/users';
import { inTransaction, type Db, type DbOrTx } from '../../persistence/unit-of-work';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../shared/crypto';
import { AppError, badRequest, conflict, forbidden, unauthorized } from '../../shared/errors';
import { audit } from '../audit';
import { seedUserDefaults } from '../defaults';
import { verificationEmail } from '../emails';

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
const VERIFICATION_TTL_MS = DAY_MS;
/** Intervalo mínimo entre dois e-mails de confirmação para a mesma conta. */
const RESEND_INTERVAL_MS = 60_000;
// Hash fixo para igualar o tempo de resposta quando o e-mail não existe.
let dummyHash: Promise<string> | null = null;

/** Contas de demonstração não contam: o primeiro usuário real sempre vira administrador. */
export async function registrationStatus(db: DbOrTx, allowRegistration: boolean) {
  const n = await countRealUsers(db);
  return { hasUsers: n > 0, registrationOpen: n === 0 || allowRegistration };
}

/**
 * Cria a conta com o conteúdo inicial editável. O primeiro cadastro real vira administrador e já nasce
 * confirmado (é quem instala o sistema); os demais confirmam o e-mail quando a confirmação é exigida.
 */
export async function registerUser(
  db: Db,
  input: RegisterInput,
  opts: { allowRegistration: boolean; timezone: string; now: Date; verificationRequired: boolean },
) {
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
      emailVerifiedAt: first || !opts.verificationRequired ? opts.now : null,
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
export async function authenticate(db: Db, input: LoginInput, opts: { verificationRequired: boolean }) {
  const u = await findUserByEmail(db, input.email);
  dummyHash ??= hashPassword('senha-inexistente-para-tempo-constante');
  const ok = await verifyPassword(input.password, u?.passwordHash ?? (await dummyHash));
  if (!u || !ok) throw unauthorized('E-mail ou senha inválidos.');
  if (u.disabledAt) throw forbidden('Conta desativada.');
  // Só depois da senha correta, para não revelar se o e-mail existe.
  if (opts.verificationRequired && !u.emailVerifiedAt) {
    throw new AppError(403, 'email_not_verified', 'Confirme seu e-mail para entrar. Enviamos um link quando você criou a conta.');
  }
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

// ------------------------------------------------------------------ Confirmação de e-mail

export interface VerificationMail {
  mailer: Mailer;
  appOrigin: string;
  now: Date;
}

export function needsEmailVerification(user: { emailVerifiedAt: Date | null }, required: boolean): boolean {
  return required && !user.emailVerifiedAt;
}

/** Gera um link de uso único (válido por 24 h; só o mais recente vale) e envia por e-mail. O banco guarda só o SHA-256. */
export async function sendVerificationEmail(db: DbOrTx, user: { id: string; email: string; displayName: string }, mail: VerificationMail): Promise<void> {
  const token = randomToken();
  await replaceEmailVerificationToken(db, {
    id: sha256(token),
    userId: user.id,
    createdAt: mail.now,
    expiresAt: new Date(mail.now.getTime() + VERIFICATION_TTL_MS),
  });
  const link = `${mail.appOrigin.replace(/\/$/, '')}/verificar-email?token=${encodeURIComponent(token)}`;
  await mail.mailer.send(verificationEmail(user.email, user.displayName, link));
}

/** Confirma o e-mail pelo token do link. Tokens expirados, usados ou desconhecidos dão a mesma resposta. */
export async function verifyEmail(db: Db, token: string, now: Date) {
  const row = await findEmailVerificationToken(db, sha256(token));
  if (!row || row.expiresAt.getTime() <= now.getTime()) {
    throw new AppError(400, 'invalid_token', 'Link inválido ou expirado. Peça um novo na tela de entrada.');
  }
  const user = await inTransaction(db, async (tx) => {
    const u = await updateUser(tx, row.userId, { emailVerifiedAt: now });
    await deleteEmailVerificationTokens(tx, row.userId);
    if (u) await audit(tx, { actorId: u.id, userId: u.id, action: 'user.email_verified', entityType: 'users', entityId: u.id });
    return u;
  });
  if (!user) throw badRequest('Conta não encontrada.');
  if (user.disabledAt) throw forbidden('Conta desativada.');
  return user;
}

/**
 * Reenvia o link de confirmação. Não revela se o e-mail existe nem se já foi confirmado:
 * a resposta é a mesma em todos os casos, e há um intervalo mínimo entre envios.
 */
export async function resendVerification(db: Db, email: string, mail: VerificationMail, required: boolean): Promise<void> {
  if (!required) return;
  const u = await findUserByEmail(db, email);
  if (!u || u.emailVerifiedAt || u.disabledAt || u.isDemo) return;
  const last = await latestEmailVerificationToken(db, u.id);
  if (last && mail.now.getTime() - last.createdAt.getTime() < RESEND_INTERVAL_MS) return;
  await sendVerificationEmail(db, u, mail);
}
