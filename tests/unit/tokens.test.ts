import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FONT_URL_PREFIX,
  TOKENS_CSS_OUT,
  TOKENS_TS_OUT,
  readTokens,
  renderTokensCss,
  renderTokensTs,
} from '@/scripts/build-tokens';

const brandCss = fs.readFileSync(path.resolve('brand/tokens.css'), 'utf8');
const body = (css: string) => css.split('\n').slice(1).join('\n'); // bez komentarza nagłówka

describe('scripts/build-tokens', () => {
  it('generuje CSS równoważny brand/tokens.css (poza ścieżką fontów)', () => {
    const generated = renderTokensCss(readTokens());
    expect(body(generated)).toBe(body(brandCss.replaceAll('./fonts/web/', FONT_URL_PREFIX)));
  });

  it('styles/tokens.css jest aktualny (nie edytuj ręcznie, uruchom pnpm tokens)', () => {
    expect(fs.readFileSync(TOKENS_CSS_OUT, 'utf8')).toBe(renderTokensCss(readTokens()));
  });

  it('lib/brand/tokens.generated.ts jest aktualny', () => {
    expect(fs.readFileSync(TOKENS_TS_OUT, 'utf8')).toBe(renderTokensTs(readTokens()));
  });

  it('rozwiązuje aliasy kolorów w stałych TS', async () => {
    const { tokens } = await import('@/lib/brand/tokens.generated');
    expect(tokens.colors.light.focus).toBe(tokens.colors.light.pen);
    expect(tokens.colors.light.pen).toBe('#2A3CD4');
    expect(tokens.colors.dark.reportPaper).toBe('#FFFFFF');
  });

  it('@font-face wskazuje na pliki, które istnieją w public/fonts', () => {
    const urls = [...renderTokensCss(readTokens()).matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]!);
    expect(urls).toHaveLength(2);
    for (const url of urls) expect(fs.existsSync(path.join('public', url))).toBe(true);
  });
});
