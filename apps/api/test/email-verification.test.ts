import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createMemoryMailer } from '../src/integrations/mailer';
import { Client, registerUser, setup, type TestCtx } from './helpers';

/** Confirmação de e-mail exigida (SMTP "configurado"; os e-mails ficam em memória). */
const mailer = createMemoryMailer();
let t: TestCtx;
let admin: Client;

const PASSWORD = 'senha-muito-forte';
const linkToken = (i = mailer.sent.length - 1) => {
  const m = /verificar-email\?token=([A-Za-z0-9_-]+)/.exec(mailer.sent[i]!.text);
  return decodeURIComponent(m![1]!);
};

async function signUp(email: string, name = 'Visitante') {
  const c = new Client(t.app);
  const r = await c.post('/api/auth/register', { email, password: PASSWORD, displayName: name });
  return { c, r };
}

beforeAll(async () => {
  t = await setup({ env: { SMTP_USER: 'ascend@example.com', SMTP_PASSWORD: 'abcd efgh ijkl mnop' }, mailer });
  // O primeiro cadastro (quem instala) já nasce confirmado e entra direto.
  admin = (await registerUser(t.app, 'rei@example.com', 'Arthur')).client;
});
afterAll(async () => t.close());

describe('confirmação de e-mail', () => {
  it('o primeiro usuário (administrador) não precisa confirmar e nenhum e-mail é enviado', async () => {
    expect((await admin.get('/api/me')).body.user.role).toBe('admin');
    expect(mailer.sent).toHaveLength(0);
  });

  it('cadastro novo não abre sessão e envia o link para o e-mail informado', async () => {
    const { c, r } = await signUp('nova@example.com', 'Nova');
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ verificationRequired: true, email: 'nova@example.com', emailSent: true });
    expect(c.cookie).toBe('');
    expect((await c.get('/api/me')).status).toBe(401);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('nova@example.com');
    expect(mailer.sent[0]!.text).toContain('http://localhost:5173/verificar-email?token=');
    expect(mailer.sent[0]!.html).toContain('Confirmar e-mail');
  });

  it('o banco guarda só o hash do token, nunca o token do link', async () => {
    const rows = await t.db.execute(sql`select id from email_verification_tokens`);
    const ids = rows.rows.map((r) => (r as { id: string }).id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(linkToken());
    expect(ids[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('login antes de confirmar é recusado com código próprio; senha errada continua 401', async () => {
    const c = new Client(t.app);
    const blocked = await c.post('/api/auth/login', { email: 'nova@example.com', password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('email_not_verified');
    expect(c.cookie).toBe('');
    const wrong = await c.post('/api/auth/login', { email: 'nova@example.com', password: 'senha-errada-123' });
    expect(wrong.status).toBe(401);
  });

  it('o link confirma, abre a sessão e não pode ser usado de novo', async () => {
    const token = linkToken();
    const c = new Client(t.app);
    const ok = await c.post('/api/auth/verify-email', { token });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe('nova@example.com');
    expect(ok.body.role).toBe('user');
    expect((await c.get('/api/me')).status).toBe(200);
    expect((await new Client(t.app).post('/api/auth/verify-email', { token })).body.error.code).toBe('invalid_token');
    const login = await new Client(t.app).post('/api/auth/login', { email: 'nova@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it('token desconhecido e token expirado (24 h) são recusados', async () => {
    expect((await new Client(t.app).post('/api/auth/verify-email', { token: 'x'.repeat(43) })).body.error.code).toBe('invalid_token');
    await signUp('lenta@example.com');
    const token = linkToken();
    const start = t.clock.now;
    t.clock.now = new Date(start.getTime() + 24 * 3_600_000 + 1);
    const late = await new Client(t.app).post('/api/auth/verify-email', { token });
    t.clock.now = start;
    expect(late.status).toBe(400);
    expect(late.body.error.code).toBe('invalid_token');
  });

  it('reenviar troca o link (só o mais recente vale) e respeita o intervalo mínimo', async () => {
    const old = linkToken();
    const before = mailer.sent.length;
    const anon = new Client(t.app);
    // Dentro de 1 minuto do último envio: não reenvia.
    expect((await anon.post('/api/auth/resend-verification', { email: 'lenta@example.com' })).status).toBe(204);
    expect(mailer.sent.length).toBe(before);
    const start = t.clock.now;
    t.clock.now = new Date(start.getTime() + 61_000);
    expect((await anon.post('/api/auth/resend-verification', { email: 'LENTA@example.com' })).status).toBe(204);
    expect(mailer.sent.length).toBe(before + 1);
    const fresh = linkToken();
    expect(fresh).not.toBe(old);
    expect((await new Client(t.app).post('/api/auth/verify-email', { token: old })).body.error.code).toBe('invalid_token');
    expect((await new Client(t.app).post('/api/auth/verify-email', { token: fresh })).status).toBe(200);
    t.clock.now = start;
  });

  it('reenviar não revela se o e-mail existe ou já foi confirmado', async () => {
    const before = mailer.sent.length;
    const anon = new Client(t.app);
    expect((await anon.post('/api/auth/resend-verification', { email: 'ninguem@example.com' })).status).toBe(204);
    expect((await anon.post('/api/auth/resend-verification', { email: 'nova@example.com' })).status).toBe(204);
    expect((await anon.post('/api/auth/resend-verification', { email: 'rei@example.com' })).status).toBe(204);
    expect(mailer.sent.length).toBe(before);
  });

  it('conta criada pelo administrador já entra confirmada', async () => {
    const created = await admin.post('/api/admin/users', {
      email: 'convidado@example.com',
      password: PASSWORD,
      displayName: 'Convidado',
      role: 'user',
      timezone: 'America/Sao_Paulo',
    });
    expect(created.status).toBe(201);
    const login = await new Client(t.app).post('/api/auth/login', { email: 'convidado@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it('cada conta confirmada vê só os próprios dados', async () => {
    const nova = new Client(t.app);
    await nova.post('/api/auth/login', { email: 'nova@example.com', password: PASSWORD });
    const m = await admin.post('/api/missions', { title: 'Missão do rei', type: 'one_time', difficulty: 'moderate' });
    expect((await nova.get(`/api/missions/${m.body.id}`)).status).toBe(404);
    const titles = (await nova.get('/api/missions')).body.map((x: { title: string }) => x.title);
    expect(titles).not.toContain('Missão do rei');
  });
});
