/**
 * Czyste funkcje historii raportów: numer strony z ?strona=, adresy stron i edytora, liczba stron, stan
 * linku (aktywny, wyłączony, wygasły, brak), kolejność (miesiąc malejąco, klient po polsku) i teksty z odmianą.
 */
import { describe, expect, it, vi } from 'vitest';
import { historyHref, parsePageParam, reportHref } from '@/components/app/history/model';
import { history as t } from '@/lib/copy/history';

vi.mock('server-only', () => ({}));

const { compareHistoryKeys, linkState, listReports, pageCountOf, HISTORY_PAGE_SIZE } =
  await import('@/lib/data/history');

const NOW = new Date('2026-10-13T10:00:00Z');
const link = (created: string, expires: string, revoked: string | null = null) => ({
  created_at: created,
  expires_at: expires,
  revoked_at: revoked,
});

describe('parsePageParam', () => {
  it('brak parametru → strona 1', () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it.each([
    ['1', 1],
    ['2', 2],
    ['20', 20],
    ['999999', 999999],
  ])('„%s” → %i', (raw, page) => {
    expect(parsePageParam(raw)).toBe(page);
  });

  it.each(['0', '-1', '01', '1.5', '2e3', 'abc', '', ' 2', '1234567'])('„%s” → null', (raw) => {
    expect(parsePageParam(raw)).toBeNull();
  });

  it('powtórzony parametr → null', () => {
    expect(parsePageParam(['1', '2'])).toBeNull();
  });
});

describe('adresy', () => {
  it('pierwsza strona bez parametru, kolejne z ?strona=', () => {
    expect(historyHref(1)).toBe('/app/raporty');
    expect(historyHref(2)).toBe('/app/raporty?strona=2');
  });

  it('edytor raportu klienta za miesiąc (kontrakt tras)', () => {
    expect(reportHref('22222222-2222-4222-8222-222222222222', '2026-09')).toBe(
      '/app/klienci/22222222-2222-4222-8222-222222222222/2026-09',
    );
  });
});

describe('pageCountOf', () => {
  it('po 20 na stronę, co najmniej jedna strona', () => {
    expect(HISTORY_PAGE_SIZE).toBe(20);
    expect(pageCountOf(0)).toBe(1);
    expect(pageCountOf(20)).toBe(1);
    expect(pageCountOf(21)).toBe(2);
    expect(pageCountOf(41)).toBe(3);
  });
});

describe('linkState', () => {
  it('bez linków → brak', () => {
    expect(linkState([], NOW)).toBe('none');
  });

  it('nieodwołany i nieprzeterminowany → aktywny', () => {
    expect(linkState([link('2026-09-27T12:00:00Z', '2027-09-27T12:00:00Z')], NOW)).toBe('active');
  });

  it('odwołany → wyłączony; przeterminowany → wygasł', () => {
    expect(
      linkState([link('2026-09-27T12:00:00Z', '2027-09-27T12:00:00Z', '2026-10-01T08:00:00Z')], NOW),
    ).toBe('revoked');
    expect(linkState([link('2025-09-27T12:00:00Z', '2026-09-27T12:00:00Z')], NOW)).toBe('expired');
  });

  it('wygasa dokładnie w chwili expires_at', () => {
    expect(linkState([link('2025-10-13T10:00:00Z', NOW.toISOString())], NOW)).toBe('expired');
  });

  it('jest aktywny link (np. nowy po wyłączeniu starego) → aktywny', () => {
    expect(
      linkState(
        [
          link('2026-09-01T12:00:00Z', '2027-09-01T12:00:00Z', '2026-09-02T12:00:00Z'),
          link('2026-09-03T12:00:00Z', '2027-09-03T12:00:00Z'),
        ],
        NOW,
      ),
    ).toBe('active');
  });

  it('bez aktywnego: stan najnowszego linku', () => {
    const revokedOld = link('2025-01-01T12:00:00Z', '2026-01-01T12:00:00Z', '2025-02-01T12:00:00Z');
    const expiredNew = link('2025-06-01T12:00:00Z', '2026-06-01T12:00:00Z');
    expect(linkState([revokedOld, expiredNew], NOW)).toBe('expired');
    expect(
      linkState([expiredNew, link('2025-08-01T12:00:00Z', '2026-08-01T12:00:00Z', '2025-08-02')], NOW),
    ).toBe('revoked');
  });
});

describe('compareHistoryKeys — kolejność historii', () => {
  const key = (period: string, clientName: string, id = '0') => ({ id, period, clientName });

  it('najpierw miesiąc malejąco, potem klient', () => {
    const keys = [key('2026-08-01', 'Alfa'), key('2026-09-01', 'Zeta'), key('2026-09-01', 'Alfa')];
    expect(keys.sort(compareHistoryKeys).map((k) => `${k.period.slice(0, 7)} ${k.clientName}`)).toEqual([
      '2026-09 Alfa',
      '2026-09 Zeta',
      '2026-08 Alfa',
    ]);
  });

  it('klienci w polskim porządku: małe litery, Ć, Ł, Ś, Ż na swoim miejscu; liczby rosnąco', () => {
    const names = [
      'Zeta',
      'Łąka',
      'bistro',
      'Ćma',
      'Czar',
      'Żabka',
      'Śniadania',
      'Studio',
      'Salon 10',
      'Salon 9',
    ];
    const sorted = names.map((n) => key('2026-09-01', n)).sort(compareHistoryKeys);
    expect(sorted.map((k) => k.clientName)).toEqual([
      'bistro',
      'Czar',
      'Ćma',
      'Łąka',
      'Salon 9',
      'Salon 10',
      'Studio',
      'Śniadania',
      'Zeta',
      'Żabka',
    ]);
  });

  it('ta sama nazwa: rozstrzyga identyfikator (stała kolejność między stronami)', () => {
    const sorted = [key('2026-09-01', 'Lumi', 'b'), key('2026-09-01', 'Lumi', 'a')].sort(compareHistoryKeys);
    expect(sorted.map((k) => k.id)).toEqual(['a', 'b']);
  });
});

describe('listReports — zapytania (PostgREST podmieniony)', () => {
  type Row = { id: string; period: string; client_id: string; status: 'draft'; sent_at: null };
  const rows: Row[] = Array.from({ length: 1234 }, (_, i) => ({
    id: `id-${String(i).padStart(4, '0')}`,
    period: i % 2 ? '2026-08-01' : '2026-09-01',
    client_id: `c-${i}`,
    status: 'draft',
    sent_at: null,
  }));

  /** Udaje PostgREST z max_rows = 500: najwyżej 500 wierszy naraz, liczba tylko na prośbę. */
  function fakeDb(missing: string[] = []) {
    const calls: { range?: [number, number]; count: boolean; ids?: string[] }[] = [];
    const db = {
      from: () => {
        let count = false;
        const builder = {
          select: (_columns: string, options?: { count?: string }) => {
            count = options?.count === 'exact';
            return builder;
          },
          order: () => builder,
          range: (from: number, to: number) => {
            calls.push({ range: [from, to], count });
            const data = rows
              .slice(from, Math.min(to + 1, from + 500))
              .map((r) => ({ ...r, clients: { name: `Klient ${r.client_id}` } }));
            return Promise.resolve({ data, count: count ? rows.length : null, error: null });
          },
          in: (_column: string, ids: string[]) => {
            calls.push({ count, ids });
            const data = rows
              .filter((r) => ids.includes(r.id) && !missing.includes(r.id))
              .map((r) => ({ ...r, clients: [{ name: `Klient ${r.client_id}` }], share_links: [] }));
            return Promise.resolve({ data, error: null });
          },
        };
        return builder;
      },
    };
    return { db: db as never, calls };
  }

  it('wszystkie klucze mimo limitu wierszy serwera, liczba tylko w pierwszej porcji, szczegóły tylko 20', async () => {
    const { db, calls } = fakeDb();
    const page = await listReports(db, 2, NOW);
    expect(page).toMatchObject({ total: 1234, page: 2, pageCount: 62 });
    expect(calls.filter((c) => c.range).map((c) => [c.range![0], c.count])).toEqual([
      [0, true],
      [500, false],
      [1000, false],
    ]);
    const details = calls.find((c) => c.ids);
    expect(details?.ids).toHaveLength(HISTORY_PAGE_SIZE);
    expect(page.rows.map((r) => r.id)).toEqual(details?.ids);
    expect(page.rows.every((r) => r.month === '2026-09')).toBe(true);
  });

  it('raport usunięty między zapytaniami znika ze strony, reszta w tej samej kolejności', async () => {
    const first = await listReports(fakeDb().db, 1, NOW);
    const gone = first.rows[3]!.id;
    const again = await listReports(fakeDb([gone]).db, 1, NOW);
    expect(again.rows.map((r) => r.id)).toEqual(first.rows.map((r) => r.id).filter((id) => id !== gone));
  });
});

describe('teksty historii', () => {
  it('liczba raportów z odmianą', () => {
    expect(t.lead(1)).toBe('1 raport, od najnowszego miesiąca.');
    expect(t.lead(3)).toBe('3 raporty, od najnowszego miesiąca.');
    expect(t.lead(5)).toBe('5 raportów, od najnowszego miesiąca.');
    expect(t.lead(22)).toBe('22 raporty, od najnowszego miesiąca.');
    expect(t.lead(12480)).toBe('12 480 raportów, od najnowszego miesiąca.');
  });

  it('pusty stan to empty.history z PROMPT.md §14', () => {
    expect(t.empty.body).toBe('Raporty z tego miesiąca pojawią się tutaj. Zacznij od wgrania eksportu.');
  });
});
