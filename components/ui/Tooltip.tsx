'use client';

import { useId, useState, type ReactNode } from 'react';
import styles from './Tooltip.module.css';

/** Sam dymek (sd-tip). */
export function TooltipBubble({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span id={id} className={className ? `sd-tip ${className}` : 'sd-tip'} role="tooltip">
      {children}
    </span>
  );
}

/**
 * Podpowiedź nad elementem: pokazuje się przy najechaniu i fokusie, znika po Esc.
 * Element dostaje aria-describedby, więc treść jest dostępna także bez najechania.
 */
export function Tooltip({
  content,
  children,
}: {
  content: ReactNode;
  children: (describedBy: string) => ReactNode;
}) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return (
    <span
      className={styles.anchor}
      data-dismissed={dismissed || undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDismissed(true);
      }}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      {children(id)}
      <TooltipBubble id={id} className={styles.bubble}>
        {content}
      </TooltipBubble>
    </span>
  );
}
