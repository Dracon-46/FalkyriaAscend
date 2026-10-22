import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { coinTransactions, wallets } from '../src/persistence/schema';
import { resetEvaluationThrottle } from '../src/application/evaluation';
import { Client, registerUser, setup, type TestCtx } from './helpers';

let t: TestCtx;
let admin: Client;
let other: Client;

const mission = (over: Record<string, unknown> = {}) => ({
  title: 'Organizar a escrivaninha',
  type: 'one_time',
  difficulty: 'moderate',
  ...over,
});

beforeAll(async () => {
  t = await setup();
  admin = (await registerUser(t.app, 'rei@example.com', 'Arthur')).client;
  other = (await registerUser(t.app, 'outro@example.com', 'Outro')).client;
});
afterAll(async () => t.close());

describe('autenticação, sessão e CSRF', () => {
  it('o primeiro usuário é administrador; os demais não', async () => {
    expect((await admin.get('/api/me')).body.user.role).toBe('admin');
    expect((await other.get('/api/me')).body.user.role).toBe('user');
  });
  it('rejeita acesso sem sessão e senha incorreta', async () => {
    const anon = new Client(t.app);
    expect((await anon.get('/api/dashboard')).status).toBe(401);
    expect((await anon.post('/api/auth/login', { email: 'rei@example.com', password: 'errada-errada' })).status).toBe(401);
  });
  it('exige cabeçalho CSRF em requisições que alteram estado', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/api/missions', payload: mission(), headers: { cookie: admin.cookie } });
    expect(r.statusCode).toBe(403);
    const r2 = await admin.req('POST', '/api/missions', mission(), { origin: 'https://evil.example' });
    expect(r2.status).toBe(403);
  });
  it('cria o conteúdo inicial editável sem dados de atividade falsos', async () => {
    const attrs = (await admin.get('/api/attributes')).body;
    expect(attrs.map((a: { code: string }) => a.code)).toEqual(['FOR', 'RES', 'VIT', 'INT', 'DIS', 'ORG', 'EXE', 'END']);
    expect(attrs.every((a: { xp: number }) => a.xp === 0)).toBe(true);
    const me = (await admin.get('/api/me')).body;
    expect(me.character.level.level).toBe(1);
    expect(me.character.coins).toBe(0);
    expect(me.character.rank.code).toBe('G');
  });
});

