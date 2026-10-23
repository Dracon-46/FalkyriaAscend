import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Verificações somente leitura no app publicado: nada é cadastrado nem alterado.
 * Pega o que os testes da CI não veem: serviço fora do ar, banco desconectado, variáveis erradas,
 * tela de entrada quebrada no build de produção e PWA sem manifesto.
 */
test.describe.configure({ mode: 'serial' });

const CSRF = { 'x-requested-with': 'rpg' };

/** Commit que precisa estar publicado (enviado pelo workflow após uma release). Vazio: aceita o que estiver no ar. */
const EXPECTED_COMMIT = process.env.SMOKE_EXPECTED_COMMIT || '';
/** Tempo máximo de espera: acordar o serviço e, após uma release, o Render terminar o deploy. */
const WAIT_MS = Number(process.env.SMOKE_WAIT_SECONDS || 150) * 1000;

/** Acorda o serviço (o plano gratuito hiberna) e espera a API responder, no commit esperado se houver. */
async function waitForApi(request: APIRequestContext) {
  const deadline = Date.now() + WAIT_MS;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const res = await request.get('/api/health', { timeout: 60_000 });
      if (res.ok()) {
        const { commit } = await res.json();
        if (!EXPECTED_COMMIT || commit === EXPECTED_COMMIT) return;
        last = `no ar o commit ${commit ? String(commit).slice(0, 7) : 'desconhecido'}, esperado ${EXPECTED_COMMIT.slice(0, 7)}`;
      } else {
        last = `HTTP ${res.status()}`;
      }
    } catch (err) {
      last = String(err);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error(`A API não ficou pronta a tempo (${last}).`);
}

test('API no ar e com banco conectado', async ({ request }) => {
  test.setTimeout(WAIT_MS + 120_000);
  await waitForApi(request);
  const health = await (await request.get('/api/health')).json();
  expect(health.ok).toBe(true);

  // A rota consulta o banco: se responder, a conexão com o Supabase está de pé.
  const res = await request.get('/api/auth/status');
  expect(res.ok()).toBe(true);
  const status = await res.json();
  expect(typeof status.hasUsers).toBe('boolean');
  expect(typeof status.registrationOpen).toBe('boolean');
});

test('proteção CSRF ativa e login recusando credenciais erradas', async ({ request, baseURL }) => {
  const body = { email: 'smoke-inexistente@falkyria.invalid', password: 'senha-que-nao-existe-123' };
  const semCabecalho = await request.post('/api/auth/login', { data: body, headers: { origin: baseURL! } });
  expect(semCabecalho.status()).toBe(403);

  const recusado = await request.post('/api/auth/login', { data: body, headers: { ...CSRF, origin: baseURL! } });
  expect(recusado.status()).toBe(401);
});

test('tela de entrada carrega no build de produção', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const status = await (await request.get('/api/auth/status')).json();

  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar/);
  if (status.hasUsers) {
    await expect(page.getByRole('heading', { name: 'Entrar no reino' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  } else {
    // Instalação nova: a própria tela de entrada vira o cadastro do fundador.
    await expect(page.getByText('Primeira execução')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Começar a jornada' })).toBeVisible();
  }
  await expect(page.getByLabel('E-mail')).toBeVisible();
  expect(errors).toEqual([]);
});

test('PWA: manifesto e service worker publicados', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const data = await manifest.json();
  expect(data.short_name).toBe('Ascend');
  expect((await request.get('/sw.js')).ok()).toBe(true);
});
