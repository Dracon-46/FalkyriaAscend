import { expect, test, type Page } from '@playwright/test';

/**
 * Fluxos críticos com dados reais (sem mocks): cadastro do administrador, missão com recompensa
 * persistida após recarregar, hábito, tema persistido, ajuste auditado, compra na loja e CRUD admin.
 * Os testes compartilham o mesmo banco e rodam em ordem.
 */
test.describe.configure({ mode: 'serial' });

const EMAIL = 'fundador@exemplo.com';
const PASSWORD = 'senha-super-forte';

async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Painel de comando' })).toBeVisible();
}

async function xpTotal(page: Page) {
  await page.goto('/personagem');
  const stat = page.getByText('XP vitalício').locator('xpath=..');
  return Number((await stat.innerText()).replace(/\D/g, ''));
}

test('primeira execução: cadastro cria o administrador com conteúdo inicial', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar/);
  await page.goto('/cadastro');
  await expect(page.getByText('Primeira execução')).toBeVisible();
  await page.getByLabel('Nome do personagem').fill('Fundador');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Começar a jornada' }).click();
  await expect(page.getByRole('heading', { name: 'Painel de comando' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administração' })).toBeVisible();
});

test('missão concluída concede XP uma única vez e persiste após recarregar', async ({ page }) => {
  await login(page);
  await page.goto('/missoes');
  await page.getByRole('button', { name: 'Nova missão' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome').fill('Organizar a mesa de trabalho');
  await dialog.getByRole('button', { name: 'Criar missão' }).click();
  await expect(page.getByText('Missão criada')).toBeVisible();
  const card = page.locator('article', { hasText: 'Organizar a mesa de trabalho' });
  await card.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText(/Missão concluída: \+40 XP/)).toBeVisible();
  const before = await xpTotal(page);
  expect(before).toBeGreaterThanOrEqual(40);
  await page.reload();
  expect(await xpTotal(page)).toBe(before);
});

test('hábito cumprido no dia gera recompensa e aparece como cumprido', async ({ page }) => {
  await login(page);
  await page.goto('/habitos?novo=1');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: false }).first().fill('Leitura noturna');
  await dialog.getByRole('button', { name: /Salvar|Criar/ }).last().click();
  await expect(page.getByText('Leitura noturna').first()).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Marcar Leitura noturna como cumprido' }).click();
  await expect(page.getByText(/Leitura noturna: \+\d+ XP/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Leitura noturna: cumprido' })).toBeVisible();
});

test('tema escolhido muda a identidade visual e persiste', async ({ page }) => {
  await login(page);
  await page.goto('/configuracoes?aba=aparencia');
  await page.getByRole('button', { name: /Vampiros/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'vampire');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'vampire');
  await page.getByRole('button', { name: /Medieval/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'medieval');
});

test('ajuste administrativo auditado e compra na loja debitam corretamente', async ({ page }) => {
  await login(page);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Ajuste manual' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Moedas (±)').fill('100');
  await dialog.getByLabel('Motivo (obrigatório)').fill('Teste E2E');
  await dialog.getByRole('button', { name: 'Lançar ajuste' }).click();
  await expect(page.getByText('Ajuste lançado e auditado')).toBeVisible();

  await page.goto('/loja');
  const item = page.locator('article', { hasText: '1 hora de lazer livre' }).first();
  await item.getByRole('button', { name: /Comprar/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Confirmar|Comprar/ }).last().click();
  await expect(page.getByText(/Compra/).first()).toBeVisible();
  await page.goto('/historico?aba=moedas');
  await expect(page.getByText('Compra: 1 hora de lazer livre')).toBeVisible();
  await expect(page.getByText('Ajuste administrativo: Teste E2E')).toBeVisible();
});

test('administração: CRUD genérico com integridade verificada', async ({ page }) => {
  await login(page);
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Novo', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome *').fill('Música');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('cell', { name: 'Música' })).toBeVisible();
  await page.getByRole('button', { name: 'Verificar integridade' }).click();
  await expect(page.getByText(/conferem com o livro-razão/)).toBeVisible();
});
