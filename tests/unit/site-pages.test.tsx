// @vitest-environment jsdom
/**
 * Pozostałe strony marketingowe i SEO (PROMPT.md §10, §12, §15): /przyklad, /szablon, strony prawne (szkice
 * z noindex), poradniki (szkic MDX z kotwicami, planowane tytuły bez stron), 404, metadane każdej strony,
 * robots.txt, sitemap.xml i manifest.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ComponentType } from 'react';
import type { Metadata } from 'next';
import { within } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GUIDES, PLANNED_GUIDES } from '@/content/poradniki';
import { tokens } from '@/lib/brand/tokens.generated';
import { legalPages } from '@/lib/copy/legal-pages';
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

type PageModule = { default: ComponentType; metadata?: Metadata };

const PAGES = {
  '/': () => import('@/app/(marketing)/page'),
  '/przyklad': () => import('@/app/(marketing)/przyklad/page'),
  '/szablon': () => import('@/app/(marketing)/szablon/page'),
  '/poradniki': () => import('@/app/(marketing)/poradniki/page'),
  '/prywatnosc': () => import('@/app/(marketing)/prywatnosc/page'),
  '/regulamin': () => import('@/app/(marketing)/regulamin/page'),
  '/kontakt': () => import('@/app/(marketing)/kontakt/page'),
} satisfies Record<string, () => Promise<PageModule>>;

const LEGAL = ['/prywatnosc', '/regulamin', '/kontakt'] as const;

/** Strona wczytana od nowa (flagi czytane przy wczytaniu modułu) i wyrenderowana do statycznego HTML. */
async function renderPage(load: () => Promise<PageModule>, env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_TEMPLATE_URL', '');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const [{ renderToStaticMarkup }, { createElement }, page] = await Promise.all([
    import('react-dom/server'),
    import('react'),
    load(),
  ]);
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(createElement(page.default));
  document.body.replaceChildren(container);
  return { root: container, q: within(container), metadata: page.metadata };
}

afterEach(() => {
  vi.unstubAllEnvs();
  document.body.replaceChildren();
});

describe('/przyklad', () => {
  it('raport na danych przykładowych z oznaczeniem i CTA do narzędzia (bez przycisku PDF)', async () => {
    const { root, q } = await renderPage(PAGES['/przyklad']);
    expect(q.getByRole('heading', { level: 1 }).textContent).toBe('Przykładowy raport');
    q.getByText('Dane przykładowe');
    const report = q.getByRole('region', { name: 'Przykładowy raport dla klienta' });
    expect(report.querySelector('.sd-report[data-theme="light"]')).not.toBeNull();
    // Raport jest częścią strony: jego tytuł to h2, a h1 jest jeden.
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    within(report).getByRole('heading', { level: 2, name: '23 osoby chciały się umówić' });
    expect(q.getByRole('link', { name: 'Zrób własny raport' }).getAttribute('href')).toBe(
      '/nowy?src=example',
    );
    expect(root.querySelectorAll('button')).toHaveLength(0);
    expect(q.queryByText('Pobierz PDF')).toBeNull();
    // Faza 1: klient dostaje PDF — strona nie obiecuje wersji na telefon ani linku (decyzja 17).
    expect(root.textContent).toContain('PDF ma ten sam układ na arkuszu A4');
    expect(root.textContent).not.toMatch(/na telefonie|\blink/i);
  });
});

