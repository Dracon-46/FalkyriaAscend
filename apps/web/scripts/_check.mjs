import { chromium } from '@playwright/test';
const out = process.argv[2];
const paths = process.argv[3].split(',');
const width = Number(process.argv[4] ?? 1440);
const theme = process.argv[5] ?? 'medieval';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width, height: 1000 } })).newPage();
let errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto('http://localhost:5173/entrar');
await page.getByLabel('E-mail').fill(process.env.EMAIL ?? 'demo@falkyria.local');
await page.getByLabel('Senha').fill(process.env.PASS ?? 'demonstracao-falkyria');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL('http://localhost:5173/');
await page.evaluate(async (t) => fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-requested-with': 'rpg' }, body: JSON.stringify({ theme: t }) }), theme);
for (const p of paths) {
  errors = [];
  await page.goto('http://localhost:5173' + p);
  await page.waitForTimeout(2200);
  const name = `${theme}-${width}${p.replace(/[/?=&]/g, '_')}.png`;
  await page.screenshot({ path: `${out}/${name}`, fullPage: true });
  const alerts = await page.locator('[role=alert]').allInnerTexts();
  console.log(p, '| errors:', JSON.stringify(errors), '| alerts:', JSON.stringify(alerts.slice(0, 3)));
}
await browser.close();
