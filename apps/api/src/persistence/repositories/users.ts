/** Usuários (identidade), sessões e confirmação de e-mail. */
import { and, asc, count, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { emailVerificationTokens, sessions, users } from '../schema';

export type NewUser = typeof users.$inferInsert;
export type UserPatch = Partial<Omit<NewUser, 'id'>>;

// ------------------------------------------------------------------ Usuários

export async function findUser(db: DbOrTx, id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ?? null;
}

export async function findUserByEmail(db: DbOrTx, email: string) {
  const [u] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`);
  return u ?? null;
}

/** Contas reais (não demonstração). */
export async function countRealUsers(db: DbOrTx): Promise<number> {
  const [r] = await db.select({ n: count() }).from(users).where(eq(users.isDemo, false));
  return r?.n ?? 0;
}

/** Serializa o cadastro do primeiro usuário (que se torna administrador). */
export async function lockUserRegistration(tx: DbOrTx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(4242)`);
}

export async function insertUser(tx: DbOrTx, values: NewUser) {
  const [u] = await tx.insert(users).values(values).returning();
  return u!;
}

export async function updateUser(db: DbOrTx, id: string, patch: UserPatch) {
  const [u] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return u ?? null;
}

export function listUsersSummary(db: DbOrTx) {
  return db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      isDemo: users.isDemo,
      disabledAt: users.disabledAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
}

export async function findDemoUser(db: DbOrTx, email: string) {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.isDemo, true), sql`lower(${users.email}) = lower(${email})`));
  return u ?? null;
}

/**
 * Remove o usuário e todos os seus dados. Entre entidades, as chaves usam NO ACTION (verificação ao fim
 * do comando): exclusões isoladas de registros com histórico falham, mas a exclusão explícita da
 * conta remove tudo em cascata a partir de `users` num único comando.
 */
export async function deleteUserCascade(tx: DbOrTx, userId: string): Promise<void> {
  await tx.delete(sessions).where(eq(sessions.userId, userId));
  await tx.delete(users).where(eq(users.id, userId));
}

// ------------------------------------------------------------------ Sessões

export async function insertSession(db: DbOrTx, values: typeof sessions.$inferInsert): Promise<void> {
  await db.insert(sessions).values(values);
}

/** Sessão válida (não expirada) de um usuário ativo. */
export async function findActiveSession(db: DbOrTx, sessionId: string, now: Date) {
  const [row] = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now), isNull(users.disabledAt)));
  return row ?? null;
}

export async function touchSession(db: DbOrTx, sessionId: string, expiresAt: Date): Promise<void> {
  await db.update(sessions).set({ lastSeenAt: new Date(), expiresAt }).where(eq(sessions.id, sessionId));
}

export async function deleteSession(db: DbOrTx, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteOtherSessions(db: DbOrTx, userId: string, keepSessionId: string): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

export async function listUserIds(db: DbOrTx): Promise<string[]> {
  return (await db.select({ id: users.id }).from(users)).map((u) => u.id);
}

// ------------------------------------------------------------------ Confirmação de e-mail

/** Troca os tokens pendentes da pessoa por um novo (só o mais recente vale). */
export async function replaceEmailVerificationToken(tx: DbOrTx, values: { id: string; userId: string; expiresAt: Date; createdAt: Date }) {
  await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, values.userId));
  await tx.insert(emailVerificationTokens).values(values);
}

export async function findEmailVerificationToken(db: DbOrTx, id: string) {
  const [t] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.id, id));
  return t ?? null;
}

export async function latestEmailVerificationToken(db: DbOrTx, userId: string) {
  const [t] = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId))
    .orderBy(desc(emailVerificationTokens.createdAt))
    .limit(1);
  return t ?? null;
}

export async function deleteEmailVerificationTokens(tx: DbOrTx, userId: string) {
  await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
}
