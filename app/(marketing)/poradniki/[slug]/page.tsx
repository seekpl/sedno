import type { MDXContent } from 'mdx/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@/components/site/seo';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { getGuide, GUIDES } from '@/content/poradniki';
import { copy } from '@/lib/copy/pl';
import s from './page.module.css';

type Params = { params: Promise<{ slug: string }> };

const t = copy.landing.guides;

/** Miejsce na zrzut ekranu w szkicu (bez instrukcji klikania, PROMPT.md §12). */
function Screenshot({ of }: { of: string }) {
  return <p className={s.screenshot}>{t.screenshot(of)}</p>;
}

/** Nagłówek rozdziału ze stałą kotwicą (np. #eksport, #efekty — linkuje do nich /nowy). */
function SectionHeading({ id, title }: { id: string; title: string }) {
  return (
    <h2 id={id} className="heading-2">
      {title}
    </h2>
  );
}

/** Komponenty dostępne w plikach MDX poradników (typografia nagłówków i akapitów: mdx-components.tsx). */
const ARTICLE_COMPONENTS = { Screenshot, SectionHeading };

// Tylko artykuły z rejestru (content/poradniki/index.ts); inne adresy dają 404.
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  return pageMetadata({
    path: `/poradniki/${guide.slug}`,
    title: guide.title,
    description: guide.description,
    type: 'article',
  });
}

/** Poradnik MDX (PROMPT.md §12). Typografia z mdx-components.tsx; szkic ma wyraźne oznaczenie. */
export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  const { default: Article } = (await import(`@/content/poradniki/${guide.slug}.mdx`)) as {
    default: MDXContent;
  };

  return (
    <div className={s.page}>
      <p className={s.back}>
        <Link className="sd-link" href="/poradniki">
          <Icon name="chevron-left" size="s" />
          {t.back}
        </Link>
      </p>
      {guide.status === 'draft' && (
        <Badge icon="file" className={s.draft}>
          {t.draftNotice}
        </Badge>
      )}
      <article className={s.article}>
        <Article components={ARTICLE_COMPONENTS} />
      </article>
    </div>
  );
}
