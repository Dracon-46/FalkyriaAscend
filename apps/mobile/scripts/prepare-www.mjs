// Gera a configuração do Capacitor e a casca local do app (www/) a partir da URL publicada do Ascend.
// O app Android abre a interface servida pela API (mesma origem, então o cookie de sessão funciona)
// e mostra www/offline.html quando não há conexão.
// URL: variável ASCEND_APP_URL; sem ela, usa o endereço padrão do serviço no Render (render.yaml).
import { mkdirSync, writeFileSync } from 'node:fs';

const DEFAULT_APP_URL = 'https://falkyria-ascend.onrender.com';

const appUrl = new URL(process.env.ASCEND_APP_URL || DEFAULT_APP_URL);
if (appUrl.protocol !== 'https:') {
  console.error(`ASCEND_APP_URL precisa usar https (recebido: ${appUrl.href}).`);
  process.exit(1);
}
const origin = appUrl.origin;

const config = {
  appId: 'com.falkyria.ascend',
  appName: 'Ascend',
  webDir: 'www',
  server: {
    url: origin,
    errorPath: 'offline.html',
    allowNavigation: [appUrl.host],
  },
  android: {
    backgroundColor: '#0d0b09',
    allowMixedContent: false,
  },
};

const html = (body) => `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark" />
    <title>Ascend</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
        background: #0d0b09; color: #ece3cf; font: 16px/1.5 system-ui, sans-serif; text-align: center; }
      main { max-width: 320px; }
      h1 { margin: 16px 0 8px; font-size: 1.25rem; color: #f0d98c; }
      p { margin: 0 0 24px; color: #b9ad94; }
      a { display: inline-block; padding: 12px 20px; border-radius: 10px; background: #f0d98c; color: #14110d;
        font-weight: 600; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>
`;

const shield = `<svg width="72" height="72" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 54 14v16c0 13-9.5 23-22 28C19.5 53 10 43 10 30V14Z" fill="none" stroke="#f0d98c" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 38 32 26l12 12" fill="none" stroke="#f0d98c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

mkdirSync(new URL('../www', import.meta.url), { recursive: true });
writeFileSync(new URL('../capacitor.config.json', import.meta.url), `${JSON.stringify(config, null, 2)}\n`);
writeFileSync(
  new URL('../www/offline.html', import.meta.url),
  html(
    `${shield}<h1>Sem conexão com o reino</h1><p>O Ascend precisa de internet para sincronizar seu progresso. Verifique a conexão e tente de novo.</p><a href="${origin}/">Tentar de novo</a>`,
  ),
);
// O Capacitor exige um index.html em webDir; com server.url ele só aparece se a URL não carregar.
writeFileSync(new URL('../www/index.html', import.meta.url), html(`${shield}<h1>Ascend</h1><p>Abrindo…</p><a href="${origin}/">Abrir</a>`));
console.log(`App Android configurado para ${origin}`);
