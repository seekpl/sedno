/**
 * Generuje styles/tokens.css i lib/brand/tokens.generated.ts z brand/tokens.json.
 * Wynik CSS jest równoważny brand/tokens.css (różni się tylko ścieżką do fontów: /fonts/ w public/).
 *
 * Użycie: pnpm tokens            — zapisuje pliki
 *         pnpm tokens --check    — kończy się błędem, jeśli pliki są nieaktualne
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ThemeValue = string | { light: string; dark: string };
type TokenJson = {
  color: { tokens: { name: string; value: ThemeValue }[] };
  type: {
    fonts: { family: string; file: string; weight: string; style: string }[];
    families: Record<string, string>;
    groups: {
      family: string;
      styles: {
        name: string;
        fontSize: string;
        lineHeight: string;
        fontWeight: number;
        letterSpacing?: string;
        family?: string;
      }[];
    }[];
  };
  spacing: { tokens: { name: string; value: string }[] };
  radius: { tokens: { name: string; value: string }[] };
  shadow: { tokens: { name: string; value: { light: string; dark: string } }[] };
  size: { tokens: { name: string; value: string }[] };
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOKENS_JSON = path.join(ROOT, 'brand/tokens.json');
export const TOKENS_CSS_OUT = path.join(ROOT, 'styles/tokens.css');
export const TOKENS_TS_OUT = path.join(ROOT, 'lib/brand/tokens.generated.ts');
export const FONT_URL_PREFIX = '/fonts/';

const ALIAS = /^\{([a-z0-9-]+)\}$/;

function cssValue(value: string): string {
  const alias = ALIAS.exec(value);
  return alias ? `var(--${alias[1]})` : value;
}

function themeValue(value: ThemeValue, theme: 'light' | 'dark'): string {
  return typeof value === 'string' ? value : value[theme];
}

export function readTokens(): TokenJson {
  return JSON.parse(fs.readFileSync(TOKENS_JSON, 'utf8')) as TokenJson;
}

export function renderTokensCss(t: TokenJson): string {
  const lines: string[] = [
    '/* Sedno — tokens.css, wygenerowane z brand/tokens.json przez scripts/build-tokens.ts. Nie edytuj ręcznie: zmieniaj tokens.json i uruchom pnpm tokens. */',
  ];
  for (const theme of ['light', 'dark'] as const) {
    lines.push(theme === 'light' ? ':root, [data-theme="light"] {' : '[data-theme="dark"] {');
    for (const c of t.color.tokens) lines.push(`  --${c.name}: ${cssValue(themeValue(c.value, theme))};`);
    for (const s of t.shadow.tokens) lines.push(`  --${s.name}: ${s.value[theme]};`);
    if (theme === 'dark') lines.push('  color-scheme: dark;');
    lines.push('}');
  }
  lines.push(':root {');
  for (const group of [t.spacing.tokens, t.radius.tokens, t.size.tokens]) {
    for (const s of group) lines.push(`  --${s.name}: ${s.value};`);
  }
  for (const [name, stack] of Object.entries(t.type.families)) lines.push(`  --font-${name}: ${stack};`);
  lines.push('}');
  for (const f of t.type.fonts) {
    const file = path.basename(f.file);
    lines.push(
      `@font-face { font-family: "${f.family}"; src: url("${FONT_URL_PREFIX}${file}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style}; font-display: swap; }`,
    );
  }
  for (const group of t.type.groups) {
    for (const s of group.styles) {
      const family = s.family ?? group.family;
      const decl = [
        `font-family: var(--font-${family})`,
        `font-size: ${s.fontSize}`,
        `line-height: ${s.lineHeight}`,
        `font-weight: ${s.fontWeight}`,
      ];
      if (s.letterSpacing) decl.push(`letter-spacing: ${s.letterSpacing}`);
      // Style liczbowe mają cyfry tabelaryczne (brand/docs/0-zasady-marki.md, Typografia).
      if (s.name.includes('number')) decl.push('font-variant-numeric: tabular-nums');
      lines.push(`.${s.name} { ${decl.join('; ')}; }`);
    }
  }
  return lines.join('\n') + '\n';
}

function resolveColor(t: TokenJson, name: string, theme: 'light' | 'dark', depth = 0): string {
  const token = t.color.tokens.find((c) => c.name === name);
  if (!token || depth > 5) throw new Error(`Nieznany token koloru: ${name}`);
  const raw = themeValue(token.value, theme);
  const alias = ALIAS.exec(raw);
  return alias ? resolveColor(t, alias[1]!, theme, depth + 1) : raw;
}

const camel = (name: string) => name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export function renderTokensTs(t: TokenJson): string {
  const colors = (theme: 'light' | 'dark') =>
    Object.fromEntries(t.color.tokens.map((c) => [camel(c.name), resolveColor(t, c.name, theme)]));
  const dict = (tokens: { name: string; value: string }[]) =>
    Object.fromEntries(tokens.map((s) => [camel(s.name), s.value]));
  const data = {
    colors: { light: colors('light'), dark: colors('dark') },
    space: dict(t.spacing.tokens),
    radius: dict(t.radius.tokens),
    size: dict(t.size.tokens),
    fontFamily: t.type.families,
  };
  return (
    '// Wygenerowane z brand/tokens.json przez scripts/build-tokens.ts. Nie edytuj ręcznie.\n' +
    '// Wartości dla miejsc, które nie czytają zmiennych CSS (PDF, manifest). W CSS używaj var(--…).\n' +
    `export const tokens = ${JSON.stringify(data, null, 2)} as const;\n`
  );
}

function main() {
  const check = process.argv.includes('--check');
  const t = readTokens();
  const outputs: [string, string][] = [
    [TOKENS_CSS_OUT, renderTokensCss(t)],
    [TOKENS_TS_OUT, renderTokensTs(t)],
  ];
  let stale = false;
  for (const [file, content] of outputs) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current === content) continue;
    if (check) {
      console.error(`Nieaktualny plik: ${path.relative(ROOT, file)}. Uruchom pnpm tokens.`);
      stale = true;
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      console.log(`Zapisano ${path.relative(ROOT, file)}`);
    }
  }
  if (stale) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
