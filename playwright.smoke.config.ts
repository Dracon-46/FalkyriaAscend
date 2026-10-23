import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke de produção: roda contra o app publicado (sem servidor local e sem criar dados).
 * O plano gratuito do Render hiberna; o primeiro acesso pode levar cerca de um minuto, daí os prazos longos.
 */
const BASE_URL = (process.env.SMOKE_BASE_URL || 'https://falkyria-ascend.onrender.com').replace(/\/$/, '');

export default defineConfig({
  testDir: './e2e/smoke',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: BASE_URL, trace: 'retain-on-failure', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', navigationTimeout: 120_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
