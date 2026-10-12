import Link from 'next/link';
import { Icon } from './Icon';
import { copy } from '@/lib/copy/pl';

/** Numery stron: 1, bieżąca ±1, ostatnia, z „…” pomiędzy. */
export function pageItems(page: number, pageCount: number): (number | 'gap')[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...wanted].sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) items.push('gap');
    items.push(p);
  });
  return items;
}

type PaginationProps = {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  label: string;
};

/** Paginacja (sd-pages). */
export function Pagination({ page, pageCount, hrefFor, label }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav className="sd-pages" aria-label={label}>
      {page > 1 && (
        <Link href={hrefFor(page - 1)} aria-label={copy.ui.prevPage}>
          <Icon name="chevron-left" size="s" />
        </Link>
      )}
      {pageItems(page, pageCount).map((item, i) =>
        item === 'gap' ? (
          <span key={`gap-${i}`} aria-hidden="true">
            …
          </span>
        ) : item === page ? (
          <span key={item} aria-current="page">
            {item}
          </span>
        ) : (
          <Link key={item} href={hrefFor(item)}>
            {item}
          </Link>
        ),
      )}
      {page < pageCount && (
        <Link href={hrefFor(page + 1)} aria-label={copy.ui.nextPage}>
          <Icon name="chevron-right" size="s" />
        </Link>
      )}
    </nav>
  );
}
