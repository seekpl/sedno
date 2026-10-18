/**
 * Generuje szablony e-maili Supabase Auth z lib/copy/auth.ts i kolorów jasnego motywu marki
 * (lib/brand/tokens.generated.ts):
 * - supabase/templates/magic-link.html (powracający użytkownik) i confirmation.html (nowy adres) — ta sama
 *   treść, bo oba są linkiem logowania; zmienna Go {{ .ConfirmationURL }} to link z Supabase Auth,
 * - supabase/templates/subjects.json — tematy ({"magicLink", "confirmation"}) dla lokalnego stosu.
 *
 * Tylko style inline, bez obrazków i skryptów; lang="pl", prawdziwy link z tekstem i adres tekstem obok.
 * Stopka mówi, że Sedno nie jest powiązane z Meta (brand/docs/0-zasady-marki.md).
 *
 * Użycie: pnpm emails            — zapisuje pliki
 *         pnpm emails --check    — kończy się błędem, jeśli pliki są nieaktualne
 * Test tests/unit/auth-email-templates.test.ts pilnuje, że pliki w repozytorium są aktualne.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokens } from '../lib/brand/tokens.generated';
import { auth } from '../lib/copy/auth';
import { common } from '../lib/copy/common';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATES_DIR = path.join(ROOT, 'supabase/templates');

/** Zmienna Supabase Auth (Go template) z linkiem logowania. */
export const CONFIRMATION_URL = '{{ .ConfirmationURL }}';

const c = tokens.colors.light;
const text = tokens.fontFamily.text.replaceAll('"', "'");
const display = tokens.fontFamily.display.replaceAll('"', "'");

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Atrybut style z par [właściwość, wartość]. */
function style(rules: Record<string, string>): string {
  return Object.entries(rules)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}

const e = auth.email;

/** Treść wiadomości z linkiem logowania (HTML z Go template). */
export function renderLoginEmail(): string {
  const body = style({
    margin: '0',
    padding: '0',
    'background-color': c.paper,
    color: c.ink,
  });
  const card = style({
    'max-width': '560px',
    'background-color': c.surface,
    border: `1px solid ${c.line}`,
    'border-radius': tokens.radius.radiusL,
  });
  const cell = style({
    padding: tokens.space.space6,
    'font-family': text,
    'font-size': '16px',
    'line-height': '24px',
    color: c.ink,
  });
  const brand = style({
    margin: `0 0 ${tokens.space.space5}`,
    'font-family': display,
    'font-size': '20px',
    'line-height': '24px',
    'font-weight': '700',
    color: c.ink,
  });
  const heading = style({
    margin: `0 0 ${tokens.space.space3}`,
    'font-family': display,
    'font-size': '24px',
    'line-height': '30px',
    'font-weight': '700',
    color: c.ink,
  });
  const paragraph = style({ margin: `0 0 ${tokens.space.space5}` });
  const buttonCell = style({ 'border-radius': tokens.radius.radiusM, 'background-color': c.pen });
  const button = style({
    display: 'inline-block',
    padding: `${tokens.space.space3} ${tokens.space.space5}`,
    'font-family': text,
    'font-size': '16px',
    'line-height': '24px',
    'font-weight': '700',
    color: c.onPen,
    'text-decoration': 'none',
    'border-radius': tokens.radius.radiusM,
  });
  const small = (margin: string) =>
    style({ margin, 'font-size': '14px', 'line-height': '20px', color: c.inkSecondary });
  const url = style({
    margin: `0 0 ${tokens.space.space5}`,
    'font-size': '14px',
    'line-height': '20px',
    'word-break': 'break-all',
  });
  const link = style({ color: c.pen, 'text-decoration': 'underline' });
  const footer = style({
    'max-width': '560px',
    margin: `${tokens.space.space5} auto 0`,
    'font-family': text,
    'font-size': '13px',
    'line-height': '18px',
    color: c.inkMuted,
    'text-align': 'left',
  });
  const preheader = style({
    display: 'none',
    'max-height': '0',
    overflow: 'hidden',
    'mso-hide': 'all',
  });

  return `<!doctype html>
<html lang="pl" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(e.subject)}</title>
</head>
<body style="${body}">
<div style="${preheader}">${escapeHtml(e.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${style({ 'background-color': c.paper })}">
<tr>
<td align="center" style="${style({ padding: `${tokens.space.space6} ${tokens.space.space4}` })}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${card}">
<tr>
<td style="${cell}">
<p style="${brand}">${escapeHtml(e.brand)}</p>
<h1 style="${heading}">${escapeHtml(e.heading)}</h1>
<p style="${paragraph}">${escapeHtml(e.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="${buttonCell}"><a href="${CONFIRMATION_URL}" style="${button}">${escapeHtml(e.button)}</a></td>
</tr>
</table>
<p style="${small(`${tokens.space.space5} 0 ${tokens.space.space2}`)}">${escapeHtml(e.fallback)}</p>
<p style="${url}"><a href="${CONFIRMATION_URL}" style="${link}">${CONFIRMATION_URL}</a></p>
<p style="${small('0')}">${escapeHtml(e.ignore)}</p>
</td>
</tr>
</table>
<p style="${footer}">${escapeHtml(e.automatic)} ${escapeHtml(common.legal.meta)}</p>
</td>
</tr>
</table>
</body>
</html>
`;
}

/** Tematy wiadomości dla lokalnego stosu (scripts/local-supabase) — jak w supabase/config.toml. */
export function renderSubjects(): string {
  return `${JSON.stringify({ magicLink: e.subject, confirmation: e.subject }, null, 2)}\n`;
}

/** Pliki do zapisania: [ścieżka, treść]. */
export function emailTemplateOutputs(): [string, string][] {
  const html = renderLoginEmail();
  return [
    [path.join(TEMPLATES_DIR, 'magic-link.html'), html],
    [path.join(TEMPLATES_DIR, 'confirmation.html'), html],
    [path.join(TEMPLATES_DIR, 'subjects.json'), renderSubjects()],
  ];
}

function main() {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const [file, content] of emailTemplateOutputs()) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current === content) continue;
    if (check) {
      console.error(`Nieaktualny plik: ${path.relative(ROOT, file)}. Uruchom pnpm emails.`);
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
