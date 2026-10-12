import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Axe: zero naruszeń „serious” i „critical” (PROMPT.md §15). */
export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map(
      (v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 },
} as const;

/** Brak przewijania w poziomie (układ mieści się w szerokości ekranu). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

export type CspViolation = { directive: string; blocked: string; source: string };

/**
 * Zbiera zdarzenia securitypolicyviolation od pierwszej chwili ładowania strony (skrypt startowy
 * z Playwright nie podlega CSP strony). Odczyt: readCspViolations(page).
 */
export async function collectCspViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: { directive: string; blocked: string; source: string }[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile });
    });
  });
}

export async function readCspViolations(page: Page): Promise<CspViolation[]> {
  return page.evaluate(() => (window as unknown as { __csp?: CspViolation[] }).__csp ?? []);
}

/**
 * Znane zgłoszenie przy pierwszym PDF: yoga-layout (@react-pdf/renderer) próbuje fetch() własnego
 * WebAssembly z adresu data:, a przy connect-src 'self' przechodzi na dekodowanie w pamięci
 * (docs/decisions.md, p. 22). Tylko to jedno zgłoszenie jest dopuszczalne i tylko przy generowaniu PDF.
 */
export function isKnownPdfWasmViolation(v: CspViolation): boolean {
  return v.directive.startsWith('connect-src') && v.blocked === 'data';
}

export type RecordedRequest = { url: string; method: string; body: Buffer | null; type: string };

/** Nagrywa wszystkie żądania kontekstu przeglądarki (strony i workery) z treścią. */
export function recordRequests(context: import('@playwright/test').BrowserContext): RecordedRequest[] {
  const records: RecordedRequest[] = [];
  context.on('request', (req) => {
    records.push({
      url: req.url(),
      method: req.method(),
      body: req.postDataBuffer(),
      type: req.resourceType(),
    });
  });
  return records;
}

/** Plik testowy z tests/fixtures. */
export const fixture = (name: string) => new URL(`../fixtures/${name}`, import.meta.url).pathname;
