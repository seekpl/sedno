/**
 * Zasada 7 (CLAUDE.md): wygląd wyłącznie z brand/. Żadnych nowych kolorów, cieni ani promieni spoza tokenów.
 * Skanuje CSS Modules i atrybuty style= w kodzie aplikacji. Wyjątek tylko z komentarzem
 * „ref: <plik makiety>” w tej samej linii (wartość przepisana z brand/reference/).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['app', 'components', 'styles'];
const SKIP = new Set([path.normalize('styles/tokens.css')]);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = ROOTS.flatMap(walk).filter((f) => /\.(css|tsx?)$/.test(f) && !SKIP.has(path.normalize(f)));

type Violation = { file: string; line: number; text: string; rule: string };

const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\blab\(/;
const NAMED_COLOR = /:[^;]*\b(?:white|black|red|blue|green|yellow|gr[ae]y|orange|purple|pink)\b/;

function check(file: string): Violation[] {
  const out: Violation[] = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const isCss = file.endsWith('.css');
  lines.forEach((text, i) => {
    if (/ref: brand\/reference\//.test(text)) return;
    // W TSX sprawdzamy tylko style inline (style={{…}}); reszta kodu może zawierać np. „#” w adresach.
    const scope = isCss ? text : (/style=\{\{(.*)\}\}/.exec(text)?.[1] ?? '');
    if (!scope) return;
    if (COLOR.test(scope) || NAMED_COLOR.test(scope))
      out.push({ file, line: i + 1, text, rule: 'kolor spoza tokenów' });
    if (/box-shadow\s*:|boxShadow/.test(scope) && !/var\(--shadow-[12]\)|:\s*none/.test(scope))
      out.push({ file, line: i + 1, text, rule: 'cień spoza tokenów' });
    if (
      /border-radius\s*:|borderRadius/.test(scope) &&
      !/var\(--radius-|:\s*(0|inherit|50%)\s*;?\s*$/.test(scope)
    )
      out.push({ file, line: i + 1, text, rule: 'promień spoza tokenów' });
    if (/linear-gradient|radial-gradient|backdrop-filter/.test(scope))
      out.push({ file, line: i + 1, text, rule: 'gradient lub efekt spoza marki' });
  });
  return out;
}

describe('strażnik marki', () => {
  it('skanuje pliki aplikacji', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('nie ma kolorów, cieni, promieni ani gradientów spoza tokenów', () => {
    const violations = files.flatMap(check);
    expect(violations.map((v) => `${v.file}:${v.line} ${v.rule}: ${v.text.trim()}`)).toEqual([]);
  });

  it('wykrywa naruszenia (kontrola, że strażnik działa)', () => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sedno-guard-')), 'x.module.css');
    fs.writeFileSync(
      tmp,
      [
        '.a { color: #fff; }',
        '.b { box-shadow: 0 0 2px black; }',
        '.c { border-radius: 12px; }',
        '.d { color: var(--ink); }',
      ].join('\n'),
    );
    expect(check(tmp).map((v) => v.line)).toEqual([1, 2, 2, 3]);
  });

  it('nie ma Tailwinda ani bibliotek komponentów w zależnościach', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as Record<string, Record<string, string>>;
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const banned = deps.filter((d) =>
      /^(tailwindcss|@tailwindcss\/|@mui\/|@chakra-ui\/|@radix-ui\/|@headlessui\/|antd|@mantine\/|styled-components|@emotion\/|bootstrap)/.test(
        d,
      ),
    );
    expect(banned).toEqual([]);
  });

  it('globalne style importują kolejno tokeny i komponenty z marki', () => {
    const css = fs.readFileSync('app/globals.css', 'utf8');
    const imports = [...css.matchAll(/@import '([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['../styles/tokens.css', '../brand/components.css']);
  });
});
