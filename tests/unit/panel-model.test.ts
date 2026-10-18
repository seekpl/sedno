/**
 * Panel klientów — czyste funkcje i teksty: miesiąc z adresu, działanie w wierszu, dni robocze,
 * inicjały, plan, odmiana („2 z 5 raportów”, „1 z 1 raportu”, „1 dzień roboczy”…).
 */
import { describe, expect, it } from 'vitest';
import {
  editorHref,
  initials,
  MIN_PANEL_MONTH,
  planLabel,
  resolvePanelMonth,
  rowAction,
  showsWorkingDays,
  workingDaysLeft,
} from '@/components/app/panel/model';
import { panel as t } from '@/lib/copy/panel';

const NOW = new Date('2026-10-13T10:00:00Z'); // wtorek 13 października 2026
const CLIENT = { id: '6f1c1d5e-2a4b-4c3d-8e9f-0a1b2c3d4e5f', name: 'Studio Lumi' };

describe('miesiąc z ?m=', () => {
  it('bez parametru i z błędnym — ostatni pełny miesiąc', () => {
    expect(resolvePanelMonth(undefined, NOW)).toBe('2026-09');
    expect(resolvePanelMonth('', NOW)).toBe('2026-09');
    expect(resolvePanelMonth('2026-13', NOW)).toBe('2026-09');
    expect(resolvePanelMonth('2026-9', NOW)).toBe('2026-09');
    expect(resolvePanelMonth('wrzesien', NOW)).toBe('2026-09');
    expect(resolvePanelMonth(['2026-08', '2026-07'], NOW)).toBe('2026-09');
  });

  it('poprawny miesiąc zostaje, przyszły → bieżący, zbyt dawny → granica', () => {
    expect(resolvePanelMonth('2026-08', NOW)).toBe('2026-08');
    expect(resolvePanelMonth('2026-10', NOW)).toBe('2026-10');
    expect(resolvePanelMonth('2026-11', NOW)).toBe('2026-10');
    expect(resolvePanelMonth('2031-01', NOW)).toBe('2026-10');
    expect(resolvePanelMonth('1999-12', NOW)).toBe(MIN_PANEL_MONTH);
    expect(resolvePanelMonth('0000-01', NOW)).toBe(MIN_PANEL_MONTH);
  });

  it('bieżący miesiąc liczy się w czasie warszawskim', () => {
    // 31 października 23:30 UTC to już 1 listopada w Warszawie.
    expect(resolvePanelMonth(undefined, new Date('2026-10-31T23:30:00Z'))).toBe('2026-10');
    expect(resolvePanelMonth('2026-11', new Date('2026-10-31T23:30:00Z'))).toBe('2026-11');
  });
});

describe('działanie w wierszu', () => {
  it('status → słowo, dopowiedzenie dla czytników i adres edytora', () => {
    expect(rowAction('sent', CLIENT, '2026-09')).toEqual({
      label: 'Otwórz',
      rest: 'raport: Studio Lumi',
      href: `/app/klienci/${CLIENT.id}/2026-09`,
    });
    expect(rowAction('ready', CLIENT, '2026-09')).toEqual({
      label: 'Wyślij',
      rest: 'raport: Studio Lumi',
      href: `/app/klienci/${CLIENT.id}/2026-09?krok=3`,
    });
    expect(rowAction('draft', CLIENT, '2026-09')).toEqual({
      label: 'Dokończ',
      rest: 'raport: Studio Lumi',
      href: `/app/klienci/${CLIENT.id}/2026-09`,
    });
    expect(rowAction('no-export', CLIENT, '2026-09')).toEqual({
      label: 'Wgraj',
      rest: 'eksport: Studio Lumi',
      href: `/app/klienci/${CLIENT.id}/2026-09`,
    });
  });

  it('pełna nazwa dostępna zawiera widoczne słowo na początku (WCAG 2.5.3)', () => {
    for (const status of ['sent', 'ready', 'draft', 'no-export'] as const) {
      const action = rowAction(status, CLIENT, '2026-09');
      expect(`${action.label} ${action.rest}`).toMatch(new RegExp(`^${action.label} .+: Studio Lumi$`));
    }
  });

  it('adres edytora koduje identyfikator', () => {
    expect(editorHref('a/b', '2026-09')).toBe('/app/klienci/a%2Fb/2026-09');
    expect(editorHref(CLIENT.id, '2026-09', 2)).toBe(`/app/klienci/${CLIENT.id}/2026-09?krok=2`);
  });
});

