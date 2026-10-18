/**
 * Prywatność pliku (PROMPT.md §17 p. 1, CLAUDE.md zasada 1): przez cały przepływ /nowy — wczytanie pliku
 * w Web Workerze, efekty, podgląd, PDF — oraz zapis na listę oczekujących żadne żądanie sieciowe (strony
 * ani workera) nie zawiera znacznika SEDNO-PRIVACY-CANARY-7f3a ani bajtów pliku. To samo dla localStorage,
 * sessionStorage i magazynu zdarzeń po stronie serwera. Kontrola pozytywna dowodzi, że nagrywanie działa.
 */
import { chromium, expect, test, type Browser } from '@playwright/test';
import { addClient, login, testEmail } from './account-helpers';
import { dumpPublicTables, eventNamesSince } from './db';
import { goToMonth, uploadFixture } from './flow-helpers';
import { startRecordingProxy, type ProxiedRequest } from './recording-proxy';

const CANARY = 'SEDNO-PRIVACY-CANARY-7f3a';
const FILE = 'synthetic-privacy-canary.csv';
/** Fragmenty pliku, które nie mogą wyjść z przeglądarki (opis posta, nagłówek, nazwa konta). */
const FILE_FRAGMENTS = [
  CANARY,
  'Metamorfoza brwi krok po kroku',
  'Identyfikator posta;Identyfikator konta',
  'sedno_canary_7f3a',
];

let proxy: Awaited<ReturnType<typeof startRecordingProxy>>;
let browser: Browser;

// Własna przeglądarka z proxy nagrywającym (bez wyjątku dla localhost), bo Playwright nie widzi ruchu workerów.
test.beforeEach(async () => {
  proxy = await startRecordingProxy();
  browser = await chromium.launch({ proxy: { server: proxy.server, bypass: '<-loopback>' } });
});

test.afterEach(async () => {
  await browser.close();
  await proxy.close();
});

async function newPage(baseURL: string | undefined) {
  const context = await browser.newContext({
    baseURL,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    acceptDownloads: true,
  });
  return context.newPage();
}

function leaks(records: ProxiedRequest[]) {
  const found: string[] = [];
  for (const r of records) {
    const url = decodeURIComponent(r.url);
    const body = r.body.toString('utf8') + r.body.toString('latin1');
    for (const fragment of FILE_FRAGMENTS) {
      if (url.includes(fragment) || body.includes(fragment)) found.push(`${r.method} ${r.url}: ${fragment}`);
    }
  }
  return found;
}

test('kontrola pozytywna: nagrywanie łapie znacznik wysłany ze strony i z Web Workera', async ({
  baseURL,
}) => {
  const page = await newPage(baseURL);
  const records = proxy.requests;
  await page.goto('/nowy');
  await page.evaluate(async (canary) => {
    await fetch('/__privacy-probe', { method: 'POST', body: canary }).catch(() => undefined);
    // Worker z blob: nie ma bazowego adresu strony, więc adres musi być bezwzględny.
    const target = `${location.origin}/__privacy-probe-worker`;
    const src = `fetch('${target}', { method: 'POST', body: '${canary}' }).finally(() => postMessage('ok'))`;
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    await new Promise((resolve) => (worker.onmessage = resolve));
  }, CANARY);
  await expect.poll(() => leaks(records).some((l) => l.includes('/__privacy-probe-worker'))).toBe(true);
  expect(leaks(records).some((l) => /\/__privacy-probe:/.test(l))).toBe(true);
});

