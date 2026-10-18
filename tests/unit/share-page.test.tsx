// @vitest-environment jsdom
/**
 * Raport publiczny /r/[token] (PROMPT.md §11, §16): zawsze jasny, h1 to tytuł raportu, „Pobierz PDF” (toast,
 * zdarzenie pdf_downloaded z trybem konta i brandingiem), logo tylko z tej samej domeny, link_opened bez tokenu
 * i właściciela, metadane (tytuł, noindex,nofollow, OG bez liczb), share.expired dla nieaktywnego linku
 * i osobne komunikaty dla limitu i błędu serwera. Moduł danych podmieniony (testy bazy: tests/db/share-*).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { share as t } from '@/lib/copy/share';
import { EXAMPLE_REPORT } from '@/lib/report/example';
import { reportView } from '@/lib/report/format';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
const afterMock = vi.hoisted(() => ({ callbacks: [] as (() => unknown)[] }));
vi.mock('next/server', () => ({
  after: (callback: () => unknown) => afterMock.callbacks.push(callback),
}));

const data = vi.hoisted(() => ({ getSharedReport: vi.fn() }));
vi.mock('@/lib/data/shared', () => data);
const events = vi.hoisted(() => ({ recordServerEvent: vi.fn() }));
vi.mock('@/lib/server/server-events', () => events);
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics/client', () => analytics);
const pdf = vi.hoisted(() => ({ downloadReportPdf: vi.fn() }));
vi.mock('@/lib/pdf/download', () => pdf);

const { default: SharedReportPage } = await import('@/app/r/[token]/page');
const { generateMetadata } = await import('@/app/r/[token]/layout');
const { default: SharedReportNotFound } = await import('@/app/r/[token]/not-found');
const { default: SharedReportError } = await import('@/app/r/[token]/error');
const { SharedPdfButton } = await import('@/components/share/SharedPdfButton');
const { ToastProvider } = await import('@/components/ui/Toast');

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const params = Promise.resolve({ token: TOKEN });
const ok = (extra: Partial<{ branding: string; hasLogo: boolean }> = {}) => ({
  status: 'ok',
  data: EXAMPLE_REPORT,
  branding: 'sedno-footer',
  hasLogo: false,
  ...extra,
});

function mount(element: ReactNode) {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(element);
  document.body.replaceChildren(container);
  return { root: container, q: within(container) };
}

/** Elementy drzewa React (bez renderowania) o danym typie — np. propsy <Report> i <SharedPdfButton>. */
function findElements(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const own = node.type === type ? [node as ReactElement<Record<string, unknown>>] : [];
  return [...own, ...findElements(node.props.children, type)];
}