describe('missões e recompensas', () => {
  it('concede XP e moedas pela tabela de dificuldade, uma única vez', async () => {
    const m = (await admin.post('/api/missions', mission({ attributeWeights: { ORG: 1 } }))).body;
    const done = await admin.post(`/api/missions/${m.id}/action`, { action: 'complete' });
    expect(done.status).toBe(200);
    expect(done.body.reward).toMatchObject({ xp: 40, coins: 8 });
    const again = await admin.post(`/api/missions/${m.id}/action`, { action: 'complete' });
    expect(again.body.reward).toBeNull();
    const me = (await admin.get('/api/me')).body;
    expect(me.character.level.totalXp).toBeGreaterThanOrEqual(40);
    const attrs = (await admin.get('/api/attributes')).body;
    expect(attrs.find((a: { code: string }) => a.code === 'ORG').xp).toBe(40);
  });

  it('desbloqueia a conquista "Primeiro passo" com recompensa única', async () => {
    const ach = (await admin.get('/api/achievements')).body;
    const first = ach.find((a: { key: string }) => a.key === 'first_mission');
    expect(first.unlockedAt).not.toBeNull();
    const grants = (await admin.get('/api/history/grants?limit=500')).body.filter((g: { sourceType: string }) => g.sourceType === 'achievement');
    expect(grants.filter((g: { title: string }) => g.title.includes('Primeiro passo'))).toHaveLength(1);
  });

  it('rejeita dificuldade incoerente com o tipo (lendária diária)', async () => {
    const r = await admin.post('/api/missions', mission({ type: 'daily', difficulty: 'legendary' }));
    expect(r.status).toBe(422);
  });

  it('missão composta só conclui com todos os objetivos e conclui sozinha no modo automático', async () => {
    const subjects = (await admin.get('/api/subjects')).body;
    const m = (
      await admin.post(
        '/api/missions',
        mission({
          title: 'Semana de estudos',
          type: 'weekly',
          difficulty: 'hard',
          completionMode: 'auto',
          startDate: '2026-10-19',
          dueDate: '2026-10-25',
          objectives: [
            { title: 'Estudar 60 min', metric: 'study_minutes', target: 60 },
            { title: 'Resumo escrito', metric: 'manual', target: 1 },
          ],
        }),
      )
    ).body;
    const early = await admin.post(`/api/missions/${m.id}/action`, { action: 'complete' });
    expect(early.status).toBe(409);
    await admin.post('/api/study/sessions', { subjectId: subjects[0].id, minutes: 60, content: 'Capítulo 1' });
    let detail = (await admin.get(`/api/missions/${m.id}`)).body;
    expect(detail.objectives[0].current).toBe(60);
    expect(detail.status).not.toBe('completed');
    const manual = detail.objectives.find((o: { metric: string }) => o.metric === 'manual');
    await admin.patch(`/api/missions/${m.id}/objectives/${manual.id}`, { current: 1 });
    detail = (await admin.get(`/api/missions/${m.id}`)).body;
    expect(detail.status).toBe('completed');
    expect(detail.events.map((e: { toStatus: string }) => e.toStatus)).toContain('completed');
  });

  it('cancelar e suspender exigem motivo e nunca viram falha', async () => {
    const m = (await admin.post('/api/missions', mission({ title: 'Viagem' }))).body;
    expect((await admin.post(`/api/missions/${m.id}/action`, { action: 'suspend' })).status).toBe(400);
    expect((await admin.post(`/api/missions/${m.id}/action`, { action: 'suspend', reason: 'Lesão' })).body.mission.status).toBe('suspended');
    expect((await admin.post(`/api/missions/${m.id}/action`, { action: 'fail' })).status).toBe(409);
    expect((await admin.post(`/api/missions/${m.id}/action`, { action: 'cancel', reason: 'Desisti do plano' })).body.mission.status).toBe('cancelled');
  });
});

