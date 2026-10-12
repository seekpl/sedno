// @vitest-environment jsdom
/**
 * Strona główna (PROMPT.md §12, docs/decisions.md p. 17): teksty decyzji dosłownie, ceny z config/pricing.ts,
 * Solo i Studio „Wkrótce” bez zmyślonej plakietki, „Powiadom mnie o starcie” tylko z działającą listą,
 * szablon „Dostępne” tylko z adresem, słowa zakazane, oznaczenie danych przykładowych, CTA z ?src=,
 * żadnej obietnicy linku, jeden h1 i hierarchia nagłówków, brak martwych przycisków.
 *
 * Strona czyta flagi przy wczytaniu modułu (templateUrl) i przy renderowaniu (waitlistEnabled), więc każdy
 * test wczytuje moduły od nowa (vi.resetModules) i renderuje je tą samą kopią Reacta do statycznego HTML.
 */
import type { ComponentType } from 'react';
import { within } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatPrice } from '@/config/pricing';
import { EVENT_SCHEMAS } from '@/lib/analytics/events';
import { cspModeFor } from '@/lib/security/csp';

// data-next-link odróżnia nawigację po stronie klienta (next/link) od zwykłego <a> (pełne wczytanie).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-next-link="" {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/app/actions/waitlist', () => ({ joinWaitlist: vi.fn() }));
vi.mock('@/lib/analytics/client', () => ({ getAnonId: () => '', track: vi.fn() }));

const STORE_ENV = ['SEDNO_DEV_STORE_DIR', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const TEMPLATE = 'https://example.com/szablon-raportu';

type Env = Partial<Record<(typeof STORE_ENV)[number] | 'NEXT_PUBLIC_TEMPLATE_URL', string>>;

/** Strona główna w układzie strony (nagłówek, stopka), wczytana od nowa z podanymi zmiennymi. */
async function renderLanding(env: Env = {}, mock?: () => Promise<unknown>): Promise<HTMLElement> {
  vi.resetModules();
  await mock?.();
  for (const key of [...STORE_ENV, 'NEXT_PUBLIC_TEMPLATE_URL'] as const) vi.stubEnv(key, env[key] ?? '');
  const [{ renderToStaticMarkup }, { createElement }, layout, page] = await Promise.all([
    import('react-dom/server'),
    import('react'),
    import('@/app/(marketing)/layout'),
    import('@/app/(marketing)/page'),
  ]);
  const Layout = layout.default as ComponentType<{ children: React.ReactNode }>;
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(createElement(Layout, null, createElement(page.default)));
  document.body.replaceChildren(container);
  return container;
}

/** Cały widoczny tekst i etykiety dostępności (granice elementów jako spacje). */
function allText(root: HTMLElement): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent ?? '');
  root.querySelectorAll('[aria-label], [title], [alt]').forEach((el) => {
    for (const attr of ['aria-label', 'title', 'alt']) parts.push(el.getAttribute(attr) ?? '');
  });
  return parts.join(' ');
}

function card(root: HTMLElement, heading: string): HTMLElement {
  const el = within(root).getByRole('heading', { name: heading }).closest('.sd-card');
  if (!(el instanceof HTMLElement)) throw new Error(`Brak karty „${heading}”`);
  return el;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00+02:00'), toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.doUnmock('@/config/pricing');
  document.body.replaceChildren();
});

