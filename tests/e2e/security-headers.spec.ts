import { expect, test } from '@playwright/test';

test('nagłówki bezpieczeństwa (PROMPT.md §15)', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['strict-transport-security']).toContain('max-age=');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['x-powered-by']).toBeUndefined();
});

test('/dev/komponenty nie istnieje w produkcji', async ({ request }) => {
  const res = await request.get('/dev/komponenty');
  expect(res.status()).toBe(404);
});

test('strona główna: lang="pl", preload Bricolage', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(
    page.locator('link[rel="preload"][href="/fonts/BricolageGrotesque-Variable.woff2"]'),
  ).toHaveCount(1);
});
