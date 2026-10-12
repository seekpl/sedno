import Link from 'next/link';
import { buttonClass } from '@/components/ui/buttonClass';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { features } from '@/config/features';
import { copy } from '@/lib/copy/pl';
import s from './SiteHeader.module.css';

/** Nagłówek strony marketingowej (EkranLanding, EkranLandingMobile). Menu mobilne bez JavaScriptu. */
export function SiteHeader() {
  return (
    <header className={s.header}>
      <div className={s.inner}>
        <Link href="/" aria-label={copy.nav.home} className={s.home}>
          <Logo className={s.logo} decorative />
        </Link>
        <nav className={`sd-nav ${s.nav}`} aria-label={copy.ui.siteNav}>
          {copy.nav.site.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={s.actions}>
          {features.accounts && (
            <Link className="sd-link" href="/logowanie">
              {copy.nav.login}
            </Link>
          )}
          <Link className={buttonClass({ variant: 'primary' })} href="/nowy">
            {copy.cta.primary}
          </Link>
        </div>
        <details className={s.menu}>
          <summary className={`sd-btn sd-btn--ghost ${s.menuButton}`} aria-label={copy.nav.menu}>
            <Icon name="menu" size="l" />
          </summary>
          <nav className={`sd-card ${s.menuList}`} aria-label={copy.ui.siteNav}>
            {copy.nav.site.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
            {features.accounts && <Link href="/logowanie">{copy.nav.login}</Link>}
            <Link className={buttonClass({ variant: 'primary', size: 'l', block: true })} href="/nowy">
              {copy.cta.primary}
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