describe('strona główna: teksty decyzji 17', () => {
  it('hero, linia prywatności, cennik, FAQ i karta marki mają teksty dosłownie', async () => {
    const root = await renderLanding();
    const q = within(root);
    expect(q.getByRole('heading', { level: 1 }).textContent).toBe('Raport, który klient rozumie');
    q.getByText(
      'Wgrywasz eksport z Meta Business Suite, dopisujesz trzy liczby i pobierasz PDF dla klienta. Na górze raportu: ile osób chciało zadzwonić, dojechać i się umówić.',
    );
    q.getByText('Bez zakładania konta. Plik zostaje w Twojej przeglądarce.');
    expect(allText(root)).toContain('Teraz: za darmo, PDF ze stopką »Przygotowano w Sedno«.');
    q.getByText('Czy mogę wysłać klientowi link?');
    expect(
      within(card(root, 'Twoja marka na raporcie')).getByText('Wkrótce w planie Solo').className,
    ).toContain('sd-badge');
  });

  it('linia prywatności ma ikonę kłódki, a krok 3 to tylko „Pobierz PDF”', async () => {
    const root = await renderLanding();
    const privacy = within(root).getByText('Bez zakładania konta. Plik zostaje w Twojej przeglądarce.');
    expect(privacy.className).toContain('sd-privacy');
    expect(privacy.querySelector('svg.sd-icon[aria-hidden="true"]')).not.toBeNull();
    const flow = within(root).getByRole('list', { name: 'Jak powstaje raport' });
    const steps = within(flow).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[2]!.textContent).toContain('3. Pobierz PDF');
    expect(steps[2]!.textContent).not.toMatch(/link/i);
  });

  it('pierwsze pytanie FAQ jest otwarte, pozostałe zamknięte; kontakt prowadzi do /kontakt', async () => {
    const root = await renderLanding();
    const questions = within(root)
      .getAllByText(/\?$/, { selector: 'summary' })
      .map((s) => s.closest('details')!);
    expect(questions.length).toBeGreaterThanOrEqual(4);
    expect(questions.map((d) => d.hasAttribute('open'))).toEqual(questions.map((_, i) => i === 0));
    expect(within(root).getByRole('link', { name: 'Napisz do nas' }).getAttribute('href')).toBe('/kontakt');
  });

  it('pas CTA podaje ostatni pełny miesiąc', async () => {
    let root = await renderLanding();
    within(root).getByRole('heading', { name: 'Zrób klientowi raport za wrzesień jeszcze dziś' });
    vi.setSystemTime(new Date('2027-01-05T10:00:00+01:00'));
    root = await renderLanding();
    within(root).getByRole('heading', { name: 'Zrób klientowi raport za grudzień jeszcze dziś' });
  });

  it('strona jest statyczna i odświeża się co godzinę', async () => {
    vi.resetModules();
    const page = await import('@/app/(marketing)/page');
    expect(page.revalidate).toBe(3600);
    expect(page.metadata.alternates?.canonical).toBe('/');
    expect(page.metadata.description).toBeTruthy();
  });
});

