import type { CSSProperties } from 'react';

/** Szkielet ładowania (sd-skel). Dekoracyjny — postęp ogłasza tekst obok. */
export function Skeleton({
  width,
  height,
}: {
  width: CSSProperties['width'];
  height: CSSProperties['height'];
}) {
  return <div className="sd-skel" style={{ width, height }} aria-hidden="true" />;
}
