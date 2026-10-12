import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { copy } from '@/lib/copy/pl';
import s from './SiteFooter.module.css';

/** Stopka strony z informacją prawną o znakach Meta (PROMPT.md §12, §14 legal.meta). */
export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.inner}>
        <Logo height={22} />
        <p className="caption sd-muted">{copy.legal.meta}</p>
        <nav className={s.links} aria-label={copy.footer.navLabel}>
          {copy.footer.links.map((link) => (
            <Link key={link.href} className="sd-link" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
