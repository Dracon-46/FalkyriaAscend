import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de ponta a ponta: API (porta 3334) + interface (porta 5174) num banco isolado (rpg_e2e),
 * recriado do zero antes de a API subir (e2e/reset-db.mjs).
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgresql://rpg:rpg@localhost:5432/rpg_e2e';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: [/mobile\.spec\.ts/, /smoke\//] },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /e2e\/mobile\.spec\.ts/, dependencies: ['desktop'] },
  ],
  webServer: [
    {
      command: 'node ../../e2e/reset-db.mjs && npx tsx src/server.ts',
      cwd: 'apps/api',
      port: 3334,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: E2E_DB,
        PORT: '3334',
        APP_ORIGIN: 'http://localhost:5174',
        ALLOW_REGISTRATION: 'true',
        EVALUATION_INTERVAL_MINUTES: '0',
        INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      cwd: 'apps/web',
      port: 5174,
      reuseExistingServer: false,
      env: { VITE_API_TARGET: 'http://localhost:3334' },
    },
  ],
});
