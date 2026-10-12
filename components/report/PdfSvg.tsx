/**
 * Ikony i logo marki w PDF: te same dane co w HTML (lib/brand/svg.generated.ts), rysowane prymitywami
 * @react-pdf/renderer. PDF nie zna currentColor ani klas, więc kolory i grubość kreski podajemy jawnie
 * (wartości z .sd-icon w brand/components.css). Moduł tylko dla PDF — ładowany dynamicznie.
 */
import { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect, Svg } from '@react-pdf/renderer';
import { createElement, type ElementType, type ReactNode } from 'react';
import { iconNodes, logos, type IconName, type LogoVariant, type SvgNode } from '@/lib/brand/svg.generated';

const PRIMITIVES: Record<string, ElementType> = {
  g: G,
  path: Path,
  circle: Circle,
  ellipse: Ellipse,
  rect: Rect,
  line: Line,
  polygon: Polygon,
  polyline: Polyline,
};

/** Drzewo SVG z plików marki jako elementy react-pdf. Nieznane znaczniki pomijamy. */
export function renderPdfSvgNodes(nodes: readonly SvgNode[], keyPrefix = 'n'): ReactNode[] {
  return nodes.map((node, i) => {
    const component = PRIMITIVES[node.tag];
    if (!component) return null;
    const key = `${keyPrefix}${i}`;
    const children = node.children ? renderPdfSvgNodes(node.children, `${key}-`) : undefined;
    return createElement(component, { key, ...node.attrs }, children);
  });
}

/** Grubość kreski ikon (.sd-icon w brand/components.css) w jednostkach viewBox 24×24. */
const ICON_STROKE = 1.75;

export function PdfIcon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return (
    <Svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      {/* Atrybuty dziedziczy tylko <G>, nie korzeń <Svg>. */}
      <G stroke={color} fill="none" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
        {renderPdfSvgNodes(iconNodes[name])}
      </G>
    </Svg>
  );
}

/** Logo Sedno (kolory z pliku marki). Wysokość w pt; szerokość z proporcji viewBox. */
export function PdfLogo({ variant = 'default', height }: { variant?: LogoVariant; height: number }) {
  const logo = logos[variant];
  const [, , w, h] = logo.viewBox.split(/\s+/).map(Number);
  const width = w && h ? (height * w) / h : height;
  return (
    <Svg viewBox={logo.viewBox} style={{ width, height }}>
      {renderPdfSvgNodes(logo.nodes)}
    </Svg>
  );
}
