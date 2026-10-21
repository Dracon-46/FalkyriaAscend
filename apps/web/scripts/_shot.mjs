import { chromium } from '@playwright/test';
const out = process.argv[2];
const themes = (process.argv[3] ?? 'medieval').split(',');
const path = process.argv[4] ?? '/';
const width = Number(process.argv[5] ?? 1440);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173/entrar');
await page.getByLabel('E-mail').fill('demo@falkyria.local');
await page.getByLabel('Senha').fill('demonstracao-falkyria');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL('http://localhost:5173/');
for (const theme of themes) {
  await page.evaluate(async (t) => {
    await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-requested-with': 'rpg' }, body: JSON.stringify({ theme: t }) });
  }, theme);
  await page.goto('http://localhost:5173' + path);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${theme}-${width}${path.replace(/\//g, '_')}.png`, fullPage: true });
}
console.log('errors:', errors.slice(0, 10));
await browser.close();
