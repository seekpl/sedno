import Link from 'next/link';
import { buttonClass } from '@/components/ui/buttonClass';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { features, templateUrl } from '@/config/features';
import { copy } from '@/lib/copy/pl';
import { ToolLink } from './ToolLink';
import s from './SiteHeader.module.css';

/** Pozycja menu „Darmowy szablon” (sekcja „Darmowe narzędzia” na stronie głównej). */
const TEMPLATE_NAV_HREF = '/#narzedzia';

/**
 * Pozycje menu. „Darmowy szablon” zapowiada działający szablon, więc pokazujemy ją tylko z ustawionym
 * NEXT_PUBLIC_TEMPLATE_URL (PROMPT.md §2.5, docs/decisions.md p. 17: strona mówi tylko o tym, co działa).
 */
const NAV_ITEMS = copy.nav.site.filter((item) => templateUrl || item.href !== TEMPLATE_NAV_HREF);

/**
 * Nagłówek strony marketingowej (EkranLanding, EkranLandingMobile). Menu mobilne bez JavaScriptu.
 * CTA niosą ?src= — /nowy zapisuje z niego zdarzenie landing_cta_click (lib/analytics/events.ts).
 * Linki do tras z własną CSP z nonce (/nowy, /logowanie) to zwykłe <a> — pełne wczytanie dokumentu (ToolLink).
 */
export function SiteHeader() {
  return (
    <header className={s.header}>
      <div className={s.inner}>
        <Link href="/" aria-label={copy.nav.home} className={s.home}>
          <Logo className={s.logo} decorative />
        </Link>
        <nav className={`sd-nav ${s.nav}`} aria-label={copy.ui.siteNav}>
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={s.actions}>
          {features.accounts && (
            <a className="sd-link" href="/logowanie">
              {copy.nav.login}
            </a>
          )}
          <ToolLink className={buttonClass({ variant: 'primary' })} src="header">
            {copy.cta.primary}
          </ToolLink>
        </div>
        <details className={s.menu}>
          <summary className={`sd-btn sd-btn--ghost ${s.menuButton}`} aria-label={copy.nav.menu}>
            <Icon name="menu" size="l" />
          </summary>
          <nav className={`sd-card ${s.menuList}`} aria-label={copy.ui.siteNav}>
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
            {features.accounts && <a href="/logowanie">{copy.nav.login}</a>}
            <ToolLink className={buttonClass({ variant: 'primary', size: 'l', block: true })} src="menu">
              {copy.cta.primary}
            </ToolLink>
          </nav>
        </details>
      </div>
    </header>
  );
}
