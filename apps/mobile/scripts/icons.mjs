// Gera as imagens-fonte do app Android (assets/) a partir do ícone do PWA, usando o Chromium do Playwright.
// Depois, `capacitor-assets generate --android` cria os recursos de cada densidade em android/app/src/main/res.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../../web/public/icons/icon.svg', import.meta.url), 'utf8');
// Só o escudo, sem o fundo arredondado: o Android aplica a própria máscara ao ícone adaptativo.
const emblem = svg.replace(/<rect[^>]*\/>/, '');
const out = new URL('../assets/', import.meta.url);
mkdirSync(out, { recursive: true });

const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();

async function render(name, size, { art, scale, background }) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  const bg = background ?? 'transparent';
  await page.setContent(
    `<html><body style="margin:0;background:${bg};display:grid;place-items:center;width:${size}px;height:${size}px">${art.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`,
  );
  await page.screenshot({ path: new URL(name, out).pathname, omitBackground: !background });
  console.log('gerado', name);
}

await render('icon-only.png', 1024, { art: svg, scale: 1, background: '#14110d' });
// Zona segura do ícone adaptativo: o conteúdo precisa caber nos 66% centrais.
await render('icon-foreground.png', 1024, { art: emblem, scale: 0.6 });
await render('icon-background.png', 1024, { art: '<svg></svg>', scale: 1, background: '#14110d' });
await render('splash.png', 2732, { art: emblem, scale: 0.22, background: '#0d0b09' });
await render('splash-dark.png', 2732, { art: emblem, scale: 0.22, background: '#0d0b09' });
await browser.close();
