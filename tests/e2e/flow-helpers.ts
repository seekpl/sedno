/** Wspólne kroki przepływu /nowy dla testów e2e. Nazwy kontrolek jak w lib/copy/tool.ts. */
import type { Page } from '@playwright/test';
import { fixture } from './helpers';

/** Miesiąc w przełączniku: klikamy strzałki, aż etykieta pokaże docelowy miesiąc (np. „Wrzesień 2026”). */
export async function goToMonth(page: Page, label: string) {
  const group = page.getByRole('group', { name: 'Miesiąc' }).first();
  for (let i = 0; i < 36; i += 1) {
    const text = (await group.textContent()) ?? '';
    if (text.includes(label)) return;
    const [, monthName, year] = /([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż]+) (\d{4})/.exec(text) ?? [];
    const target = /([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż]+) (\d{4})/.exec(label)!;
    const order = [
      'Styczeń',
      'Luty',
      'Marzec',
      'Kwiecień',
      'Maj',
      'Czerwiec',
      'Lipiec',
      'Sierpień',
      'Wrzesień',
      'Październik',
      'Listopad',
      'Grudzień',
    ];
    const cur = Number(year) * 12 + order.indexOf(monthName ?? '');
    const dst = Number(target[2]) * 12 + order.indexOf(target[1]!);
    await group.getByRole('button', { name: dst < cur ? 'Poprzedni miesiąc' : 'Następny miesiąc' }).click();
  }
  throw new Error(`Nie udało się przełączyć na ${label}`);
}

export async function uploadFixture(page: Page, name: string) {
  await page.locator('input[type="file"]').setInputFiles(fixture(name));
}
