/**
 * Prywatność pliku (PROMPT.md §17 p. 1, CLAUDE.md zasada 1): przez cały przepływ /nowy — wczytanie pliku
 * w Web Workerze, efekty, podgląd, PDF — oraz zapis na listę oczekujących żadne żądanie sieciowe (strony
 * ani workera) nie zawiera znacznika SEDNO-PRIVACY-CANARY-7f3a ani bajtów pliku. To samo dla localStorage,
 * sessionStorage i magazynu zdarzeń po stronie serwera. Kontrola pozytywna dowodzi, że nagrywanie działa.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_STORE_DIR } from '../../playwright.config';
import { goToMonth, uploadFixture } from './flow-helpers';
import { recordRequests, type RecordedRequest } from './helpers';

const CANARY = 'SEDNO-PRIVACY-CANARY-7f3a';
const FILE = 'synthetic-privacy-canary.csv';
/** Fragmenty pliku, które nie mogą wyjść z przeglądarki (opis posta, nagłówek, nazwa konta). */
const FILE_FRAGMENTS = [
  CANARY,
  'Metamorfoza brwi krok po kroku',
  'Identyfikator posta;Identyfikator konta',
  'sedno_canary_7f3a',
];

function leaks(records: RecordedRequest[]) {
  const found: string[] = [];
  for (const r of records) {
    const url = decodeURIComponent(r.url);
    const body = r.body ? r.body.toString('utf8') + r.body.toString('latin1') : '';
    for (const fragment of FILE_FRAGMENTS) {
      if (url.includes(fragment) || body.includes(fragment)) found.push(`${r.method} ${r.url}: ${fragment}`);
    }
  }
  return found;
}

test('kontrola pozytywna: nagrywanie łapie znacznik wysłany ze strony i z Web Workera', async ({
  page,
  context,
}) => {
  const records = recordRequests(context);
  await page.goto('/nowy');
  await page.evaluate(async (canary) => {
    await fetch('/__privacy-probe', { method: 'POST', body: canary }).catch(() => undefined);
    const src = `fetch('/__privacy-probe-worker', { method: 'POST', body: '${canary}' }).finally(() => postMessage('ok'))`;
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    await new Promise((resolve) => (worker.onmessage = resolve));
  }, CANARY);
  await expect.poll(() => leaks(records).some((l) => l.includes('/__privacy-probe-worker'))).toBe(true);
  expect(leaks(records).some((l) => /\/__privacy-probe:/.test(l))).toBe(true);
});

test('plik nie opuszcza przeglądarki: cały przepływ /nowy, PDF i lista oczekujących', async ({
  page,
  context,
}) => {
  const records = recordRequests(context);

  // Wejście z CTA strony głównej (zdarzenie landing_cta_click) i wczytanie pliku ze znacznikiem.
  await page.goto('/nowy?src=hero');
  await goToMonth(page, 'Wrzesień 2026');
  await uploadFixture(page, FILE);
  await expect(page.getByText(/Wczytano 31 publikacji z września/)).toBeVisible();

  // Efekty, komentarz i nazwy.
  await page.getByLabel('Twoja nazwa albo marka').fill('Kadr Social');
  await page.getByLabel('Nazwa klienta').fill('Studio Lumi');
  await page.getByLabel('Kliknięcia „Zarezerwuj”', { exact: true }).fill('23');
  await page.getByLabel('Kliknięcia „Zadzwoń”', { exact: true }).fill('9');
  await page.getByLabel('Kliknięcia „Wyznacz trasę”', { exact: true }).fill('14');
  await page
    .getByLabel('Co zadziałało')
    .fill('Najwięcej rezerwacji przyszło po rolkach z metamorfozami brwi.');

  // Podgląd i PDF.
  await page.getByRole('button', { name: /Przejdź do PDF|Zobacz raport/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pobierz PDF' }).click();
  await (await download).path();
  await expect(page.getByText('PDF pobrany')).toBeVisible();

  // Pamięć przeglądarki bez treści pliku.
  const storage = await page.evaluate(
    () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
  );
  for (const fragment of FILE_FRAGMENTS) expect(storage).not.toContain(fragment);

  // Lista oczekujących na stronie głównej (ten sam kontekst, ten sam identyfikator sesji).
  await page.goto('/#cennik');
  const notify = page.getByText('Powiadom mnie o starcie').first();
  await notify.click();
  await page.getByLabel('Adres e-mail').first().fill('test-prywatnosci@example.com');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Zapisz mnie na listę' }).first().click();
  await expect(page.getByText('Zapisano na listę').first()).toBeVisible();

  // Żadne żądanie nie niosło pliku; największe ciało żądania jest małe (tylko liczby).
  await page.waitForLoadState('networkidle');
  expect(leaks(records)).toEqual([]);
  const largestPost = Math.max(0, ...records.filter((r) => r.body).map((r) => r.body!.length));
  expect(largestPost).toBeLessThan(4096);

  // Magazyn po stronie serwera: zdarzenia są, treści pliku nie ma.
  const dir = path.resolve(E2E_STORE_DIR);
  const events = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8');
  for (const name of [
    'landing_cta_click',
    'csv_parsed',
    'report_previewed',
    'pdf_downloaded',
    'waitlist_joined',
  ]) {
    expect(events, name).toContain(`"${name}"`);
  }
  const waitlist = fs.readFileSync(path.join(dir, 'waitlist.jsonl'), 'utf8');
  for (const fragment of FILE_FRAGMENTS) {
    expect(events).not.toContain(fragment);
    expect(waitlist).not.toContain(fragment);
  }
});