beforeEach(() => {
  afterMock.callbacks = [];
  data.getSharedReport.mockReset().mockResolvedValue(ok());
  events.recordServerEvent.mockReset();
  analytics.track.mockReset();
  pdf.downloadReportPdf.mockReset().mockResolvedValue('raport.pdf');
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe('/r/[token] — strona', () => {
  it('jasny raport z jednym h1 (tytuł raportu), przyciskiem PDF i bez tokenu w treści', async () => {
    const page = await SharedReportPage({ params });
    const { root, q } = mount(page);
    expect(data.getSharedReport).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(root.firstElementChild?.getAttribute('data-theme')).toBe('light');
    expect(root.querySelector('.sd-report[data-theme="light"]')).not.toBeNull();
    expect(root.querySelector('main#tresc')).not.toBeNull();
    const h1s = root.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe(EXAMPLE_REPORT.headline);
    within(q.getByRole('region', { name: t.reportLabel })).getByText(EXAMPLE_REPORT.headline);
    q.getByRole('button', { name: t.pdf.button });
    expect(root.innerHTML).not.toContain(TOKEN);
  });

  it('zapisuje link_opened po wysłaniu strony, bez tokenu i bez właściciela', async () => {
    await SharedReportPage({ params });
    expect(events.recordServerEvent).not.toHaveBeenCalled();
    expect(afterMock.callbacks).toHaveLength(1);
    await afterMock.callbacks[0]?.();
    expect(events.recordServerEvent).toHaveBeenCalledExactlyOnceWith('link_opened', {});
  });

  it('logo autora z tej samej domeny tylko, gdy autor je ma', async () => {
    const { Report } = await import('@/components/report/Report');
    const without = await SharedReportPage({ params });
    expect(findElements(without, Report)[0]?.props.logoSrc).toBeUndefined();
    expect(findElements(without, SharedPdfButton)[0]?.props).toMatchObject({
      branding: 'sedno-footer',
      logoSrc: undefined,
    });

    data.getSharedReport.mockResolvedValue(ok({ hasLogo: true, branding: 'author' }));
    const withLogo = await SharedReportPage({ params });
    expect(findElements(withLogo, Report)[0]?.props).toMatchObject({
      headingLevel: 1,
      logoSrc: `/r/${TOKEN}/logo`,
    });
    expect(findElements(withLogo, SharedPdfButton)[0]?.props).toMatchObject({
      branding: 'author',
      logoSrc: `/r/${TOKEN}/logo`,
    });
  });

  it('link nieaktywny → notFound() (not-found.tsx), bez zdarzenia', async () => {
    data.getSharedReport.mockResolvedValue({ status: 'not-found' });
    await expect(SharedReportPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(afterMock.callbacks).toHaveLength(0);
  });

  it('limit otwarć → osobny komunikat (nie „wygasł”), bez raportu i bez zdarzenia', async () => {
    data.getSharedReport.mockResolvedValue({ status: 'rate-limited' });
    const { root } = mount(await SharedReportPage({ params }));
    expect(root.querySelector('h1')?.textContent).toBe(`${t.rateLimited.heading} ${t.rateLimited.detail}`);
    expect(root.querySelector('.sd-report')).toBeNull();
    expect(root.textContent).not.toContain(t.expired);
    expect(afterMock.callbacks).toHaveLength(0);
  });
});

describe('/r/[token] — metadane (layout.tsx)', () => {
  it('tytuł „Raport za {miesiąc} — {klient}”, noindex,nofollow, OG ogólny bez liczb i klienta', async () => {
    const metadata = await generateMetadata({ params });
    expect(metadata.title).toEqual({ absolute: reportView(EXAMPLE_REPORT).documentTitle });
    expect(reportView(EXAMPLE_REPORT).documentTitle).toBe('Raport za wrzesień 2026 — Studio Lumi');
    expect(metadata.robots).toEqual({ index: false, follow: false });
    const og = JSON.stringify(metadata.openGraph);
    expect(og).not.toMatch(/\d/);
    expect(og).not.toContain(EXAMPLE_REPORT.client.name);
    expect(metadata.openGraph).toMatchObject({ title: t.meta.ogTitle, description: t.meta.description });
    expect(JSON.stringify(metadata)).not.toContain(TOKEN);
    expect(metadata.description ?? '').not.toMatch(/\d/);
  });

  it.each([
    ['nieaktywny link', { status: 'not-found' }],
    ['limit', { status: 'rate-limited' }],
  ])('%s → „Raport niedostępny”, noindex', async (_label, result) => {
    data.getSharedReport.mockResolvedValue(result);
    expect(await generateMetadata({ params })).toEqual({
      title: { absolute: t.unavailableTitle },
      robots: { index: false, follow: false },
    });
  });

  it('błąd odczytu nie psuje metadanych (stronę obsługuje error.tsx)', async () => {
    data.getSharedReport.mockRejectedValue(new Error('baza'));
    expect((await generateMetadata({ params })).title).toEqual({ absolute: t.unavailableTitle });
  });
});

describe('/r/[token] — komunikaty', () => {
  it('not-found: dokładnie share.expired, jasny motyw, nic poza tym', () => {
    const { root } = mount(<SharedReportNotFound />);
    expect(root.firstElementChild?.getAttribute('data-theme')).toBe('light');
    const h1 = root.querySelector('h1');
    expect(h1?.textContent).toBe(t.expired);
    expect(t.expired).toBe('Ten raport nie jest już dostępny. Poproś osobę, która go wysłała, o nowy link.');
    expect(root.textContent).toBe(t.expired);
    expect(root.querySelectorAll('a, img, svg, button')).toHaveLength(0);
  });

  it('error: komunikat o błędzie serwera i „Wczytaj ponownie”', () => {
    const retry = vi.fn();
    render(<SharedReportError error={new Error('baza')} retry={retry} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      `${t.failed.heading} ${t.failed.detail}`,
    );
    expect(document.body.textContent).not.toContain('baza');
    fireEvent.click(screen.getByRole('button', { name: t.failed.retry }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe('SharedPdfButton', () => {
  function renderButton(props: { branding: 'sedno-footer' | 'author'; logoSrc?: string }) {
    render(
      <ToastProvider>
        <SharedPdfButton data={EXAMPLE_REPORT} {...props} />
      </ToastProvider>,
    );
    return screen.getByRole('button', { name: t.pdf.button });
  }

  it('PDF w przeglądarce z logo autora → toast „PDF pobrany” i pdf_downloaded (konto, branding)', async () => {
    const button = renderButton({ branding: 'author', logoSrc: `/r/${TOKEN}/logo` });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(pdf.downloadReportPdf).toHaveBeenCalledExactlyOnceWith(EXAMPLE_REPORT, {
      logoSrc: `/r/${TOKEN}/logo`,
    });
    await screen.findByText(t.pdf.downloaded);
    expect(analytics.track).toHaveBeenCalledExactlyOnceWith('pdf_downloaded', {
      mode: 'account',
      branding: 'author',
    });
  });

  it('bez logo: bez opcji logo', async () => {
    const button = renderButton({ branding: 'sedno-footer' });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(pdf.downloadReportPdf).toHaveBeenCalledExactlyOnceWith(EXAMPLE_REPORT, undefined);
    expect(analytics.track).toHaveBeenCalledWith('pdf_downloaded', {
      mode: 'account',
      branding: 'sedno-footer',
    });
  });

  it('w trakcie: aria-busy i drugie kliknięcie nic nie robi', async () => {
    let finish: (name: string) => void = () => {};
    pdf.downloadReportPdf.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    const button = renderButton({ branding: 'sedno-footer' });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(pdf.downloadReportPdf).toHaveBeenCalledOnce();
    await act(async () => finish('raport.pdf'));
    expect(button.getAttribute('aria-busy')).toBeNull();
  });

  it('błąd: Alert z przyczyną i naprawą, bez zdarzenia', async () => {
    pdf.downloadReportPdf.mockRejectedValue(new Error('font'));
    const button = renderButton({ branding: 'sedno-footer' });
    await act(async () => {
      fireEvent.click(button);
    });
    const alert = await screen.findByRole('alert');
    within(alert).getByText(t.pdf.error.title);
    within(alert).getByText(t.pdf.error.body);
    expect(analytics.track).not.toHaveBeenCalled();
  });
});
