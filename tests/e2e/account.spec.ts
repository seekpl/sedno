/**
 * Faza 2, test e2e nr 3 (PROMPT.md §18): logowanie linkiem z e-maila (Mailpit zamiast skrzynki), klient,
 * raport z eksportu, link, otwarcie /r/[token] w nowym kontekście bez sesji, wyłączenie linku i komunikat.
 * Do tego: drugi użytkownik nie widzi cudzych danych, /app bez sesji prowadzi do logowania i wraca,
 * Ustawienia (nazwa, logo na raporcie publicznym, eksport danych, usunięcie konta) i historia.
 */
import { expect, test, type Page } from '@playwright/test';
import { addClient, closeAll, login, newAccountContext, testEmail } from './account-helpers';
import { query } from './db';
import { uploadFixture } from './flow-helpers';

const MONTH = '2026-09';
const EXPIRED = 'Ten raport nie jest już dostępny. Poproś osobę, która go wysłała, o nowy link.';
const LOGO = new URL('../../public/icon-192.png', import.meta.url).pathname;

/** Edytor: plik, trzy liczby efektów, zapis szkicu. */
async function fillReport(page: Page) {
  await uploadFixture(page, 'synthetic-pl-semicolon-bom.csv');
  await expect(page.getByText('Wczytano 31 publikacji z września')).toBeVisible();
  await page.getByLabel('Kliknięcia „Zarezerwuj”', { exact: true }).fill('23');
  await page.getByLabel('Kliknięcia „Zadzwoń”', { exact: true }).fill('9');
  await page.getByLabel('Kliknięcia „Wyznacz trasę”', { exact: true }).fill('14');
  await page.getByLabel('Co zadziałało').fill('Najwięcej rezerwacji przyszło po rolkach z metamorfozami.');
  await page.getByRole('button', { name: 'Zapisz szkic' }).click();
  await expect(page.getByText('Szkic zapisany')).toBeVisible();
}

/** Z kroku wysyłki: nowy link i jego adres. */
async function createLink(page: Page) {
  await page.getByRole('button', { name: 'Utwórz link' }).click();
  await expect(page.getByText('Link utworzony')).toBeVisible();
  const url = await page.getByRole('textbox', { name: 'Adres linku' }).inputValue();
  expect(url).toMatch(/^http:\/\/localhost:3100\/r\/[0-9A-Za-z]{22}$/);
  return url;
}