test('plik nie opuszcza przeglądarki: cały przepływ /nowy, PDF i lista oczekujących', async ({ baseURL }) => {
  const page = await newPage(baseURL);
  const records = proxy.requests;
  const startedAt = new Date(Date.now() - 1000);

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
  await page.getByLabel('Adres e-mail').first().fill(`test-prywatnosci-${Date.now()}@example.com`);
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Zapisz mnie na listę' }).first().click();
  await expect(page.getByText('Zapisano na listę').first()).toBeVisible();

  // Żadne żądanie nie niosło pliku; największe ciało żądania jest małe (tylko liczby); nic poza aplikacją.
  await page.waitForLoadState('networkidle');
  expect(records.length).toBeGreaterThan(10);
  expect(leaks(records)).toEqual([]);
  expect(proxy.tunnels).toEqual([]);
  const origin = new URL(baseURL!).origin;
  expect(records.filter((r) => !r.url.startsWith(origin)).map((r) => r.url)).toEqual([]);
  const largestPost = Math.max(0, ...records.map((r) => r.body.length));
  expect(largestPost).toBeLessThan(4096);

  // Baza (Supabase) po stronie serwera: zdarzenia są, treści pliku nie ma w żadnej tabeli.
  const names = await eventNamesSince(startedAt);
  for (const name of [
    'landing_cta_click',
    'csv_parsed',
    'report_previewed',
    'pdf_downloaded',
    'waitlist_joined',
  ]) {
    expect(names, name).toContain(name);
  }
  const dump = await dumpPublicTables();
  for (const fragment of FILE_FRAGMENTS) expect(dump).not.toContain(fragment);
});

test('plik nie opuszcza przeglądarki z kontem: edytor, zapis szkicu, link, raport publiczny i PDF', async ({
  baseURL,
}, info) => {
  const context = await browser.newContext({
    baseURL,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    acceptDownloads: true,
    extraHTTPHeaders: { 'X-Forwarded-For': `198.51.200.${10 + info.workerIndex}` },
  });
  const page = await context.newPage();
  const records = proxy.requests;
  const email = testEmail('prywatnosc', info.workerIndex);

  await login(page, email);
  await page.goto('/app/klienci?m=2026-09');
  await addClient(page, 'Studio Lumi');
  await page.getByRole('link', { name: 'Wgraj eksport: Studio Lumi' }).click();
  await uploadFixture(page, FILE);
  await expect(page.getByText(/Wczytano 31 publikacji z września/)).toBeVisible();
  await page.getByLabel('Kliknięcia „Zarezerwuj”', { exact: true }).fill('23');
  await page.getByLabel('Kliknięcia „Zadzwoń”', { exact: true }).fill('9');
  await page.getByLabel('Kliknięcia „Wyznacz trasę”', { exact: true }).fill('14');
  await page.getByLabel('Co zadziałało').fill('Najwięcej rezerwacji przyszło po rolkach z metamorfozami.');
  await page.getByRole('button', { name: 'Zapisz szkic' }).click();
  await expect(page.getByText('Szkic zapisany')).toBeVisible();
  await page.getByRole('button', { name: 'Przejdź do wysyłki' }).click();
  await page.getByRole('button', { name: 'Utwórz link' }).click();
  await expect(page.getByText('Link utworzony')).toBeVisible();
  const url = await page.getByRole('textbox', { name: 'Adres linku' }).inputValue();

  // Raport publiczny i PDF w osobnym kontekście (klient bez konta).
  const visitorContext = await browser.newContext({ baseURL, acceptDownloads: true, locale: 'pl-PL' });
  const visitor = await visitorContext.newPage();
  await visitor.goto(url);
  const download = visitor.waitForEvent('download');
  await visitor.getByRole('button', { name: 'Pobierz PDF' }).click();
  await (await download).path();
  await expect(visitor.getByText('PDF pobrany')).toBeVisible();

  const storage = await page.evaluate(
    () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
  );
  for (const fragment of FILE_FRAGMENTS) expect(storage).not.toContain(fragment);

  await page.waitForLoadState('networkidle');
  expect(leaks(records)).toEqual([]);
  expect(proxy.tunnels).toEqual([]);
  // Poza aplikacją przeglądarka odwiedza tylko adres z e-maila (weryfikacja linku w Supabase Auth).
  const origin = new URL(baseURL!).origin;
  const outside = records.filter((r) => !r.url.startsWith(origin)).map((r) => new URL(r.url).pathname);
  expect(outside.every((p) => p === '/auth/v1/verify')).toBe(true);
  // Zapis szkicu niesie tylko ReportData (liczby i komentarz), nie wiersze pliku.
  const largestPost = Math.max(0, ...records.map((r) => r.body.length));
  expect(largestPost).toBeLessThan(16_384);

  const dump = await dumpPublicTables();
  for (const fragment of FILE_FRAGMENTS) expect(dump).not.toContain(fragment);
  expect(dump).toContain('Najwięcej rezerwacji przyszło po rolkach');
  await visitorContext.close();
  await context.close();
});
