/**
 * Generuje lib/brand/svg.generated.ts z plików marki:
 * - ikony z brand/icons/*.svg (bez koloru: kolor daje klasa sd-icon przez currentColor),
 * - logotypy z brand/logo/*.svg (warianty z PROMPT.md §13),
 * - ścieżkę pętli zakreślenia z brand/reference/components/Circled.html.
 * Zapisuje dane (drzewo elementów), z których rysują zarówno komponenty HTML, jak i PDF.
 *
 * Użycie: tsx scripts/build-svg-assets.ts [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SvgNode = { tag: string; attrs: Record<string, string>; children?: SvgNode[] };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SVG_TS_OUT = path.join(ROOT, 'lib/brand/svg.generated.ts');

export const LOGO_FILES = {
  default: 'sedno-logo.svg',
  'on-dark': 'sedno-logo-on-dark.svg',
  'mono-ink': 'sedno-logo-mono-ink.svg',
  'mono-white': 'sedno-logo-mono-white.svg',
} as const;

const ATTR_RENAME: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
};
const DROP_ROOT_ATTRS = new Set([
  'xmlns',
  'width',
  'height',
  'role',
  'aria-label',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
]);

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of src.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) attrs[m[1]!] = m[2]!;
  return attrs;
}

/** Minimalny parser SVG z plików marki: elementy, atrybuty, zagnieżdżenie; tekst pomijany. */
export function parseSvg(src: string): { attrs: Record<string, string>; children: SvgNode[] } {
  const root: SvgNode = { tag: '#root', attrs: {}, children: [] };
  const stack: SvgNode[] = [root];
  for (const m of src.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, rawAttrs, selfClosing] = m;
    if (closing) {
      stack.pop();
      continue;
    }
    const node: SvgNode = { tag: tag!, attrs: parseAttrs(rawAttrs ?? '') };
    stack.at(-1)!.children!.push(node);
    if (!selfClosing) {
      node.children = [];
      stack.push(node);
    }
  }
  const svg = root.children![0];
  if (!svg || svg.tag !== 'svg') throw new Error('Brak elementu <svg>');
  return { attrs: svg.attrs, children: svg.children ?? [] };
}

function reactAttrs(node: SvgNode): SvgNode {
  const attrs = Object.fromEntries(Object.entries(node.attrs).map(([k, v]) => [ATTR_RENAME[k] ?? k, v]));
  const out: SvgNode = { tag: node.tag, attrs };
  if (node.children?.length) out.children = node.children.map(reactAttrs);
  return out;
}

export function buildIcons(dir = path.join(ROOT, 'brand/icons')) {
  const icons: Record<string, { label: string; nodes: SvgNode[] }> = {};
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.svg'))
    .sort()) {
    const { attrs, children } = parseSvg(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (attrs.viewBox !== '0 0 24 24') throw new Error(`${file}: oczekiwano viewBox 0 0 24 24`);
    for (const k of Object.keys(attrs)) {
      if (k !== 'viewBox' && !DROP_ROOT_ATTRS.has(k)) throw new Error(`${file}: nieobsługiwany atrybut ${k}`);
    }
    icons[file.replace(/\.svg$/, '')] = { label: attrs['aria-label'] ?? '', nodes: children.map(reactAttrs) };
  }
  return icons;
}

export function buildLogos(dir = path.join(ROOT, 'brand/logo')) {
  return Object.fromEntries(
    Object.entries(LOGO_FILES).map(([variant, file]) => {
      const { attrs, children } = parseSvg(fs.readFileSync(path.join(dir, file), 'utf8'));
      return [variant, { viewBox: attrs.viewBox!, nodes: children.map(reactAttrs) }];
    }),
  );
}

export function extractCirclePath(file = path.join(ROOT, 'brand/reference/components/Circled.html')): string {
  const html = fs.readFileSync(file, 'utf8');
  const paths = new Set(
    [...html.matchAll(/<svg class="sd-circled__ring"[^>]*><path d="([^"]+)"/g)].map((m) => m[1]!),
  );
  if (paths.size !== 1) throw new Error(`Oczekiwano jednej ścieżki pętli, znaleziono ${paths.size}`);
  return [...paths][0]!;
}

export function renderSvgTs(): string {
  const icons = buildIcons();
  const iconNodes = Object.fromEntries(Object.entries(icons).map(([k, v]) => [k, v.nodes]));
  const iconLabels = Object.fromEntries(Object.entries(icons).map(([k, v]) => [k, v.label]));
  return [
    '// Wygenerowane przez scripts/build-svg-assets.ts z brand/icons, brand/logo i brand/reference/components/Circled.html.',
    '// Nie edytuj ręcznie.',
    'export type SvgNode = { tag: string; attrs: Record<string, string>; children?: SvgNode[] };',
    '',
    `export const iconNodes = ${JSON.stringify(iconNodes)} as const satisfies Record<string, readonly SvgNode[]>;`,
    '',
    'export type IconName = keyof typeof iconNodes;',
    '',
    '/** Etykiety z plików marki (aria-label), do ikon bez tekstu. */',
    `export const iconLabels: Record<IconName, string> = ${JSON.stringify(iconLabels, null, 2)};`,
    '',
    `export const logos = ${JSON.stringify(buildLogos())} as const satisfies Record<string, { viewBox: string; nodes: readonly SvgNode[] }>;`,
    '',
    'export type LogoVariant = keyof typeof logos;',
    '',
    '/** Pętla zakreślenia (viewBox 0 0 100 100), ta sama w HTML i PDF. */',
    `export const circledPath = ${JSON.stringify(extractCirclePath())};`,
    '',
  ].join('\n');
}

function main() {
  const content = renderSvgTs();
  const current = fs.existsSync(SVG_TS_OUT) ? fs.readFileSync(SVG_TS_OUT, 'utf8') : '';
  if (current === content) return;
  if (process.argv.includes('--check')) {
    console.error('Nieaktualny plik lib/brand/svg.generated.ts. Uruchom pnpm assets.');
    process.exit(1);
  }
  fs.writeFileSync(SVG_TS_OUT, content);
  console.log('Zapisano lib/brand/svg.generated.ts');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
