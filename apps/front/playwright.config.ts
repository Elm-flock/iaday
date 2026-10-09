import { defineConfig, devices } from '@playwright/test';

// El back usa 3000 (FRONT_ORIGIN=http://localhost:3001), por eso el front corre en 3001.
const PORT = 3001;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  // next dev compila rutas bajo demanda: el primer acceso puede tardar varios segundos.
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Back real (puerto 3000 por defecto). Los e2e de auth requieren un admin sembrado.
    env: { API_URL: process.env.API_URL ?? 'http://localhost:3000' },
  },
});