describe('hábitos, tolerância, penalidades e suspensões', () => {
  let habitId: string;
  it('registra o hábito e concede recompensa uma vez por dia', async () => {
    const rules = (await admin.get('/api/penalty-rules')).body;
    const fine = rules.find((r: { name: string }) => r.name === 'Multa leve');
    const h = await admin.post('/api/habits', {
      title: 'Leitura noturna',
      startDate: '2026-10-21',
      attributeWeights: { INT: 1 },
      penaltyRuleIds: [fine.id],
      tolerancePerWeek: 1,
    });
    expect(h.status).toBe(201);
    habitId = h.body.id;
    const c1 = await admin.post(`/api/habits/${habitId}/checkins`, {});
    expect(c1.body.reward.xp).toBeGreaterThan(0);
    const c2 = await admin.post(`/api/habits/${habitId}/checkins`, {});
    expect(c2.body.reward).toBeNull();
  });

  it('necessidades básicas não aceitam penalidades', async () => {
    const rules = (await admin.get('/api/penalty-rules')).body;
    const r = await admin.post('/api/habits', { title: 'Dormir 8h', startDate: '2026-10-21', isBasicNeed: true, penaltyRuleIds: [rules[1].id] });
    expect(r.status).toBe(422);
  });

  it('primeira falha da semana é tolerada; a seguinte aplica a multa escalonada', async () => {
    const before = (await admin.get('/api/me')).body.character.coins;
    t.clock.now = new Date('2026-10-23T12:00:00Z'); // 22/10 encerrado (São Paulo, 09:00)
    resetEvaluationThrottle();
    await admin.get('/api/dashboard');
    let detail = (await admin.get(`/api/habits/${habitId}`)).body;
    expect(detail.history.find((h: { localDate: string }) => h.localDate === '2026-10-22').status).toBe('tolerated');
    expect((await admin.get('/api/me')).body.character.coins).toBe(before);

    t.clock.now = new Date('2026-10-24T12:00:00Z');
    resetEvaluationThrottle();
    await admin.get('/api/dashboard');
    detail = (await admin.get(`/api/habits/${habitId}`)).body;
    expect(detail.history.find((h: { localDate: string }) => h.localDate === '2026-10-23').status).toBe('missed');
    expect(detail.penalties).toHaveLength(1);
    expect(detail.penalties[0].amount).toBe(5);
    expect((await admin.get('/api/me')).body.character.coins).toBe(before - 5);
  });

  it('avaliação repetida não duplica penalidades (idempotência)', async () => {
    resetEvaluationThrottle();
    await admin.post('/api/admin/evaluate');
    await admin.post('/api/admin/evaluate');
    const pens = (await admin.get('/api/history/penalties')).body;
    expect(pens).toHaveLength(1);
  });

  it('penalidade incorreta pode ser revertida com auditoria', async () => {
    const before = (await admin.get('/api/me')).body.character.coins;
    const [p] = (await admin.get('/api/history/penalties')).body;
    const r = await admin.post(`/api/history/penalties/${p.id}/revert`, { reason: 'Estava doente' });
    expect(r.body.status).toBe('reversed');
    expect((await admin.get('/api/me')).body.character.coins).toBe(before + 5);
    expect((await admin.post(`/api/history/penalties/${p.id}/revert`, { reason: 'de novo' })).status).toBe(409);
    const auditRows = (await admin.get('/api/history/audit')).body;
    expect(auditRows.some((a: { action: string }) => a.action === 'penalty.revert')).toBe(true);
  });

  it('indisponibilidade registrada dispensa o dia sem penalidade', async () => {
    await admin.post('/api/unavailability', { startDate: '2026-10-24', endDate: '2026-10-25', reason: 'illness' });
    t.clock.now = new Date('2026-10-26T12:00:00Z');
    resetEvaluationThrottle();
    await admin.get('/api/dashboard');
    const detail = (await admin.get(`/api/habits/${habitId}`)).body;
    const d24 = detail.history.find((h: { localDate: string }) => h.localDate === '2026-10-24');
    expect(d24.status).toBe('excused');
    expect((await admin.get('/api/history/penalties')).body).toHaveLength(1);
  });

  it('dias não programados (descanso semanal) não são avaliados', async () => {
    const h = (await admin.post('/api/habits', { title: 'Treino', startDate: '2026-10-26', frequency: 'weekdays', weekdaysMask: 0b0000010 })).body; // só segunda
    t.clock.now = new Date('2026-10-28T12:00:00Z');
    resetEvaluationThrottle();
    await admin.get('/api/dashboard');
    const detail = (await admin.get(`/api/habits/${h.id}`)).body;
    expect(detail.history.map((x: { localDate: string }) => x.localDate)).toEqual(['2026-10-26']);
    expect(detail.history[0].status).toBe('tolerated');
  });
});

