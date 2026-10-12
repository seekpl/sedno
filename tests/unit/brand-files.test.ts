import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderSvgTs, SVG_TS_OUT, buildIcons, parseSvg } from '@/scripts/build-svg-assets';
import { BRAND_FILE_COPIES } from '@/scripts/sync-brand-files';
import { iconLabels, iconNodes, logos } from '@/lib/brand/svg.generated';

describe('pliki z brand/', () => {
  it.each(BRAND_FILE_COPIES)('%s → %s ma identyczne bajty', (from, to) => {
    expect(fs.readFileSync(path.resolve(to)).equals(fs.readFileSync(path.resolve('brand', from)))).toBe(true);
  });

  it('lib/brand/svg.generated.ts jest aktualny (uruchom pnpm assets)', () => {
    expect(fs.readFileSync(SVG_TS_OUT, 'utf8')).toBe(renderSvgTs());
  });

  it('każda ikona z brand/icons ma komponent i etykietę', () => {
    const files = fs.readdirSync('brand/icons').filter((f) => f.endsWith('.svg'));
    expect(Object.keys(iconNodes).sort()).toEqual(files.map((f) => f.replace('.svg', '')).sort());
    for (const label of Object.values(iconLabels)) expect(label.length).toBeGreaterThan(0);
  });

  it('ikony nie mają koloru na sztywno (kolor daje currentColor z sd-icon)', () => {
    expect(JSON.stringify(buildIcons())).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('logo ma cztery warianty z PROMPT.md §13', () => {
    expect(Object.keys(logos).sort()).toEqual(['default', 'mono-ink', 'mono-white', 'on-dark']);
  });

  it('parser SVG czyta zagnieżdżone elementy', () => {
    const svg = parseSvg('<svg viewBox="0 0 1 1"><g fill="#000"><path d="M0 0"/></g><circle r="1"/></svg>');
    expect(svg.attrs.viewBox).toBe('0 0 1 1');
    expect(svg.children).toEqual([
      { tag: 'g', attrs: { fill: '#000' }, children: [{ tag: 'path', attrs: { d: 'M0 0' } }] },
      { tag: 'circle', attrs: { r: '1' } },
    ]);
  });
});