describe('/szablon', () => {
  it('bez adresu: „Wkrótce” i żadnego linku', async () => {
    const { root, q } = await renderPage(PAGES['/szablon']);
    q.getByRole('heading', { level: 1, name: 'Szablon raportu z Instagrama dla klienta' });
    q.getByText('Wkrótce');
    expect(q.queryByText('Dostępne')).toBeNull();
    expect(root.querySelector('a')).toBeNull();
  });

  it('z NEXT_PUBLIC_TEMPLATE_URL: „Dostępne” i link zewnętrzny', async () => {
    const url = 'https://example.com/szablon';
    const { q } = await renderPage(PAGES['/szablon'], { NEXT_PUBLIC_TEMPLATE_URL: url });
    expect(q.getByText('Dostępne').className).toContain('sd-badge--success');
    const link = q.getByRole('link', { name: 'Pobierz szablon' });
    expect(link.getAttribute('href')).toBe(url);
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('strony prawne', () => {
  it.each(LEGAL)('%s: szkic z miejscami do uzupełnienia, informacją o szkicu i noindex', async (route) => {
    const { root, q, metadata } = await renderPage(PAGES[route]);
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    q.getByText(legalPages.draftNotice);
    expect(root.textContent).toContain('[DO UZUPEŁNIENIA');
    expect(metadata?.robots).toMatchObject({ index: false });
    expect(metadata?.alternates?.canonical).toBe(route);
  });

  it('polityka prywatności opisuje, że plik nie trafia na serwer', async () => {
    const { root } = await renderPage(PAGES['/prywatnosc']);
    expect(root.textContent).toContain('Nie wysyłamy go na serwer');
  });
});

describe('poradniki', () => {
  it('lista: szkic artykułu z linkiem i planowane tytuły bez linków', async () => {
    const { root, q } = await renderPage(PAGES['/poradniki']);
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    for (const guide of GUIDES) {
      expect(q.getByRole('link', { name: guide.title }).getAttribute('href')).toBe(
        `/poradniki/${guide.slug}`,
      );
    }
    q.getByText('Szkic');
    const planned = q.getByRole('region', { name: 'Planowane' });
    const items = within(planned).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([...PLANNED_GUIDES]);
    expect(planned.querySelector('a')).toBeNull();
  });

  it('tytuły pochodzą z „Pięciu nagłówków SEO” (1. to szkic, 2–5 planowane)', () => {
    const doc = fs.readFileSync('brand/docs/4-komunikacja.md', 'utf8');
    const section = doc.split('## Pięć nagłówków SEO')[1]!.split('\n## ')[0]!;
    const titles = [...section.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]!.trim());
    expect(titles).toHaveLength(5);
    expect(GUIDES.map((g) => g.title)).toEqual([titles[0]]);
    expect([...PLANNED_GUIDES]).toEqual(titles.slice(1));
  });

  it('każdy poradnik z rejestru ma plik MDX, a szkic ma tylko nagłówki i miejsca na zrzuty', () => {
    for (const guide of GUIDES) {
      const file = path.join('content/poradniki', `${guide.slug}.mdx`);
      expect(fs.existsSync(file), file).toBe(true);
      const lines = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      expect(lines[0]).toBe(`# ${guide.title}`);
      if (guide.status !== 'draft') continue;
      // Żadnych akapitów z instrukcjami: tylko nagłówki (#, ##, ###, SectionHeading) i <Screenshot />.
      const prose = lines.filter(
        (l) => !/^#{1,3} \S/.test(l) && !/^<(SectionHeading|Screenshot) .*\/>$/.test(l),
      );
      expect(prose).toEqual([]);
      expect(lines.filter((l) => l.startsWith('<Screenshot ')).length).toBeGreaterThan(0);
    }
  });

  it('szkic ma kotwice #eksport (link z /nowy) i #efekty', () => {
    const mdx = fs.readFileSync('content/poradniki/jak-zrobic-raport-z-instagrama-dla-klienta.mdx', 'utf8');
    expect(mdx).toMatch(/<SectionHeading id="eksport" title="[^"]+" \/>/);
    expect(mdx).toMatch(/<SectionHeading id="efekty" title="[^"]+" \/>/);
  });

  it('trasa artykułu: tylko slugi z rejestru, metadane typu article', async () => {
    vi.resetModules();
    const page = await import('@/app/(marketing)/poradniki/[slug]/page');
    expect(page.dynamicParams).toBe(false);
    expect(page.generateStaticParams()).toEqual(GUIDES.map((g) => ({ slug: g.slug })));
    const guide = GUIDES[0]!;
    const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: guide.slug }) });
    expect(metadata.title).toBe(guide.title);
    expect(metadata.description).toBe(guide.description);
    expect(metadata.alternates?.canonical).toBe(`/poradniki/${guide.slug}`);
    expect(metadata.openGraph).toMatchObject({ type: 'article', locale: 'pl_PL' });
    expect(await page.generateMetadata({ params: Promise.resolve({ slug: 'nie-ma' }) })).toEqual({});
  });
});

describe('404', () => {
  it('po polsku, jasna, z linkiem na stronę główną', async () => {
    const { root, q, metadata } = await renderPage(() => import('@/app/not-found'));
    expect(q.getByRole('heading', { level: 1 }).textContent).toBe('Nie ma takiej strony');
    expect(q.getByRole('link', { name: 'Wróć na stronę główną' }).getAttribute('href')).toBe('/');
    expect(root.firstElementChild?.getAttribute('data-theme')).toBe('light');
    expect(metadata?.title).toBe('Nie ma takiej strony');
  });
});