describe('economia: loja, idempotência, concorrência e estornos', () => {
  let itemId: string;
  it('impede compra com saldo insuficiente', async () => {
    const shop = (await admin.get('/api/shop')).body;
    itemId = shop.items.find((i: { name: string }) => i.name === '1 hora de lazer livre').id;
    await t.db.execute(sql`select 1`);
    const balance = shop.balance;
    if (balance >= 60) await admin.post('/api/admin/adjust', { reason: 'Zerar para teste', coins: -balance });
    const r = await admin.post('/api/shop/purchase', { itemId }, { 'idempotency-key': 'compra-insuficiente-1' });
    expect(r.status).toBe(409);
  });

  it('repetição da mesma compra (falha de rede) não cobra duas vezes', async () => {
    await admin.post('/api/admin/adjust', { reason: 'Moedas de teste', coins: 130 });
    const balance = (await admin.get('/api/me')).body.character.coins;
    const a = await admin.post('/api/shop/purchase', { itemId }, { 'idempotency-key': 'compra-repetida-1' });
    const b = await admin.post('/api/shop/purchase', { itemId }, { 'idempotency-key': 'compra-repetida-1' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.purchase.id).toBe(a.body.purchase.id);
    expect((await admin.get('/api/me')).body.character.coins).toBe(balance - 60);
  });

  it('compras simultâneas nunca deixam saldo negativo', async () => {
    const me = (await admin.get('/api/me')).body;
    await admin.post('/api/admin/adjust', { reason: 'Saldo exato para 2 compras', coins: 120 - me.character.coins });
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => admin.post('/api/shop/purchase', { itemId }, { 'idempotency-key': `concorrente-${i}-abcdef` })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect((await admin.get('/api/me')).body.character.coins).toBe(0);
  });

  it('reembolso administrativo devolve moedas por lançamento e revoga o item', async () => {
    const purchases = (await admin.get('/api/purchases')).body;
    const r = await admin.post(`/api/purchases/${purchases[0].id}/refund`, { reason: 'Compra por engano' });
    expect(r.body.status).toBe('refunded');
    expect((await admin.get('/api/me')).body.character.coins).toBe(60);
  });

  it('estorno de recompensa reduz XP e não pode ser repetido', async () => {
    const xpBefore = (await admin.get('/api/me')).body.character.level.totalXp;
    const grants = (await admin.get('/api/history/grants?limit=500')).body;
    const quick = await admin.post('/api/quick-log', { title: 'Lavar a louça' });
    const g = quick.body.reward;
    const r = await admin.post(`/api/history/grants/${g.grantId}/reverse`, { reason: 'Registro duplicado' });
    expect(r.status).toBe(200);
    expect((await admin.get('/api/me')).body.character.level.totalXp).toBe(xpBefore);
    expect((await admin.post(`/api/history/grants/${g.grantId}/reverse`, { reason: 'De novo' })).status).toBe(409);
    expect(grants.length).toBeGreaterThan(0);
  });

  it('o livro-razão e as projeções estão íntegros', async () => {
    const r = await admin.get('/api/admin/integrity');
    expect(r.body.issues).toEqual([]);
    const [w] = await t.db.select().from(wallets).limit(1);
    void w;
  });

  it('detecta adulteração direta da projeção e recalcula a partir do livro-razão', async () => {
    const me = (await admin.get('/api/me')).body;
    await t.db.update(wallets).set({ balance: 999_999 }).where(eq(wallets.userId, me.user.id));
    expect((await admin.get('/api/admin/integrity')).body.ok).toBe(false);
    const fixed = await admin.post('/api/admin/integrity/rebuild');
    expect(fixed.body.ok).toBe(true);
    const ledgerSum = await t.db
      .select({ s: sql<number>`sum(${coinTransactions.amount})::int` })
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, me.user.id));
    expect((await admin.get('/api/me')).body.character.coins).toBe(ledgerSum[0]!.s);
  });

  it('subida de vários níveis em uma operação concede marcos de rank', async () => {
    await admin.post('/api/admin/adjust', { reason: 'Teste de subida múltipla', xp: 30_000 });
    const me = (await admin.get('/api/me')).body;
    expect(me.character.level.level).toBeGreaterThanOrEqual(20);
    expect(me.character.rank.code).toBe('D');
    const inv = (await admin.get('/api/inventory')).body;
    const titles = inv.filter((i: { item: { kind: string } }) => i.item.kind === 'title').map((i: { item: { name: string } }) => i.item.name);
    expect(titles).toEqual(expect.arrayContaining(['Título: Recruta', 'Título: Soldado', 'Título: Lutador']));
    // Equipar um título é diferente de possuí-lo.
    const soldado = inv.find((i: { item: { name: string } }) => i.item.name === 'Título: Soldado');
    expect((await admin.post(`/api/inventory/${soldado.id}/action`, { action: 'equip' })).body.state).toBe('equipped');
    expect((await admin.get('/api/me')).body.character.equipped.title).toBe('Soldado');
    expect((await admin.post(`/api/inventory/${soldado.id}/action`, { action: 'consume' })).status).toBe(422);
  });
});

