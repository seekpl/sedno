/**
 * Strona główna (PROMPT.md §12, decyzja 17): statyczna, mówi tylko o tym, co działa, JS < 80 KB gzip (§15),
 * CTA z parametrem src (zdarzenie landing_cta_click), lista oczekujących działa także bez JavaScriptu.
 */
import zlib from 'node:zlib';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { VIEWPORTS } from './helpers';

/**
 * Skrypty, które HTML strony wczytuje od razu (bez `nomodule` i bez prefetchu linków), rozmiar po gzip -9.
 */
async function initialScriptsGzip(request: APIRequestContext, url: string) {
  const html = await (await request.get(url)).text();
  const scripts = new Map<string, number>();
  for (const [tag, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)) {
    if (/\bnomodule\b/i.test(tag) || !src) continue;
    const body = await (await request.get(src)).body();
    scripts.set(src, zlib.gzipSync(body, { level: 9 }).length);
  }
  return scripts;
}

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

// §15: JS strony głównej < 80 KB gzip. Sam runtime React 19 + Next.js App Router to ok. 136 KB gzip
// (strona 404 bez naszych komponentów klienckich), więc limit 80 KB dla całości jest nieosiągalny w tym
// stosie (docs/decisions.md, p. 59 — decyzja właściciela). Test pilnuje twardo naszego kodu na stronie
// głównej i zapisuje całość w adnotacji, a całość nie może urosnąć ponad bazę frameworka + nasz limit.
test('JavaScript strony głównej: nasz kod < 20 KB gzip ponad bazę frameworka', async ({ request }) => {
  const framework = await initialScriptsGzip(request, '/nie-ma-takiej-strony');
  const landing = await initialScriptsGzip(request, '/');
  expect(landing.size).toBeGreaterThan(0);
  const own = new Map([...landing].filter(([src]) => !framework.has(src)));
  const total = sum(landing);
  test
    .info()
    .annotations.push(
      { type: 'js-gzip-total', description: String(total) },
      { type: 'js-gzip-framework', description: String(sum(framework)) },
      { type: 'js-gzip-own', description: String(sum(own)) },
    );
  console.log(
    `JS strony głównej: ${(total / 1024).toFixed(1)} KB gzip (framework ${(sum(framework) / 1024).toFixed(1)} KB, nasz kod ${(sum(own) / 1024).toFixed(1)} KB)`,
  );
  expect(sum(own)).toBeLessThan(20 * 1024);
  expect(total).toBeLessThan(sum(framework) + 20 * 1024);
});

test('teksty z decyzji 17 i brak obietnic linku', async ({ page }) => {
  await page.goto('/');
  const main = page.locator('main');
  await expect(main).toContainText(
    'Wgrywasz eksport z Meta Business Suite, dopisujesz trzy liczby i pobierasz PDF dla klienta. Na górze raportu: ile osób chciało zadzwonić, dojechać i się umówić.',
  );
  await expect(main).toContainText('Bez zakładania konta. Plik zostaje w Twojej przeglądarce.');
  await expect(main).toContainText('Teraz: za darmo, PDF ze stopką »Przygotowano w Sedno«.');
  await expect(main).toContainText('Czy mogę wysłać klientowi link?');
  await expect(main).toContainText('Wkrótce w planie Solo');
  await expect(main).not.toContainText('Kopiuj link');
  await expect(main).not.toContainText('Najczęściej wybierany');
  await expect(main).not.toContainText('Czy klient musi zakładać konto?');
  await expect(page.getByText('Dane przykładowe').first()).toBeVisible();
});

test('wszystkie CTA do /nowy mają parametr src z listy zdarzeń', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page
    .locator('a[href^="/nowy"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(2);
  for (const href of hrefs) expect(href).toMatch(/^\/nowy\?src=(header|hero|pricing|cta-band|example|menu)$/);
});

test('FAQ i menu mobilne działają na natywnych <details>', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('/');
  await page.getByLabel('Menu').click();
  await expect(page.getByRole('link', { name: 'Cennik' }).first()).toBeVisible();
  const faq = page.locator('details').filter({ hasText: 'Czy Sedno jest narzędziem Mety?' });
  await faq.locator('summary').click();
  await expect(faq).toHaveAttribute('open', '');
});

test.describe('lista oczekujących bez JavaScriptu', () => {
  test.use({ javaScriptEnabled: false });

  test('zapis na listę planu Solo działa jako zwykły formularz', async ({ page }) => {
    await page.goto('/#cennik');
    await page.getByText('Powiadom mnie o starcie').first().click();
    await page.getByLabel('Adres e-mail').first().fill(`bez-js-${Date.now()}@example.com`);
    await page.getByRole('checkbox').first().check();
    await page.getByRole('button', { name: 'Zapisz mnie na listę' }).first().click();
    await expect(page.getByText('Zapisano na listę').first()).toBeVisible();
  });
});
