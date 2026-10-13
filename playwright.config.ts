import { defineConfig, devices } from '@playwright/test';
import { appEnv } from './scripts/local-supabase/config';

const PROD_PORT = 3100;
const DEV_PORT = 3101;

/**
 * Serwer produkcyjny e2e działa na lokalnym stosie Supabase (scripts/local-supabase): konta włączone,
 * lista oczekujących i zdarzenia w bazie, e-maile z linkiem logowania w Mailpit. Klucze to publiczne
 * wartości deweloperskie lokalnego stosu.
 */
const local = appEnv();
const supabaseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: local.NEXT_PUBLIC_SUPABASE_URL!,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: local.SUPABASE_SERVICE_ROLE_KEY!,
};

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
      command: `pnpm supabase:local start && pnpm build && pnpm start --port ${PROD_PORT}`,
      url: `http://localhost:${PROD_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: {
        ...supabaseEnv,
        NEXT_PUBLIC_ACCOUNTS_ENABLED: 'true',
        NEXT_PUBLIC_SITE_URL: `http://localhost:${PROD_PORT}`,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
    {
      command: `pnpm dev --port ${DEV_PORT}`,
      url: `http://localhost:${DEV_PORT}/dev/komponenty`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
