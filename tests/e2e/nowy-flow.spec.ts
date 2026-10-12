/**
 * Narzędzie bez konta (PROMPT.md §17 p. 2): wgranie → efekty → podgląd → PDF, na telefonie i komputerze.
 * PDF jest pobierany, a jego tekst ma poprawne polskie znaki. Cały przepływ działa z klawiatury.
 */
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { goToMonth, uploadFixture } from './flow-helpers';
import {
  collectCspViolations,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  isKnownPdfWasmViolation,
  readCspViolations,
  VIEWPORTS,
} from './helpers';

async function pdfText(file: string): Promise<{ text: string; pages: number; title?: string }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + ' ';
  }
  const meta = await doc.getMetadata();
  return { text, pages: doc.numPages, title: (meta.info as { Title?: string }).Title };
}

async function fillEffects(page: Page) {
  await page.getByLabel('Twoja nazwa albo marka').fill('Kadr Social');
  await page.getByLabel('Nazwa klienta').fill('Zażółć Gęślą Jaźń — Łódź');
  await page.getByLabel('Kliknięcia „Zarezerwuj”', { exact: true }).fill('23');
  await page.getByLabel('Kliknięcia „Zadzwoń”', { exact: true }).fill('9');
  await page.getByLabel('Kliknięcia „Wyznacz trasę”', { exact: true }).fill('14');
  await page
    .getByLabel('Co zadziałało')
    .fill('Najwięcej rezerwacji przyszło po rolkach z metamorfozami brwi.');
}

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`/nowy (${name})`, () => {
    test.use({ viewport });

    test('wgranie, efekty, podgląd i PDF', async ({ page }, info) => {
      await collectCspViolations(page);
      await page.goto('/nowy');
      await expect(page.getByRole('heading', { level: 1, name: /Wgraj eksport za/ })).toBeVisible();
      await expect(page.getByText('Plik zostaje w Twojej przeglądarce.', { exact: false })).toBeVisible();
      await expectNoSeriousA11yViolations(page);
      await goToMonth(page, 'Wrzesień 2026');

      await uploadFixture(page, 'synthetic-pl-semicolon-bom.csv');
      await expect(page.getByText('Wczytano 31 publikacji z września')).toBeVisible();
      await expect(page.getByText('synthetic-pl-semicolon-bom.csv')).toBeVisible();
      await fillEffects(page);
      // Wartości z poprzedniego miesiąca z pliku i tytuł z liczb.
      if (name === 'desktop') {
        await expect(page.getByText('23 osoby chciały się umówić').first()).toBeVisible();
      }
      await expectNoSeriousA11yViolations(page);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath(`nowy-efekty-${viewport.width}.png`), fullPage: true });

      await page.getByRole('button', { name: /Przejdź do PDF|Zobacz raport/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Raport dla klienta' })).toBeVisible();
      await expect(page.getByText('23 osoby chciały się umówić').first()).toBeVisible();
      await expectNoSeriousA11yViolations(page);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath(`nowy-podglad-${viewport.width}.png`), fullPage: true });

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Pobierz PDF' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('raport-zazolc-gesla-jazn-lodz-2026-09.pdf');
      const file = info.outputPath('raport.pdf');
      await download.saveAs(file);
      await expect(page.getByText('PDF pobrany')).toBeVisible();

      const pdf = await pdfText(file);
      expect(pdf.pages).toBe(1);
      const text = pdf.text.replace(/\s+/g, ' ');
      expect(text).toContain('Zażółć Gęślą Jaźń');
      expect(text).toContain('23 osoby chciały się umówić');
      expect(text).toContain('„Zarezerwuj”');
      expect(text).toContain('Przygotowano w');
      expect(pdf.title).toContain('Zażółć Gęślą Jaźń');

      // Jedyne dopuszczalne zgłoszenie CSP to znany fetch WebAssembly z data: w yoga-layout (decyzja 22).
      const violations = await readCspViolations(page);
      expect(violations.filter((v) => !isKnownPdfWasmViolation(v))).toEqual([]);
    });
  });
}

test('wgranie z klawiatury: przycisk „Wybierz plik” otwiera wybór pliku', async ({ page }) => {
  await page.goto('/nowy');
  await goToMonth(page, 'Wrzesień 2026');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Wybierz plik' }).focus();
  await page.keyboard.press('Enter');
  await (
    await chooser
  ).setFiles(new URL('../fixtures/synthetic-pl-semicolon-bom.csv', import.meta.url).pathname);
  await expect(page.getByText('Wczytano 31 publikacji z września')).toBeVisible();
  // Fokus trafia na nagłówek kolejnego kroku.
  await expect(page.locator(':focus')).toHaveRole('heading');
});

test('plik bez rozpoznanych kolumn → przypisanie ręczne → raport', async ({ page }) => {
  await page.goto('/nowy');
  await goToMonth(page, 'Wrzesień 2026');
  await uploadFixture(page, 'synthetic-unknown-headers.csv');
  await expect(page.getByText('To nie jest eksport treści', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Przypisz kolumny ręcznie' }).click();
  await page.getByLabel('Czas publikacji').selectOption('Kiedy');
  await page.getByLabel('Wyświetlenia').selectOption('Ile razy obejrzano');
  await page.getByRole('button', { name: 'Wczytaj z tymi kolumnami' }).click();
  await expect(page.getByText(/Wczytano \d+ publikacj/)).toBeVisible();
  // Wybór zapamiętany w przeglądarce jako mapa nagłówek → pole.
  const stored = await page.evaluate(() => localStorage.getItem('sedno.columnMapping.v1'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ Kiedy: 'publishedAt', 'Ile razy obejrzano': 'views' });
});

test('plik, który nie jest CSV → błąd z przyczyną i naprawą', async ({ page }) => {
  await page.goto('/nowy');
  await uploadFixture(page, 'synthetic-not-csv.txt');
  await expect(page.getByText('To nie jest plik CSV', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Wgraj plik z rozszerzeniem .csv pobrany z Meta Business Suite.', { exact: true }),
  ).toBeVisible();
  // Czytnik ekranu dostaje przyczynę i naprawę w jednym komunikacie.
  await expect(page.getByRole('alert').filter({ hasText: 'To nie jest plik CSV' })).toContainText(
    'To nie jest plik CSV. Wgraj plik z rozszerzeniem .csv pobrany z Meta Business Suite.',
  );
  await expect(page.getByRole('button', { name: 'Wybierz inny plik' })).toBeVisible();
});

test('brak publikacji z wybranego miesiąca → przełączenie na miesiąc z pliku', async ({ page }) => {
  await page.goto('/nowy');
  await goToMonth(page, 'Lipiec 2026');
  await uploadFixture(page, 'synthetic-pl-semicolon-bom.csv');
  await expect(page.getByText('W pliku nie ma publikacji z lipca')).toBeVisible();
  await page.getByRole('button', { name: /Przełącz na Wrzesień 2026/ }).click();
  await expect(page.getByText('Wczytano 31 publikacji z września')).toBeVisible();
});
