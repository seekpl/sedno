import { expect, test } from '@playwright/test';
import { DEMO_LIST } from '../../components/dev/registry';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, VIEWPORTS } from './helpers';

test.describe('/dev/komponenty', () => {
  test('strona zbiorcza: axe bez naruszeń serious/critical', async ({ page }) => {
    await page.goto('/dev/komponenty');
    await expect(page.getByRole('heading', { level: 1, name: 'Komponenty' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  for (const { slug } of DEMO_LIST) {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      test(`${slug} (${name}): axe i zrzut`, async ({ page }, info) => {
        await page.setViewportSize(viewport);
        await page.goto(`/dev/komponenty/${slug}`);
        await page.evaluate(() => document.fonts.ready);
        await expectNoSeriousA11yViolations(page);
        await expectNoHorizontalOverflow(page);
        await page.screenshot({ path: info.outputPath(`${slug}-${viewport.width}.png`), fullPage: true });
      });
    }
  }

  test('modal: fokus w oknie, Esc zamyka i oddaje fokus', async ({ page }) => {
    await page.goto('/dev/komponenty');
    const opener = page
      .getByRole('region', { name: 'Pozostałe i zachowanie' })
      .getByRole('button', { name: 'Usuń klienta', exact: true });
    await opener.click();
    await expect(page.locator('body > .sd-scrim').getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zostaw klienta' }).last()).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Zostaw klienta' }).last()).toBeFocused();
    await page.keyboard.press('Escape');
    // Okno otwarte przyciskiem żyje w portalu (bezpośrednio w <body>); statyczne demo zostaje na stronie.
    await expect(page.locator('body > .sd-scrim')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('przycisk niedostępny: osiągalny z klawiatury, z wyjaśnieniem', async ({ page }) => {
    await page.goto('/dev/komponenty');
    const btn = page.getByRole('button', { name: 'Utwórz link' });
    await btn.focus();
    await expect(btn).toHaveAttribute('aria-disabled', 'true');
    await expect(btn).toHaveAccessibleDescription('Link do raportu wymaga konta.');
    await expect(page.getByRole('tooltip', { name: 'Link do raportu wymaga konta.' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip', { name: 'Link do raportu wymaga konta.' })).toBeHidden();
  });

  test('powiadomienie z działaniem pojawia się w regionie aria-live', async ({ page }) => {
    await page.goto('/dev/komponenty');
    await page.getByRole('button', { name: 'Pokaż powiadomienie' }).click();
    const region = page.locator('[aria-live="polite"]').filter({ hasText: 'Raport dla Studio Lumi wysłany' });
    await expect(region).toBeVisible();
    await region.getByRole('button', { name: 'Cofnij' }).click();
    await expect(page.getByText('Raport dla Studio Lumi wysłany')).toBeHidden();
  });

  test('pola i przyciski na telefonie mają co najmniej 48 px tam, gdzie wymaga tego marka', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto('/dev/komponenty/textfield');
    const box = await page.getByLabel('Kliknięcia „Zarezerwuj”').boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  });
});
