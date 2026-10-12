import { createElement, type ReactNode } from 'react';
import type { SvgNode } from '@/lib/brand/svg.generated';

/** Rysuje drzewo elementów SVG wygenerowane z plików marki (lib/brand/svg.generated.ts). */
export function renderSvgNodes(nodes: readonly SvgNode[], keyPrefix = 'n'): ReactNode[] {
  return nodes.map((node, i) =>
    createElement(
      node.tag,
      { key: `${keyPrefix}${i}`, ...node.attrs },
      node.children ? renderSvgNodes(node.children, `${keyPrefix}${i}-`) : undefined,
    ),
  );
}
