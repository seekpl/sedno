import type { Metadata } from 'next';
import { pageMetadata } from '@/components/site/seo';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/buttonClass';
import { Icon } from '@/components/ui/Icon';
import { templateUrl } from '@/config/features';
import { copy } from '@/lib/copy/pl';
import { cx } from '@/lib/cx';
import s from './page.module.css';

const t = copy.landing.tools;

export const metadata: Metadata = pageMetadata({
  path: '/szablon',
  title: t.template.title,
  description: copy.landing.seo.template.description,
});

/**
 * Darmowy szablon (PROMPT.md §12): „Dostępne” i link tylko z NEXT_PUBLIC_TEMPLATE_URL,
 * w przeciwnym razie „Wkrótce” bez linku (zasada 5).
 */
export default function TemplatePage() {
  return (
    <article className={s.page}>
      {templateUrl ? (
        <Badge variant="success" icon="check">
          {t.available}
        </Badge>
      ) : (
        <Badge>{t.soon}</Badge>
      )}
      <h1 className={cx('display-l', s.title)}>{t.template.title}</h1>
      <p className="body-l sd-secondary">{templateUrl ? t.template.body : copy.landing.template.soonBody}</p>
      {templateUrl && (
        <a
          className={buttonClass({ variant: 'primary', size: 'l', className: s.download })}
          href={templateUrl}
          rel="noopener noreferrer"
        >
          <Icon name="download" />
          {t.template.link}
        </a>
      )}
    </article>
  );
}
