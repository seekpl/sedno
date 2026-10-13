/**
 * Wspólne teksty obszaru konta (/app): nawigacja, powłoka strony. Teksty poszczególnych ekranów są w
 * osobnych plikach (auth, panel, editor, share, settings, history).
 */
export const app = {
  nav: [
    { key: 'klienci', href: '/app/klienci', label: 'Klienci' },
    { key: 'raporty', href: '/app/raporty', label: 'Raporty' },
    { key: 'ustawienia', href: '/app/ustawienia', label: 'Ustawienia' },
  ],
} as const;

export type AppSection = (typeof app.nav)[number]['key'];
