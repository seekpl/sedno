/**
 * Trasy z kontem (Faza 2): /logowanie, panel klientów, edytor, Ustawienia, historia i raport publiczny /r.
 * Na 390 i 1280 px: axe bez naruszeń serious/critical, jedno h1, lang="pl", bez przewijania w poziomie,
 * CSP z nonce bez zdarzeń securitypolicyviolation, zrzuty do porównania z brand/reference/screens
 * (EkranPanel, EkranUzupelnij, EkranRaport).
 */
import { expect, test, type Page } from '@playwright/test';
import { addClient, closeAll, login, newAccountContext, testEmail } from './account-helpers';
import { uploadFixture } from './flow-helpers';
import {
  collectCspViolations,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  isKnownPdfWasmViolation,
  readCspViolations,
  VIEWPORTS,
} from './helpers';

const MONTH = '2026-09';

async function checkPage(page: Page, slug: string, width: number, outputPath: (name: string) => string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.locator('h1')).toHaveCount(1);
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  expect((await readCspViolations(page)).filter((v) => !isKnownPdfWasmViolation(v))).toEqual([]);
  await page.screenshot({ path: outputPath(`${slug}-${width}.png`), fullPage: true });
}

test('/logowanie: CSP z nonce, bez sesji Supabase w przeglądarce', async ({ page }) => {
  await collectCspViolations(page);
  const res = await page.goto('/logowanie');
  expect(res?.status()).toBe(200);
  const csp = res!.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).toContain("connect-src 'self'");
  await page.waitForLoadState('networkidle');
  expect(await readCspViolations(page)).toEqual([]);
});

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`trasy z kontem (${name})`, async ({ browser, baseURL }, info) => {
    const out = (file: string) => info.outputPath(file);
    const context = await newAccountContext(browser, baseURL, info.workerIndex);
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await collectCspViolations(page);

    // Logowanie: formularz i „Sprawdź skrzynkę”.
    await page.goto('/logowanie');
    await checkPage(page, 'logowanie', viewport.width, out);
    await login(page, testEmail(`trasy-${name}`, info.workerIndex));

    // Panel: pusty, potem z klientem.
    await page.goto(`/app/klienci?m=${MONTH}`);
    await checkPage(page, 'app_klienci-pusty', viewport.width, out);
    await addClient(page, 'Studio Lumi');
    await addClient(page, 'Bistro Pod Lipą');
    await checkPage(page, 'app_klienci', viewport.width, out);

    // Edytor: krok 1, krok 2 z danymi, krok 3 z linkiem.
    await page.getByRole('link', { name: 'Wgraj eksport: Studio Lumi' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Studio Lumi');
    await checkPage(page, 'app_edytor-krok1', viewport.width, out);
    await uploadFixture(page, 'synthetic-pl-semicolon-bom.csv');
    await expect(page.getByText('Wczytano 31 publikacji z września')).toBeVisible();
    await page.getByLabel('Kliknięcia „Zarezerwuj”', { exact: true }).fill('23');
    await page.getByLabel('Kliknięcia „Zadzwoń”', { exact: true }).fill('9');
    await page.getByLabel('Kliknięcia „Wyznacz trasę”', { exact: true }).fill('14');
    await checkPage(page, 'app_edytor-krok2', viewport.width, out);
    await page.getByRole('button', { name: 'Zapisz szkic' }).click();
    await expect(page.getByText('Szkic zapisany')).toBeVisible();
    await page.getByRole('button', { name: 'Przejdź do wysyłki' }).click();
    await page.getByRole('button', { name: 'Utwórz link' }).click();
    await expect(page.getByText('Link utworzony')).toBeVisible();
    const url = await page.getByRole('textbox', { name: 'Adres linku' }).inputValue();
    await checkPage(page, 'app_edytor-krok3', viewport.width, out);

    // Historia i Ustawienia.
    await page.goto('/app/raporty');
    await checkPage(page, 'app_raporty', viewport.width, out);
    await page.goto('/app/ustawienia');
    await checkPage(page, 'app_ustawienia', viewport.width, out);

    // Raport publiczny w kontekście bez sesji.
    const visitor = await browser.newContext({ baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
    const client = await visitor.newPage();
    await client.setViewportSize(viewport);
    await collectCspViolations(client);
    const res = await client.goto(url);
    expect(res?.status()).toBe(200);
    expect(res!.headers()['content-security-policy']).toMatch(/script-src 'nonce-/);
    await checkPage(client, 'r_token', viewport.width, out);
    const missing = await client.goto('/r/AAAAAAAAAAAAAAAAAAAAAA');
    expect(missing?.status()).toBe(404);
    await checkPage(client, 'r_wylaczony', viewport.width, out);

    await closeAll(context, visitor);
  });
}