describe('autorização entre usuários', () => {
  it('um usuário não acessa nem altera dados de outro', async () => {
    const m = (await admin.post('/api/missions', mission({ title: 'Segredo do rei' }))).body;
    expect((await other.get(`/api/missions/${m.id}`)).status).toBe(404);
    expect((await other.post(`/api/missions/${m.id}/action`, { action: 'complete' })).status).toBe(404);
    const adminCats = (await admin.get('/api/categories')).body;
    expect((await other.post('/api/missions', mission({ categoryId: adminCats[0].id }))).status).toBe(422);
    expect((await other.get('/api/admin/meta')).status).toBe(403);
    expect((await other.post('/api/history/penalties/00000000-0000-0000-0000-000000000000/revert', { reason: 'x'.repeat(5) })).status).toBe(403);
  });
});

describe('administração: CRUD genérico', () => {
  it('lista metadados de todos os recursos', async () => {
    const meta = (await admin.get('/api/admin/meta')).body;
    expect(meta.length).toBeGreaterThan(40);
    const ledger = meta.find((m: { key: string }) => m.key === 'coin_transactions');
    expect(ledger.mode).toBe('readonly');
  });
  it('cria, edita e exclui um registro com auditoria', async () => {
    const c = await admin.post('/api/admin/r/categories', { name: 'Música', color: '#123456' });
    expect(c.status).toBe(201);
    const u = await admin.put(`/api/admin/r/categories/${c.body.id}`, { name: 'Música e arte' });
    expect(u.body.name).toBe('Música e arte');
    expect((await admin.del(`/api/admin/r/categories/${c.body.id}`)).status).toBe(204);
    const auditRows = (await admin.get('/api/history/audit?limit=20')).body;
    expect(auditRows.some((a: { action: string }) => a.action === 'admin.delete')).toBe(true);
  });
  it('não permite editar o livro-razão nem excluir definição com histórico', async () => {
    expect((await admin.post('/api/admin/r/coin_transactions', { amount: 1000 })).status).toBe(403);
    const attrs = (await admin.get('/api/attributes')).body;
    const org = attrs.find((a: { code: string }) => a.code === 'ORG');
    expect((await admin.del(`/api/admin/r/attributes/${org.id}`)).status).toBe(409);
    expect((await admin.put(`/api/attributes/${org.id}`, { ...org, code: 'XYZ' })).status).toBe(409);
  });
  it('valida tipos e enums nos formulários genéricos', async () => {
    expect((await admin.post('/api/admin/r/items', { name: 'X', kind: 'inexistente' })).status).toBe(400);
    expect((await admin.post('/api/admin/r/missions', { title: 'X', type: 'daily', difficulty: 'legendary' })).status).toBe(422);
  });
});

describe('integrações: deduplicação e webhooks', () => {
  it('importação repetida não gera recompensas duplicadas', async () => {
    const payload = [
      { externalId: 'run-1', category: 'run', date: '2026-10-27', durationMin: 40, distanceKm: 8 },
      { externalId: 'lift-1', category: 'strength', date: '2026-10-27', durationMin: 50, sets: [{ exerciseName: 'Supino reto', reps: 8, weightKg: 60 }] },
    ];
    const a = await admin.post('/api/import/activities', payload);
    expect(a.body).toMatchObject({ created: 2, duplicates: 0 });
    const b = await admin.post('/api/import/activities', payload);
    expect(b.body).toMatchObject({ created: 0, duplicates: 2 });
    const records = (await admin.get('/api/records')).body;
    expect(records.some((r: { kind: string }) => r.kind === 'longest_run_km')).toBe(true);
  });
  it('handshake do webhook Strava exige segredo e verify_token', async () => {
    const ok = await admin.get('/api/integrations/strava/webhook/segredo-webhook-teste?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=segredo-webhook-teste');
    expect(ok.body).toEqual({ 'hub.challenge': 'abc' });
    const bad = await admin.get('/api/integrations/strava/webhook/errado?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=segredo-webhook-teste');
    expect(bad.status).toBe(403);
  });
  it('evento de webhook repetido é registrado uma única vez', async () => {
    const ev = { object_type: 'activity', object_id: 123, aspect_type: 'create', owner_id: 999, event_time: 1_700_000_000 };
    const url = '/api/integrations/strava/webhook/segredo-webhook-teste';
    const r1 = await t.app.inject({ method: 'POST', url, payload: ev });
    const r2 = await t.app.inject({ method: 'POST', url, payload: ev });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    const rows = await t.db.execute(sql`select count(*)::int as n from integration_events where provider = 'strava'`);
    expect((rows.rows[0] as { n: number }).n).toBe(1);
  });
});

