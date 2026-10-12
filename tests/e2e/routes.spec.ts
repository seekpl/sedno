/**
 * Każda trasa: axe bez naruszeń serious/critical (PROMPT.md §15, §17 p. 6), bez przewijania w poziomie,
 * jeden nagłówek h1, lang="pl", zrzuty 390 i 1280 px do porównania z brand/reference/screens (§17 p. 5).
 */
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, VIEWPORTS } from './helpers';

const ROUTES = [
  '/',
  '/przyklad',
  '/szablon',
  '/poradniki',
  '/poradniki/jak-zrobic-raport-z-instagrama-dla-klienta',
  '/prywatnosc',
  '/regulamin',
  '/kontakt',
  '/nowy',
];

for (const route of ROUTES) {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`${route} (${name})`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
      await expect(page.locator('h1')).toHaveCount(1);
      await expectNoSeriousA11yViolations(page);
      await expectNoHorizontalOverflow(page);
      const slug = route === '/' ? 'home' : route.slice(1).replaceAll('/', '_');
      await page.screenshot({ path: info.outputPath(`${slug}-${viewport.width}.png`), fullPage: true });
    });
  }
}

test('404: polski komunikat i link do strony głównej', async ({ page }) => {
  const res = await page.goto('/nie-ma-takiej-strony');
  expect(res?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.getByRole('link', { name: /strona główna|Wróć/i }).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('robots.txt, sitemap.xml i manifest', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /app');
  expect(robots).toContain('Disallow: /r/');
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/przyklad');
  expect(sitemap).toContain('/nowy');
  expect(sitemap).not.toContain('/app');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.theme_color.toUpperCase()).toBe('#2A3CD4');
  expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual(
    expect.arrayContaining(['/icon-192.png', '/icon-512.png']),
  );
});
