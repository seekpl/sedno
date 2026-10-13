import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Testy bazy (RLS, funkcje, triggery) na lokalnym stosie Supabase: pnpm supabase:local start, potem
 * pnpm test:db. Każdy test tworzy własnych użytkowników, więc pliki mogą działać równolegle.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['tests/db/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