describe('nagłówek strony', () => {
  it('CTA w pasku i w menu mobilnym niosą src=header i src=menu', async () => {
    vi.resetModules();
    const [{ renderToStaticMarkup }, { createElement }, { SiteHeader }] = await Promise.all([
      import('react-dom/server'),
      import('react'),
      import('@/components/site/SiteHeader'),
    ]);
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(createElement(SiteHeader));
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs.filter((h) => h?.startsWith('/nowy'))).toEqual(['/nowy?src=header', '/nowy?src=menu']);
    // Zwykłe <a>: /nowy wczytuje się od nowa z własną CSP (nonce, 'wasm-unsafe-eval' dla PDF).
    expect(container.querySelectorAll('a[href^="/nowy"][data-next-link]')).toHaveLength(0);
    // Menu mobilne działa bez JavaScriptu (natywne <details>), przycisk menu ma etykietę.
    expect(container.querySelector('details > summary[aria-label="Menu"]')).not.toBeNull();
  });

  it.each([
    ['bez NEXT_PUBLIC_TEMPLATE_URL: bez pozycji „Darmowy szablon” (szablon jest „Wkrótce”)', '', 0],
    ['z NEXT_PUBLIC_TEMPLATE_URL: „Darmowy szablon” w pasku i w menu mobilnym', 'https://example.com/s', 2],
  ])('%s', async (_, url, count) => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_TEMPLATE_URL', url);
    const [{ renderToStaticMarkup }, { createElement }, { SiteHeader }] = await Promise.all([
      import('react-dom/server'),
      import('react'),
      import('@/components/site/SiteHeader'),
    ]);
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(createElement(SiteHeader));
    const template = within(container).queryAllByRole('link', { name: 'Darmowy szablon' });
    expect(template).toHaveLength(count);
    for (const link of template) expect(link.getAttribute('href')).toBe('/#narzedzia');
    // Pozostałe pozycje menu są zawsze.
    for (const name of ['Jak to działa', 'Cennik'])
      expect(within(container).getAllByRole('link', { name })).toHaveLength(2);
  });
});

describe('cele dotyku 48 px na telefonie (brand/docs/5-ekrany.md, PROMPT.md §15)', () => {
  /** Treść bloków @media (max-width: 767px) — z dopasowaniem nawiasów, bez komentarzy. */
  function phoneCss(file: string): string {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks: string[] = [];
    for (let at = css.indexOf('@media (max-width: 767px)'); at >= 0;) {
      const open = css.indexOf('{', at);
      let depth = 1;
      let i = open + 1;
      for (; depth > 0 && i < css.length; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
      blocks.push(css.slice(open + 1, i - 1));
      at = css.indexOf('@media (max-width: 767px)', i);
    }
    return blocks.join('\n');
  }

  /** Deklaracje reguł, których lista selektorów zawiera `selector`. */
  function declarations(css: string, selector: string): string {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => m[1]!.split(',').some((s) => s.trim() === selector))
      .map((m) => m[2])
      .join(';');
  }

  it.each([
    ['components/site/SiteHeader.module.css', '.home', 'link logo w pasku'],
    ['components/site/SiteFooter.module.css', '.links a', 'linki w stopce'],
    ['components/site/NotifyDisclosure.module.css', '.summary', '„Powiadom mnie o starcie”'],
    ['app/(marketing)/page.module.css', '.faqQuestion', 'pytania FAQ'],
    ['app/(marketing)/page.module.css', '.contactLink', '„Napisz do nas”'],
    ['app/(marketing)/page.module.css', '.toolLink', '„Pobierz szablon”'],
    ['app/(marketing)/page.module.css', '.plans :global(.sd-btn)', 'przyciski w cenniku'],
    ['app/(marketing)/przyklad/page.module.css', '.cta > a', '„Zrób własny raport”'],
    ['app/(marketing)/poradniki/[slug]/page.module.css', '.back a', '„Wszystkie poradniki”'],
  ])('%s %s (%s)', (file, selector) => {
    expect(declarations(phoneCss(file), selector)).toMatch(/(?:^|;)\s*(?:min-)?height:\s*var\(--control-l\)/);
  });

  it('przycisk menu mobilnego ma 48 × 48 px', () => {
    const css = fs.readFileSync('components/site/SiteHeader.module.css', 'utf8');
    const menu = declarations(css, '.menuButton');
    expect(menu).toMatch(/width:\s*var\(--control-l\)/);
    expect(menu).toMatch(/height:\s*var\(--control-l\)/);
  });

  it('klasy celów dotyku są użyte na stronie głównej i w nagłówku', () => {
    const page = fs.readFileSync('app/(marketing)/page.tsx', 'utf8');
    for (const name of ['contactLink', 'toolLink', 'faqQuestion']) expect(page).toContain(`s.${name}`);
    const header = fs.readFileSync('components/site/SiteHeader.tsx', 'utf8');
    expect(header).toContain('className={s.home}');
  });
});

