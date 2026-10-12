/**
 * Kopiuje pliki z brand/ do miejsc, z których serwuje je aplikacja (public/).
 * brand/ pozostaje jedynym źródłem — test tests/unit/brand-files.test.ts sprawdza zgodność bajtów.
 *
 * Użycie: tsx scripts/sync-brand-files.ts [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** [źródło w brand/, cel względem katalogu projektu] */
export const BRAND_FILE_COPIES: [string, string][] = [
  ['fonts/web/BricolageGrotesque-Variable.woff2', 'public/fonts/BricolageGrotesque-Variable.woff2'],
  [
    'fonts/web/AtkinsonHyperlegibleNext-Variable.woff2',
    'public/fonts/AtkinsonHyperlegibleNext-Variable.woff2',
  ],
  ['fonts/OFL-BricolageGrotesque.txt', 'public/fonts/OFL-BricolageGrotesque.txt'],
  ['fonts/OFL-AtkinsonHyperlegibleNext.txt', 'public/fonts/OFL-AtkinsonHyperlegibleNext.txt'],
  ['fonts/pdf/BricolageGrotesque-Medium.ttf', 'public/fonts/pdf/BricolageGrotesque-Medium.ttf'],
  ['fonts/pdf/BricolageGrotesque-SemiBold.ttf', 'public/fonts/pdf/BricolageGrotesque-SemiBold.ttf'],
  ['fonts/pdf/BricolageGrotesque-Bold.ttf', 'public/fonts/pdf/BricolageGrotesque-Bold.ttf'],
  ['fonts/pdf/AtkinsonHyperlegibleNext-Regular.ttf', 'public/fonts/pdf/AtkinsonHyperlegibleNext-Regular.ttf'],
  [
    'fonts/pdf/AtkinsonHyperlegibleNext-SemiBold.ttf',
    'public/fonts/pdf/AtkinsonHyperlegibleNext-SemiBold.ttf',
  ],
  ['fonts/pdf/AtkinsonHyperlegibleNext-Bold.ttf', 'public/fonts/pdf/AtkinsonHyperlegibleNext-Bold.ttf'],
  ['app-icons/sedno-favicon.svg', 'public/favicon.svg'],
  ['app-icons/favicon-16.png', 'public/favicon-16.png'],
  ['app-icons/favicon-32.png', 'public/favicon-32.png'],
  ['app-icons/favicon-48.png', 'public/favicon-48.png'],
  ['app-icons/apple-touch-icon.png', 'public/apple-touch-icon.png'],
  ['app-icons/icon-192.png', 'public/icon-192.png'],
  ['app-icons/icon-512.png', 'public/icon-512.png'],
];

function main() {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const [from, to] of BRAND_FILE_COPIES) {
    const src = fs.readFileSync(path.join(ROOT, 'brand', from));
    const dest = path.join(ROOT, to);
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(src)) continue;
    if (check) {
      console.error(`Nieaktualna kopia: ${to}. Uruchom pnpm assets.`);
      stale = true;
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, src);
    console.log(`Skopiowano ${to}`);
  }
  if (stale) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
