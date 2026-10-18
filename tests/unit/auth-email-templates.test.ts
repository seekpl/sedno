/**
 * Szablony e-maili Supabase Auth (scripts/build-email-templates.ts): pliki w repozytorium są aktualne
 * (pnpm emails), treść z lib/copy/auth.ts, link {{ .ConfirmationURL }} jako przycisk i jako tekst, jasne kolory
 * marki, tylko style inline, bez obrazków i skryptów, informacja o braku powiązania z Meta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokens } from '@/lib/brand/tokens.generated';
import { auth as t, LINK_VALID_FOR } from '@/lib/copy/auth';
import { common } from '@/lib/copy/common';
import {
  CONFIRMATION_URL,
  emailTemplateOutputs,
  renderLoginEmail,
  renderSubjects,
  TEMPLATES_DIR,
} from '@/scripts/build-email-templates';
import { OTP_EXPIRY_SECONDS } from '@/scripts/local-supabase/config';

const html = renderLoginEmail();
/** Tekst bez znaczników (encje, które generator koduje, zamienione z powrotem). */
const plain = html
  .replace(/<[^>]+>/g, ' ')
  .replaceAll('&quot;', '"')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&');

describe('szablony e-maili logowania', () => {
  it('pliki w supabase/templates są aktualne (nie edytuj ręcznie, uruchom pnpm emails)', () => {
    const outputs = emailTemplateOutputs();
    expect(outputs.map(([file]) => path.relative(TEMPLATES_DIR, file)).sort()).toEqual([
      'confirmation.html',
      'magic-link.html',
      'subjects.json',
    ]);
    for (const [file, content] of outputs) expect(fs.readFileSync(file, 'utf8')).toBe(content);
  });

  it('nowy i powracający użytkownik dostają tę samą treść', () => {
    const read = (name: string) => fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
    expect(read('confirmation.html')).toBe(read('magic-link.html'));
  });

  it('tematy z auth.email.subject (PROMPT.md §14)', () => {
    expect(JSON.parse(renderSubjects())).toEqual({
      magicLink: 'Twój link do logowania w Sedno',
      confirmation: 'Twój link do logowania w Sedno',
    });
  });

  it('po polsku, z tytułem i dostępną strukturą', () => {
    expect(html).toMatch(/^<!doctype html>\n<html lang="pl"/);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain(`<title>${t.email.subject}</title>`);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    // Tabele układu są prezentacyjne (czytnik ekranu nie czyta ich jak danych).
    expect(html.match(/<table\b/g)?.length).toBe(html.match(/<table role="presentation"/g)?.length);
  });

  it('link jako przycisk z tekstem i jako adres do skopiowania', () => {
    const links = [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
    expect(links.map((m) => m[1])).toEqual([CONFIRMATION_URL, CONFIRMATION_URL]);
    expect(links.map((m) => m[2])).toEqual([t.email.button, CONFIRMATION_URL]);
    expect(CONFIRMATION_URL).toBe('{{ .ConfirmationURL }}');
  });

  it('mówi o godzinie ważności, o tym samym urządzeniu i o zignorowaniu cudzej prośby', () => {
    for (const text of [
      t.email.heading,
      t.email.intro,
      t.email.fallback,
      t.email.ignore,
      common.legal.meta,
    ]) {
      expect(plain).toContain(text);
    }
    expect(plain).toContain('przez godzinę');
    expect(plain).toContain('na tym samym urządzeniu');
    expect(plain).toContain('zignoruj tę wiadomość');
  });

  it('tylko style inline i kolory jasnego motywu marki; bez obrazków, skryptów i arkuszy', () => {
    expect(html).not.toMatch(/<(img|script|style|link|svg|iframe|form)\b/i);
    expect(html).not.toMatch(/\bclass=/);
    const colors = new Set(html.match(/#[0-9A-Fa-f]{6}\b/g));
    const light = new Set<string>(Object.values(tokens.colors.light));
    for (const color of colors) expect(light).toContain(color);
    expect(colors).toContain(tokens.colors.light.pen);
    expect(colors).toContain(tokens.colors.light.onPen);
  });

  it('bez emoji i wykrzykników, bez „Insta”/„Gram” w nazwach', () => {
    expect(plain).not.toMatch(/!/);
    expect(plain).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(plain).not.toMatch(/\binsta\b|\bgram\b/i);
  });
});

/** Wartość klucza z sekcji supabase/config.toml (prosty odczyt: klucz = wartość, bez zagnieżdżeń). */
function tomlValue(toml: string, section: string, key: string): string | undefined {
  const start = toml.indexOf(`\n[${section}]\n`);
  if (start === -1) return undefined;
  const body = toml.slice(start + section.length + 4).split(/\n\[/)[0] ?? '';
  const line = body.split('\n').find((l) => l.startsWith(`${key} =`));
  return line
    ?.slice(key.length + 3)
    .trim()
    .replace(/^"(.*)"$/, '$1');
}

describe('obietnice tekstów a konfiguracja Supabase Auth', () => {
  const toml = fs.readFileSync(path.join(TEMPLATES_DIR, '..', 'config.toml'), 'utf8');

  it('„Link działa przez godzinę”: ważność linku 3600 s lokalnie i w konfiguracji projektu', () => {
    expect(LINK_VALID_FOR).toBe('przez godzinę');
    expect(OTP_EXPIRY_SECONDS).toBe(3600);
    expect(tomlValue(toml, 'auth.email', 'otp_expiry')).toBe('3600');
  });

  it('tematy i szablony w config.toml wskazują wygenerowane pliki i auth.email.subject', () => {
    for (const [section, file] of [
      ['auth.email.template.magic_link', 'magic-link.html'],
      ['auth.email.template.confirmation', 'confirmation.html'],
    ] as const) {
      expect(tomlValue(toml, section, 'subject')).toBe(t.email.subject);
      expect(tomlValue(toml, section, 'content_path')).toBe(`./supabase/templates/${file}`);
      expect(fs.existsSync(path.join(TEMPLATES_DIR, file))).toBe(true);
    }
  });

  it('powrót z linku tylko na /auth/potwierdz, logowanie wyłącznie e-mailem', () => {
    const redirects = /additional_redirect_urls = \[([^\]]*)\]/.exec(toml)?.[1] ?? '';
    const urls = [...redirects.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/\/auth\/potwierdz\*\*$/);
    expect(tomlValue(toml, 'auth', 'enable_anonymous_sign_ins')).toBe('false');
    expect(tomlValue(toml, 'auth.sms', 'enable_signup')).toBe('false');
    expect(toml).not.toMatch(/\[auth\.external\.[a-z]+\][^[]*enabled = true/);
  });
});