describe('wszystkie strony', () => {
  const FORBIDDEN = [
    /\bAI\b/,
    /\bmagi[aięą]/i,
    /rewolucj/i,
    /w\s*5\s*minut/i,
    /100\s*%/,
    /gwarant/i,
    /najlepsz/i,
    /\binsta(?!gram)/i,
    /\bgram\b/i,
    /oficjaln\w*\s+partner/i,
    /kopiuj link/i,
    /najczęściej wybierany/i,
  ];

  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])(
    '%s: bez słów zakazanych i obietnicy linku, jeden h1',
    async (route) => {
      const { root } = await renderPage(PAGES[route]);
      const text = root.textContent ?? '';
      for (const pattern of FORBIDDEN) expect(text, String(pattern)).not.toMatch(pattern);
      expect(root.querySelectorAll('h1')).toHaveLength(1);
    },
  );

  it.each([...Object.entries(PAGES), ['404', () => import('@/app/not-found')] as const])(
    '%s: linki do tras z własną CSP (nonce) to zwykłe <a>, nie next/link',
    async (_, load) => {
      // Strona w układzie strony (nagłówek ma CTA do /nowy), z działającą listą oczekujących.
      const { root } = await renderPage(load as () => Promise<PageModule>, {
        SEDNO_DEV_STORE_DIR: '/tmp/sedno-test-store',
      });
      const { SiteHeader } = await import('@/components/site/SiteHeader');
      const { renderToStaticMarkup } = await import('react-dom/server');
      const { createElement } = await import('react');
      root.insertAdjacentHTML('afterbegin', renderToStaticMarkup(createElement(SiteHeader)));
      const soft = [...root.querySelectorAll('a[data-next-link]')]
        .map((a) => a.getAttribute('href')!)
        .filter((href) => cspModeFor(new URL(href, 'http://localhost').pathname) === 'nonce');
      expect(soft).toEqual([]);
    },
  );
});

describe('metadane i SEO', () => {
  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])(
    '%s: tytuł, adres kanoniczny i Open Graph',
    async (route) => {
      vi.resetModules();
      const { metadata } = (await PAGES[route]()) as PageModule;
      expect(metadata?.title).toBeTruthy();
      expect(metadata?.alternates?.canonical).toBe(route);
      expect(metadata?.openGraph).toMatchObject({ locale: 'pl_PL', siteName: 'Sedno', url: route });
      expect(metadata?.openGraph?.title).toMatch(/Sedno/);
      // Strony do indeksowania mają opis; szkice prawne nie są indeksowane.
      if ((LEGAL as readonly string[]).includes(route))
        expect(metadata?.robots).toMatchObject({ index: false });
      else {
        expect(metadata?.description).toBeTruthy();
        expect(metadata?.robots).toBeUndefined();
      }
    },
  );

  it('robots.txt: blokuje aplikację, raporty klientów i strony deweloperskie, wskazuje sitemap', async () => {
    const { default: robots } = await import('@/app/robots');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://sedno.example/');
    const result = robots();
    expect(result.rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/app', '/r/', '/dev'] });
    expect(result.sitemap).toBe('https://sedno.example/sitemap.xml');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(robots().sitemap).toBe('http://localhost:3000/sitemap.xml');
  });

  it('sitemap.xml: strony publiczne, bez szkiców prawnych i tras prywatnych', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://sedno.example');
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual([
      'https://sedno.example/',
      'https://sedno.example/przyklad',
      'https://sedno.example/szablon',
      'https://sedno.example/poradniki',
      ...GUIDES.map((g) => `https://sedno.example/poradniki/${g.slug}`),
      'https://sedno.example/nowy',
    ]);
    for (const url of urls) expect(url).not.toMatch(/\/(prywatnosc|regulamin|kontakt|app|r|dev)(\/|$)/);
  });

  it('manifest: nazwa, kolory z tokenów marki i ikony z public/', async () => {
    const { default: manifest } = await import('@/app/manifest');
    const result = manifest();
    expect(result).toMatchObject({
      name: 'Sedno',
      short_name: 'Sedno',
      start_url: '/',
      display: 'standalone',
      background_color: tokens.colors.light.paper,
      theme_color: tokens.colors.light.pen,
    });
    expect(result.theme_color).toBe('#2A3CD4');
    expect(result.description).toBeTruthy();
    expect(result.icons?.map((i) => [i.src, i.sizes])).toEqual([
      ['/icon-192.png', '192x192'],
      ['/icon-512.png', '512x512'],
    ]);
    for (const icon of result.icons ?? []) expect(fs.existsSync(path.join('public', icon.src))).toBe(true);
  });
});