describe('dni robocze do końca miesiąca', () => {
  it('liczy poniedziałek–piątek od dziś (włącznie) do końca miesiąca', () => {
    expect(workingDaysLeft(NOW)).toBe(14);
    expect(workingDaysLeft(new Date('2026-09-28T08:00:00Z'))).toBe(3); // poniedziałek
    expect(workingDaysLeft(new Date('2026-10-30T08:00:00Z'))).toBe(1); // piątek, ostatni roboczy
    expect(workingDaysLeft(new Date('2026-10-31T08:00:00Z'))).toBe(0); // sobota
    expect(workingDaysLeft(new Date('2026-10-01T08:00:00Z'))).toBe(22);
    expect(workingDaysLeft(new Date('2026-02-01T08:00:00Z'))).toBe(20); // luty 2026 (niedziela)
  });

  it('dzień w czasie warszawskim, nie UTC', () => {
    // 31 października 23:30 UTC = 1 listopada 00:30 w Warszawie (niedziela): listopad ma 21 dni roboczych.
    expect(workingDaysLeft(new Date('2026-10-31T23:30:00Z'))).toBe(21);
    // 30 września 22:30 UTC = 1 października 00:30 w Warszawie (czas letni).
    expect(workingDaysLeft(new Date('2026-09-30T22:30:00Z'))).toBe(22);
  });

  it('zdanie tylko dla miesiąca poprzedzającego bieżący (raporty należne teraz)', () => {
    expect(showsWorkingDays('2026-09', NOW)).toBe(true);
    expect(showsWorkingDays('2026-10', NOW)).toBe(false);
    expect(showsWorkingDays('2026-08', NOW)).toBe(false);
    expect(showsWorkingDays('2025-12', new Date('2026-01-05T10:00:00Z'))).toBe(true);
  });
});

describe('teksty z odmianą', () => {
  it('„{x} z {y} raportów wysłane.” z dopełniaczem po „z”', () => {
    expect(t.sentLine(2, 5)).toBe('2 z 5 raportów wysłane.');
    expect(t.sentLine(1, 1)).toBe('1 z 1 raportu wysłane.');
    expect(t.sentLine(0, 2)).toBe('0 z 2 raportów wysłane.');
    expect(t.sentLine(3, 4)).toBe('3 z 4 raportów wysłane.');
    expect(t.sentLine(10, 21)).toBe('10 z 21 raportów wysłane.');
    expect(t.sentLine(10, 22)).toBe('10 z 22 raportów wysłane.');
  });

  it('dni robocze: został 1 dzień roboczy, zostały 2–4 dni robocze, zostało 5+ dni roboczych', () => {
    expect(t.workingDaysLeft(1)).toBe('Do końca miesiąca został 1 dzień roboczy.');
    expect(t.workingDaysLeft(2)).toBe('Do końca miesiąca zostały 2 dni robocze.');
    expect(t.workingDaysLeft(3)).toBe('Do końca miesiąca zostały 3 dni robocze.');
    expect(t.workingDaysLeft(4)).toBe('Do końca miesiąca zostały 4 dni robocze.');
    expect(t.workingDaysLeft(5)).toBe('Do końca miesiąca zostało 5 dni roboczych.');
    expect(t.workingDaysLeft(12)).toBe('Do końca miesiąca zostało 12 dni roboczych.');
    expect(t.workingDaysLeft(14)).toBe('Do końca miesiąca zostało 14 dni roboczych.');
    expect(t.workingDaysLeft(22)).toBe('Do końca miesiąca zostały 22 dni robocze.');
    expect(t.workingDaysLeft(0)).toBe('Do końca miesiąca nie ma już dni roboczych.');
  });

  it('nagłówek w miejscowniku, porównanie z M−1 w mianowniku, brak danych to „—”', () => {
    expect(t.heading('2026-09')).toBe('Klienci we wrześniu');
    expect(t.heading('2026-02')).toBe('Klienci w lutym');
    expect(t.meta.title('2026-09')).toBe('Klienci we wrześniu 2026');
    expect(t.stats.book.previous('2026-08', 69)).toBe('sierpień: 69');
    expect(t.stats.book.previous('2026-08', null)).toBe('sierpień: —');
    expect(t.stats.book.previous('2026-08', 12480)).toBe('sierpień: 12 480');
    expect(t.stats.sent.value(2, 5)).toBe('2 z 5');
  });

  it('bez wykrzykników i bez zwracania się „Pan/Pani”', () => {
    const texts = JSON.stringify(t);
    expect(texts).not.toMatch(/!/);
    expect(texts).not.toMatch(/\bPan(i)?\b/);
  });
});

describe('inicjały i plan', () => {
  it('pierwsza litera pierwszego i ostatniego słowa jak w makiecie', () => {
    expect(initials('Studio Lumi')).toBe('SL');
    expect(initials('Bistro Pod Lipą')).toBe('BL');
    expect(initials('Kwiaciarnia Pąk')).toBe('KP');
    expect(initials('łódzka ścianka')).toBe('ŁŚ');
    expect(initials('Kadr')).toBe('KA');
    expect(initials('  Fizjo   Ruch ')).toBe('FR');
    expect(initials('Salon „Złota Nić”')).toBe('SN');
    expect(initials('Dent-Med')).toBe('DM');
    expect(initials('A')).toBe('A');
    expect(initials('—')).toBe('');
  });

  it('nazwa planu z config/pricing.ts', () => {
    expect(planLabel('free')).toBe('Na start');
    expect(planLabel('solo')).toBe('Solo');
  });
});
