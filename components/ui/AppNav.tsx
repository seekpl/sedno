import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Logo } from './Logo';
import styles from './AppNav.module.css';
import { copy } from '@/lib/copy/pl';

export type NavItem = { href: string; label: string; current?: boolean };

type AppNavProps = {
  items?: NavItem[];
  homeHref?: string;
  homeLabel?: string;
  /** Przełącznik miesiąca — widoczny także na telefonie. */
  right?: ReactNode;
  /** Np. plakietka planu — tylko od 768 px (na telefonie: logo, przełącznik, menu). */
  desktopExtras?: ReactNode;
  logoHeight?: number;
};

/**
 * Pasek aplikacji (sd-topbar): logo, nawigacja, przełącznik miesiąca.
 * Na telefonie: logo, przełącznik i przycisk menu 48 × 48 rozwijający listę sekcji.
 */
export function AppNav({
  items = [],
  desktopExtras,
  homeHref = '/',
  homeLabel = copy.nav.home,
  right,
  logoHeight = 24,
}: AppNavProps) {
  return (
    <header className={`sd-topbar ${styles.bar}`}>
      <Link href={homeHref} aria-label={homeLabel} className={styles.home}>
        <Logo height={logoHeight} className="sd-topbar__logo" decorative />
      </Link>
      {items.length > 0 && (
        <nav className={`sd-nav ${styles.desktopNav}`} aria-label={copy.ui.appNav}>
          {items.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.current ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      <div className={`sd-row ${styles.right}`}>
        {right}
        {desktopExtras && <span className={styles.desktopOnly}>{desktopExtras}</span>}
        {items.length > 0 && (
          <details className={styles.menu}>
            <summary className={`sd-btn sd-btn--ghost ${styles.menuButton}`} aria-label={copy.nav.menu}>
              <Icon name="menu" size="l" />
            </summary>
            <nav className={`sd-card ${styles.menuList}`} aria-label={copy.ui.appNav}>
              {items.map((item) => (
                <Link key={item.href} href={item.href} aria-current={item.current ? 'page' : undefined}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </details>
        )}
      </div>
    </header>
  );
}
