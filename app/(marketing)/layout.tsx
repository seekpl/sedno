import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import s from './layout.module.css';

/** Strona marketingowa: zawsze jasna (PROMPT.md §12), statyczna. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className={s.site}>
      <SiteHeader />
      <main id="tresc">{children}</main>
      <SiteFooter />
    </div>
  );
}