describe('cennik', () => {
  it('kwoty i limity pochodzą z config/pricing.ts', async () => {
    const root = await renderLanding({}, () => {
      vi.doMock('@/config/pricing', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@/config/pricing')>();
        return {
          ...actual,
          VAT_RATE: 0.08,
          SINGLE_REPORT: { netPrice: 13 },
          PLANS: {
            free: { name: 'Na start', netMonthly: 0, clients: 1 },
            solo: { name: 'Solo', netMonthly: 57, clients: 7 },
            studio: { name: 'Studio', netMonthly: 123, clients: 31 },
          },
        };
      });
      return import('@/config/pricing');
    });
    const price = (name: string) => card(root, name).querySelector('p.sd-num')?.textContent;
    expect(price('Na start')).toBe(formatPrice(0));
    expect(price('Solo')).toBe(formatPrice(57));
    expect(price('Studio')).toBe(formatPrice(123));
    expect(card(root, 'Solo').textContent).toContain('netto / miesiąc · do 7 klientów');
    expect(card(root, 'Studio').textContent).toContain('do 31 klientów');
    const text = allText(root);
    expect(text).toContain(`Wkrótce także pojedynczy raport bez abonamentu: ${formatPrice(13)} netto.`);
    expect(text).toContain('doliczamy 8% VAT');
    // Ceny z prawdziwej konfiguracji nie są nigdzie wpisane na sztywno.
    expect(text).not.toContain(formatPrice(49));
    expect(text).not.toContain(formatPrice(99));
  });

  it('Solo i Studio mają plakietkę „Wkrótce”, nikt nie jest „Najczęściej wybierany”', async () => {
    const root = await renderLanding();
    for (const name of ['Solo', 'Studio']) {
      const badge = within(card(root, name)).getByText('Wkrótce');
      expect(badge.className).toContain('sd-badge');
    }
    expect(within(card(root, 'Na start')).queryByText('Wkrótce')).toBeNull();
    expect(allText(root)).not.toMatch(/najczęściej wybierany/i);
  });

  it('plan Na start prowadzi do narzędzia z ?src=pricing', async () => {
    const root = await renderLanding();
    const cta = within(card(root, 'Na start')).getByRole('link', { name: 'Zrób pierwszy raport' });
    expect(cta.getAttribute('href')).toBe('/nowy?src=pricing');
  });

  it('bez magazynu listy nie ma „Powiadom mnie o starcie” ani formularza (żadnego martwego przycisku)', async () => {
    const root = await renderLanding();
    expect(within(root).queryByText('Powiadom mnie o starcie')).toBeNull();
    expect(root.querySelector('form')).toBeNull();
    expect(root.querySelectorAll('button')).toHaveLength(0);
  });

  it('sam adres Supabase bez klucza serwisowego nie włącza listy', async () => {
    const root = await renderLanding({ NEXT_PUBLIC_SUPABASE_URL: 'https://xyz.supabase.co' });
    expect(within(root).queryByText('Powiadom mnie o starcie')).toBeNull();
  });

  it.each([
    ['plikowy magazyn deweloperski', { SEDNO_DEV_STORE_DIR: '/tmp/sedno-test-store' }],
    [
      'Supabase z kluczem serwisowym',
      { NEXT_PUBLIC_SUPABASE_URL: 'https://xyz.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'klucz' },
    ],
  ])('z działającą listą (%s) Solo i Studio mają rozwijane „Powiadom mnie o starcie”', async (_, env) => {
    const root = await renderLanding(env);
    for (const plan of ['Solo', 'Studio']) {
      const planCard = card(root, plan);
      const summary = within(planCard).getByText('Powiadom mnie o starcie');
      expect(summary.tagName).toBe('SUMMARY');
      expect(summary.className).toContain('sd-btn');
      const details = summary.closest('details')!;
      expect(details.hasAttribute('open')).toBe(false);
      within(details).getByRole('form', { name: `Lista oczekujących na plan ${plan}` });
    }
    expect(within(card(root, 'Na start')).queryByText('Powiadom mnie o starcie')).toBeNull();
    // Jedyne przyciski na stronie to „Zapisz mnie na listę” w formularzach.
    const buttons = [...root.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Zapisz mnie na listę', 'Zapisz mnie na listę']);
  });
});

describe('darmowe narzędzia', () => {
  it('bez NEXT_PUBLIC_TEMPLATE_URL szablon jest „Wkrótce” bez linku', async () => {
    const root = await renderLanding();
    const template = card(root, 'Szablon raportu z Instagrama dla klienta');
    within(template).getByText('Wkrótce');
    expect(within(template).queryByText('Dostępne')).toBeNull();
    expect(template.querySelector('a')).toBeNull();
    expect(within(root).queryByRole('link', { name: 'Pobierz szablon' })).toBeNull();
  });

  it('z NEXT_PUBLIC_TEMPLATE_URL szablon jest „Dostępne” z linkiem', async () => {
    const root = await renderLanding({ NEXT_PUBLIC_TEMPLATE_URL: TEMPLATE });
    const template = card(root, 'Szablon raportu z Instagrama dla klienta');
    const badge = within(template).getByText('Dostępne');
    expect(badge.className).toContain('sd-badge--success');
    expect(badge.querySelector('svg')).not.toBeNull();
    const link = within(template).getByRole('link', { name: 'Pobierz szablon' });
    expect(link.getAttribute('href')).toBe(TEMPLATE);
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('kalkulator wyceny jest zawsze „Wkrótce” bez linku', async () => {
    for (const env of [{}, { NEXT_PUBLIC_TEMPLATE_URL: TEMPLATE }]) {
      const root = await renderLanding(env);
      const calculator = card(root, 'Kalkulator wyceny prowadzenia profilu');
      within(calculator).getByText('Wkrótce');
      expect(calculator.querySelector('a')).toBeNull();
    }
  });
});

describe('uczciwość i dostępność', () => {
  const FORBIDDEN: [string, RegExp][] = [
    ['AI', /\bAI\b/],
    ['magia', /\bmagi[aięą]/i],
    ['rewolucja', /rewolucj/i],
    ['w 5 minut', /w\s*5\s*minut/i],
    ['100%', /100\s*%/],
    ['gwarantujemy', /gwarant/i],
    ['najlepszy', /najlepsz/i],
    ['Insta', /\binsta(?!gram)/i],
    ['Gram', /\bgram\b/i],
    ['oficjalny partner', /oficjaln\w*\s+partner/i],
    ['hack', /\bhack/i],
    ['viral', /\bviral/i],
  ];

  it.each([
    ['bez list i szablonu', {}],
    [
      'z listą i szablonem',
      { SEDNO_DEV_STORE_DIR: '/tmp/sedno-test-store', NEXT_PUBLIC_TEMPLATE_URL: TEMPLATE },
    ],
  ])('nie ma słów zakazanych (%s)', async (_, env) => {
    const text = allText(await renderLanding(env));
    for (const [word, pattern] of FORBIDDEN) expect(text, word).not.toMatch(pattern);
  });

  it('nie obiecuje linku do raportu ani „Kopiuj link”', async () => {
    const text = allText(await renderLanding({ SEDNO_DEV_STORE_DIR: '/tmp/sedno-test-store' }));
    for (const phrase of [
      /kopiuj link/i,
      /link skopiowany/i,
      /wysyłasz klientowi link/i,
      /wyślij (klientowi )?link/i,
    ]) {
      expect(text).not.toMatch(phrase);
    }
  });

  it('każda liczba z przykładu stoi przy oznaczeniu „Dane przykładowe”', async () => {
    const root = await renderLanding();
    const labelled = (el: Element) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        if ([...a.children].some((c) => c.textContent === 'Dane przykładowe')) return true;
      }
      return false;
    };
    // Liczby w składzie Bricolage (sd-num), zakreślenia i cały raport na telefonie. Wyjątki: ceny i numery kroków.
    const numbers = [...root.querySelectorAll('.sd-num, .sd-circled, .sd-report')].filter(
      (el) => !el.closest('#cennik, #jak-to-dziala'),
    );
    expect(numbers.length).toBeGreaterThan(10);
    expect(numbers.filter((el) => !labelled(el)).map((el) => el.outerHTML.slice(0, 80))).toEqual([]);

    const phone = within(root).getByRole('figure', { name: 'Przykładowy raport na telefonie' });
    expect(phone.querySelector('.sd-report[data-theme="light"]')).not.toBeNull();
    for (const name of ['Typowy raport', 'Raport Sedno']) {
      const compare = within(root).getByText(name).closest('.sd-card')!;
      within(compare as HTMLElement).getByText('Dane przykładowe');
    }
  });

  it('CTA do narzędzia mają ?src= dozwolone w zdarzeniu landing_cta_click', async () => {
    const root = await renderLanding({ SEDNO_DEV_STORE_DIR: '/tmp/sedno-test-store' });
    const allowed = new Set<string>(EVENT_SCHEMAS.landing_cta_click.shape.cta.options);
    const toTool = [...root.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href')!)
      .filter((href) => href.startsWith('/nowy'));
    const sources = toTool.map((href) => {
      const url = new URL(href, 'http://localhost');
      expect(url.pathname).toBe('/nowy');
      expect([...url.searchParams.keys()]).toEqual(['src']);
      return url.searchParams.get('src')!;
    });
    for (const src of sources) expect(allowed.has(src), src).toBe(true);
    expect(new Set(sources)).toEqual(new Set(['header', 'menu', 'hero', 'pricing', 'cta-band']));
    // /nowy ma własną CSP (nonce, 'wasm-unsafe-eval' dla PDF, connect-src tylko 'self'), którą przeglądarka
    // bierze tylko przy pełnym wczytaniu dokumentu. Nawigacja next/link zostawiłaby CSP strony głównej i PDF
    // by nie powstał — więc linki do tras z nonce muszą być zwykłymi <a>.
    const soft = [...root.querySelectorAll('a[data-next-link]')]
      .map((a) => a.getAttribute('href')!)
      .filter((href) => cspModeFor(new URL(href, 'http://localhost').pathname) === 'nonce');
    expect(soft).toEqual([]);
    // Drugie CTA prowadzi do przykładu.
    expect(within(root).getByRole('link', { name: 'Zobacz przykładowy raport' }).getAttribute('href')).toBe(
      '/przyklad',
    );
  });

  it('ma jeden h1 i nagłówki bez przeskoków poziomów', async () => {
    const root = await renderLanding({ SEDNO_DEV_STORE_DIR: '/tmp/sedno-test-store' });
    const levels = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1]));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    levels.forEach((level, i) => {
      if (i > 0) expect(level, `nagłówek ${i}`).toBeLessThanOrEqual(levels[i - 1]! + 1);
    });
  });

  it('sekcje mają kotwice z nawigacji, a strona jest jasna', async () => {
    const root = await renderLanding();
    for (const id of ['jak-to-dziala', 'cennik', 'narzedzia'])
      expect(root.querySelector(`#${id}`)).not.toBeNull();
    expect(root.firstElementChild?.getAttribute('data-theme')).toBe('light');
  });
});
