import type { ReactNode } from 'react';

/** Pusty stan z czasownikiem i przykładem (sd-empty). */
export function EmptyState({
  title,
  children,
  actions,
  headingLevel = 2,
}: {
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="sd-empty">
      <Heading className="sd-empty__title">{title}</Heading>
      {children && <p className="sd-empty__body">{children}</p>}
      {actions && <div className="sd-row">{actions}</div>}
    </div>
  );
}
