/**
 * Wspólne kroki testów e2e z kontem (Faza 2): logowanie linkiem z e-maila (Mailpit lokalnego stosu),
 * dodanie klienta, wejście do edytora. Nazwy kontrolek jak w lib/copy/{auth,panel,editor}.ts.
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { waitForLoginLink } from './mail';

let ipCounter = 0;

/**
 * Nowy kontekst z własnym adresem IP w X-Forwarded-For (limity próśb o link liczone są na IP i adres),
 * żeby równoległe testy nie wyczerpywały wspólnego limitu.
 */
export async function newAccountContext(browser: Browser, baseURL: string | undefined, workerIndex = 0) {
  ipCounter += 1;
  return browser.newContext({
    baseURL,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    acceptDownloads: true,
    extraHTTPHeaders: { 'X-Forwarded-For': `198.51.${100 + (workerIndex % 50)}.${ipCounter % 250}` },
  });
}

/** Unikalny adres testowy (Mailpit przyjmuje każdy). */
export function testEmail(label: string, workerIndex = 0) {
  return `e2e-${label}-${Date.now()}-${workerIndex}@example.com`;
}

/** Logowanie linkiem: prośba, e-mail w Mailpit, kliknięcie w tym samym kontekście (PKCE), panel klientów. */
export async function login(page: Page, email: string) {
  await page.goto('/logowanie');
  await expect(page.getByRole('heading', { level: 1, name: 'Zaloguj się' })).toBeVisible();
  const since = new Date(Date.now() - 1000);
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByRole('button', { name: 'Wyślij link' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sprawdź skrzynkę' })).toBeVisible();
  const mail = await waitForLoginLink(email, since);
  await page.goto(mail.link);
  await expect(page).toHaveURL(/\/app\/klienci/);
  return mail;
}

/** Dodaje klienta z panelu (dialog „Dodaj klienta”) i czeka na komunikat. */
export async function addClient(page: Page, name: string) {
  await page.getByRole('button', { name: 'Dodaj klienta' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Dodaj klienta' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Nazwa klienta').fill(name);
  await dialog.getByRole('button', { name: 'Dodaj klienta' }).click();
  await expect(page.getByText('Klient dodany')).toBeVisible();
  await expect(dialog).toBeHidden();
}

export async function closeAll(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((c) => c.close()));
}
