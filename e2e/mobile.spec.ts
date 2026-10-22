import { expect, test } from '@playwright/test';

test('layout de celular: navegação inferior e registro rápido', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('fundador@exemplo.com');
  await page.getByLabel('Senha').fill('senha-super-forte');
  await page.getByRole('button', { name: 'Entrar' }).click();
  const nav = page.getByRole('navigation', { name: 'Navegação rápida' });
  await expect(nav).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await nav.getByRole('button').first().click();
  await expect(page.getByRole('dialog', { name: 'Registro rápido' })).toBeVisible();
});
