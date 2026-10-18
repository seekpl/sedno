/**
 * CSP według tras (docs/decisions.md, p. 16): każda trasa ładuje się bez zdarzeń securitypolicyviolation
 * i z właściwym nagłówkiem. Strony marketingowe: statyczna polityka z 'unsafe-inline'; /nowy: nonce
 * i 'strict-dynamic', connect-src tylko 'self'.
 */
import { expect, test } from '@playwright/test';
import { collectCspViolations, readCspViolations, VIEWPORTS } from './helpers';

const STATIC_ROUTES = [
  '/',
  '/przyklad',
  '/szablon',
  '/poradniki',
  '/poradniki/jak-zrobic-raport-z-instagrama-dla-klienta',
  '/prywatnosc',
  '/regulamin',
  '/kontakt',
  '/konto-usuniete',
];
const NONCE_ROUTES = ['/nowy'];

const directive = (csp: string, name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1);

for (const route of STATIC_ROUTES) {
  test(`${route}: statyczna CSP, bez naruszeń`, async ({ page }) => {
    await collectCspViolations(page);
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);
    const csp = res!.headers()['content-security-policy'] ?? '';
    expect(directive(csp, 'script-src')).toBe("'self' 'unsafe-inline'");
    expect(csp).not.toContain('nonce-');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(directive(csp, 'frame-ancestors')).toBe("'none'");
    expect(directive(csp, 'base-uri')).toBe("'none'");
    await page.waitForLoadState('networkidle');
    expect(await readCspViolations(page)).toEqual([]);
  });
}

for (const route of NONCE_ROUTES) {
  test(`${route}: CSP z nonce i strict-dynamic, connect-src tylko self, bez naruszeń`, async ({ page }) => {
    await collectCspViolations(page);
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);
    const csp = res!.headers()['content-security-policy'] ?? '';
    const script = directive(csp, 'script-src') ?? '';
    expect(script).toMatch(/^'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic' 'wasm-unsafe-eval'$/);
    expect(script).not.toContain("'unsafe-inline'");
    expect(directive(csp, 'connect-src')).toBe("'self'");
    // Nonce w nagłówku zgadza się z nonce skryptów strony; każde żądanie dostaje nowy.
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    const scriptNonces = await page
      .locator('script[nonce]')
      .evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
    expect(scriptNonces.length).toBeGreaterThan(0);
    for (const n of scriptNonces) expect(n).toBe(nonce);
    const second = await page.request.get(route);
    expect(second.headers()['content-security-policy']).not.toContain(nonce);
    await page.waitForLoadState('networkidle');
    expect(await readCspViolations(page)).toEqual([]);
  });
}

test('404: statyczna CSP, bez naruszeń', async ({ page }) => {
  await collectCspViolations(page);
  const res = await page.goto('/nie-ma-takiej-strony');
  expect(res?.status()).toBe(404);
  await page.waitForLoadState('networkidle');
  expect(await readCspViolations(page)).toEqual([]);
});

test('telefon: strona główna i /nowy bez naruszeń CSP', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await collectCspViolations(page);
  for (const route of ['/', '/nowy']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    expect(await readCspViolations(page), route).toEqual([]);
  }
});