test('logowanie, klient, raport, link otwarty bez logowania, wyłączenie linku', async ({
  browser,
  baseURL,
}, info) => {
  const owner = await newAccountContext(browser, baseURL, info.workerIndex);
  const visitor = await browser.newContext({ baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  const page = await owner.newPage();
  const email = testEmail('wlasciciel', info.workerIndex);

  const mail = await login(page, email);
  expect(mail.subject).toBe('Twój link do logowania w Sedno');
  expect(mail.html).toContain('lang="pl"');

  // Panel klientów za wrzesień i nowy klient.
  await page.goto(`/app/klienci?m=${MONTH}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Klienci we wrześniu' })).toBeVisible();
  await addClient(page, 'Studio Lumi');
  await page.getByRole('link', { name: 'Wgraj eksport: Studio Lumi' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Raport: Studio Lumi, wrzesień' })).toBeVisible();

  // Raport: plik, efekty, szkic zapisany w bazie (tylko ReportData).
  await fillReport(page);
  const [saved] = await query<{ status: string; data: { actions: { bookings: number } } }>(
    `select r.status, r.data from public.reports r join auth.users u on u.id = r.owner_id
      where u.email = $1 and r.period = '2026-09-01'`,
    [email],
  );
  expect(saved?.status).toBe('draft');
  expect(JSON.stringify(saved?.data)).toContain('23');

  // Wysyłka: link.
  await page.getByRole('button', { name: 'Przejdź do wysyłki' }).click();
  const url = await createLink(page);

  // Klient otwiera link w innym kontekście, bez sesji: raport jasny, jedno h1.
  const client = await visitor.newPage();
  const opened = await client.goto(url);
  expect(opened?.status()).toBe(200);
  await expect(client.locator('h1')).toHaveCount(1);
  await expect(client.getByRole('heading', { level: 1 })).toContainText('23');
  await expect(
    client.locator('.sd-report[data-theme="light"], [data-theme="light"] .sd-report').first(),
  ).toBeVisible();
  expect(await client.title()).toContain('Studio Lumi');
  const robots = await client.locator('meta[name="robots"]').getAttribute('content');
  expect(robots).toContain('noindex');

  // Wyłączenie linku (z potwierdzeniem) i komunikat pod starym adresem.
  await page.getByRole('button', { name: 'Wyłącz link' }).click();
  const confirm = page.getByRole('dialog', { name: 'Wyłączyć link?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Wyłącz link' }).click();
  await expect(page.getByText('Link wyłączony')).toBeVisible();
  const revoked = await client.reload();
  expect(revoked?.status()).toBe(404);
  await expect(client.getByRole('heading', { level: 1 })).toHaveText(EXPIRED);

  // Oznaczenie jako wysłany i stan w panelu oraz historii.
  await page.getByRole('button', { name: 'Oznacz jako wysłany' }).click();
  await expect(page.getByText('Raport dla Studio Lumi wysłany')).toBeVisible();
  await page.goto(`/app/klienci?m=${MONTH}`);
  await expect(page.getByText('1 z 1 raportu wysłane.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Otwórz raport: Studio Lumi' })).toBeVisible();
  await page.goto('/app/raporty');
  await expect(page.getByRole('heading', { level: 1, name: 'Raporty' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Raporty, od najnowszego miesiąca' });
  await expect(table.getByText('Studio Lumi', { exact: true })).toBeVisible();
  await expect(table.getByText('Wyłączony', { exact: true })).toBeVisible();

  await closeAll(owner, visitor);
});

test('drugi użytkownik nie widzi cudzego klienta ani raportu', async ({ browser, baseURL }, info) => {
  const alice = await newAccountContext(browser, baseURL, info.workerIndex);
  const bob = await newAccountContext(browser, baseURL, info.workerIndex);
  const a = await alice.newPage();
  const b = await bob.newPage();
  await login(a, testEmail('alicja', info.workerIndex));
  await a.goto(`/app/klienci?m=${MONTH}`);
  await addClient(a, 'Bistro Pod Lipą');
  await a.getByRole('link', { name: 'Wgraj eksport: Bistro Pod Lipą' }).click();
  await expect(a.getByRole('heading', { level: 1 })).toContainText('Bistro Pod Lipą');
  const editorUrl = a.url();

  await login(b, testEmail('bartek', info.workerIndex));
  await b.goto(`/app/klienci?m=${MONTH}`);
  await expect(b.getByText('Bistro Pod Lipą')).toHaveCount(0);
  // Cudzy klient wygląda jak nieistniejący (RLS). Edytor ma loading.tsx, więc notFound() przychodzi
  // w strumieniu — sprawdzamy treść, nie kod odpowiedzi.
  await b.goto(editorUrl);
  await expect(b.getByRole('heading', { level: 1, name: 'Tego nie ma na Twoim koncie' })).toBeVisible();
  await expect(b.getByText('Bistro Pod Lipą')).toHaveCount(0);
  await b.goto('/app/raporty');
  await expect(b.getByText('Bistro Pod Lipą')).toHaveCount(0);

  await closeAll(alice, bob);
});

test('/app bez sesji prowadzi do logowania, a po linku wraca pod ten sam adres', async ({
  browser,
  baseURL,
}, info) => {
  const context = await newAccountContext(browser, baseURL, info.workerIndex);
  const page = await context.newPage();
  await page.goto(`/app/raporty`);
  await expect(page).toHaveURL(/\/logowanie\?next=%2Fapp%2Fraporty$/);
  const email = testEmail('powrot', info.workerIndex);
  const since = new Date(Date.now() - 1000);
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByRole('button', { name: 'Wyślij link' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sprawdź skrzynkę' })).toBeVisible();
  const { waitForLoginLink } = await import('./mail');
  const mail = await waitForLoginLink(email, since);
  await page.goto(mail.link);
  await expect(page).toHaveURL(/\/app\/raporty$/);

  // Link działa raz: drugie otwarcie wraca do logowania z wyjaśnieniem.
  const other = await newAccountContext(browser, baseURL, info.workerIndex);
  const second = await other.newPage();
  await second.goto(mail.link);
  await expect(second).toHaveURL(/\/logowanie\?blad=link/);
  await expect(second.getByRole('alert').filter({ hasText: 'Link do logowania nie działa' })).toBeVisible();

  // Wylogowanie kończy sesję.
  await page.goto('/app/ustawienia');
  await page.getByRole('button', { name: 'Wyloguj się' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/app/klienci');
  await expect(page).toHaveURL(/\/logowanie/);

  await closeAll(context, other);
});

test('Ustawienia: nazwa i logo na raporcie publicznym, eksport danych, usunięcie konta', async ({
  browser,
  baseURL,
}, info) => {
  const context = await newAccountContext(browser, baseURL, info.workerIndex);
  const visitor = await browser.newContext({ baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  const page = await context.newPage();
  const email = testEmail('ustawienia', info.workerIndex);
  await login(page, email);

  await page.goto('/app/ustawienia');
  await page.getByLabel('Nazwa na raporcie').fill('Kadr Social');
  await page.getByRole('button', { name: 'Zapisz' }).first().click();
  await expect(page.getByText('Zapisano')).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(LOGO);
  await expect(page.getByText('Logo wgrane')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Twoje logo' })).toBeVisible();

  // Raport z logo i nazwą autora, link otwarty bez sesji pokazuje logo z /r/{token}/logo.
  await page.goto(`/app/klienci?m=${MONTH}`);
  await addClient(page, 'Fizjo Ruch');
  await page.getByRole('link', { name: 'Wgraj eksport: Fizjo Ruch' }).click();
  await fillReport(page);
  await expect(page.getByText('Autor na raporcie: Kadr Social, z Twoim logo.')).toBeVisible();
  await page.getByRole('button', { name: 'Przejdź do wysyłki' }).click();
  const url = await createLink(page);
  const client = await visitor.newPage();
  await client.goto(url);
  // Logo zastępuje nazwę autora; nazwa zostaje tekstem alternatywnym obrazka.
  const logo = client.getByRole('img', { name: 'Kadr Social' }).first();
  await expect(logo).toBeVisible();
  expect(await logo.getAttribute('src')).toMatch(new RegExp(`^${new URL(url).pathname}/logo`));
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // Eksport danych: JSON tylko z własnymi danymi.
  await page.goto('/app/ustawienia');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Pobierz dane (JSON)' }).click();
  const file = await (await download).path();
  const { readFileSync } = await import('node:fs');
  const exported = readFileSync(file, 'utf8');
  expect(exported).toContain('Fizjo Ruch');
  expect(exported).toContain('Kadr Social');
  expect(exported).not.toContain('Studio Lumi');

  // Usunięcie konta: potwierdzenie słowem „usuń”, wszystko znika, link przestaje działać.
  await page.getByRole('button', { name: 'Usuń konto' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Usunąć konto i wszystkie dane?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill('usuń');
  await dialog.getByRole('button', { name: 'Usuń konto i dane' }).click();
  await expect(page).toHaveURL(/\/konto-usuniete$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Konto usunięte' })).toBeVisible();
  expect(await query('select 1 from auth.users where email = $1', [email])).toEqual([]);
  const gone = await client.reload();
  expect(gone?.status()).toBe(404);
  await page.goto('/app/klienci');
  await expect(page).toHaveURL(/\/logowanie/);

  await closeAll(context, visitor);
});
