import { expect, test } from '@playwright/test';

test('tela de entrada no celular sem rolagem lateral', async ({ page }) => {
  await page.goto('/entrar');
  await expect(page.getByLabel('E-mail')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