describe('leitura: todos os endpoints respondem com dados reais', () => {
  it.each([
    '/api/dashboard', '/api/me', '/api/settings', '/api/config', '/api/notifications', '/api/lookups',
    '/api/categories', '/api/attributes', '/api/skills', '/api/ranks', '/api/level-rewards', '/api/penalty-rules',
    '/api/mission-templates', '/api/unavailability', '/api/missions', '/api/missions/suggestions', '/api/habits', '/api/goals',
    '/api/knowledge-areas', '/api/subjects', '/api/study-resources', '/api/study/overview', '/api/study/sessions',
    '/api/study/assessments', '/api/study/milestones', '/api/activity-types', '/api/exercises', '/api/activities', '/api/records',
    '/api/quick-log', '/api/items', '/api/shop', '/api/purchases', '/api/inventory', '/api/achievements', '/api/achievement-definitions',
    '/api/seasons', '/api/stats/progression?granularity=week&days=90', '/api/stats/attributes/radar', '/api/stats/attributes/history?granularity=week&days=60',
    '/api/stats/productivity?granularity=month&days=120', '/api/stats/economy?granularity=week&days=60', '/api/stats/mastery',
    '/api/history/grants', '/api/history/coins', '/api/history/penalties', '/api/history/missions', '/api/history/audit',
    '/api/integrations', '/api/admin/users', '/api/admin/integrity', '/api/admin/r/missions?q=a', '/api/export',
  ])('GET %s', async (url) => {
    const r = await admin.get(url);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  });
});

describe('configurações, temporadas, estatísticas e conta', () => {
  it('tema escolhido persiste', async () => {
    await admin.put('/api/settings', { theme: 'vampire', reducedMotion: 'on' });
    const me = (await admin.get('/api/me')).body;
    expect(me.settings.theme).toBe('vampire');
    expect(me.settings.reducedMotion).toBe('on');
    expect((await admin.put('/api/settings', { timezone: 'Marte/Olimpo' })).status).toBe(400);
  });
  it('estatísticas usam dados reais e preenchem lacunas', async () => {
    const p = (await admin.get('/api/stats/progression?days=14&granularity=day')).body;
    expect(p.series).toHaveLength(14);
    expect(p.total).toBeGreaterThan(0);
    const radar = (await admin.get('/api/stats/attributes/radar?compareDays=30')).body;
    expect(radar.attributes).toHaveLength(8);
    const eco = (await admin.get('/api/stats/economy?days=30')).body;
    expect(eco.series.length).toBe(30);
  });
  it('temporada concede recompensa sazonal ao atingir o limiar', async () => {
    const s = await admin.post('/api/seasons', { name: 'Teste', startDate: '2026-10-21', endDate: '2026-12-31', rewards: [{ title: 'Bronze', thresholdXp: 10, coins: 25 }] });
    expect(s.status).toBe(201);
    const list = (await admin.get('/api/seasons')).body;
    const season = list.find((x: { id: string }) => x.id === s.body.id);
    expect(season.rewards[0].claimedAt).not.toBeNull();
  });
  it('exclusão de conta remove todos os dados do usuário', async () => {
    await other.post('/api/missions', mission());
    const r = await other.post('/api/account/delete', { password: 'senha-muito-forte', confirm: 'EXCLUIR' });
    expect(r.status).toBe(204);
    const login = await new Client(t.app).post('/api/auth/login', { email: 'outro@example.com', password: 'senha-muito-forte' });
    expect(login.status).toBe(401);
  });
});
