/**
 * Czyste funkcje historii raportów: numer strony z ?strona=, adresy stron i edytora, liczba stron, stan
 * linku (aktywny, wyłączony, wygasły, brak) i teksty z odmianą.
 */
import { describe, expect, it, vi } from 'vitest';
import { historyHref, parsePageParam, reportHref } from '@/components/app/history/model';
import { history as t } from '@/lib/copy/history';

vi.mock('server-only', () => ({}));

const { linkState, pageCountOf, HISTORY_PAGE_SIZE } = await import('@/lib/data/history');

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
