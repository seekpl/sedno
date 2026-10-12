import { defineConfig, devices } from '@playwright/test';

const PROD_PORT = 3100;
const DEV_PORT = 3101;

/**
 * Dwa serwery: produkcyjny (next build + start) dla tras publicznych i testu prywatności
 * oraz deweloperski dla /dev/komponenty (strona istnieje tylko poza produkcją, PROMPT.md §13).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  use: {
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'prod',
      testIgnore: /dev-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PROD_PORT}` },
    },
    {
      name: 'dev',
      testMatch: /dev-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${DEV_PORT}` },
    },
  ],
  webServer: [
    {
      command: `pnpm build && pnpm start --port ${PROD_PORT}`,
      url: `http://localhost:${PROD_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      command: `pnpm dev --port ${DEV_PORT}`,
      url: `http://localhost:${DEV_PORT}/dev/komponenty`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
