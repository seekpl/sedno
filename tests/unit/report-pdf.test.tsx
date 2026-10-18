/**
 * PDF raportu (PROMPT.md §11): polskie znaki, cudzysłowy, prawdziwy minus, metadane, stopka Sedno.
 * Tekst wyciągamy z gotowego pliku przez pdfjs-dist, więc test sprawdza to, co zobaczy klient.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { estimateWidth, keyFontSize, ReportPdf, scaleCircledPath } from '@/components/report/ReportPdf';
import { circledPath } from '@/lib/brand/svg.generated';
import { tokens } from '@/lib/brand/tokens.generated';
import { downloadReportPdf } from '@/lib/pdf/download';
import { pdfHyphenation, preparePdfFonts, registeredPdfFontBase, registerPdfFonts } from '@/lib/pdf/fonts';
import { EXAMPLE_REPORT } from '@/lib/report/example';
import { KEY_TRACKING_EM, numberWidthEm, reportView } from '@/lib/report/format';
import type { ReportData } from '@/lib/report/types';

const FONTS = path.resolve('public/fonts/pdf');
const CLIENT = 'Zażółć Gęślą Jaźń — Łódź';

function report(overrides: Partial<ReportData> = {}): ReportData {
  return { ...structuredClone(EXAMPLE_REPORT), ...overrides };
}

/** Raport ze spadkiem wyświetleń (11 000 → 10 000 = −9% m/m) i klientem z polskimi znakami. */
const DROP = report({
  client: { name: CLIENT },
  summary: { ...EXAMPLE_REPORT.summary, views: 10_000 },
  previous: {
    source: 'file',
    summary: { views: 11_000, follows: 51 },
    actions: { book: 17, call: 11, directions: 10 },
  },
});

async function render(data: ReportData, logoSrc?: string): Promise<Buffer> {
  const element = createElement(ReportPdf, {
    data,
    ...(logoSrc ? { logoSrc } : {}),
  }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

/** Najprostszy poprawny PNG (RGBA, jednolity kolor) o podanych wymiarach — logo do testów. */
function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4, 0x40)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

const pngDataUri = (width: number, height: number) =>
  `data:image/png;base64,${Buffer.from(png(width, height)).toString('base64')}`;

type Extracted = { text: string; pageTexts: string[]; pages: number; info: Record<string, unknown> };

// Złamania wierszy zamieniamy na spacje; twarde spacje (U+00A0) w liczbach zostają.
const joinLines = (parts: string[]) =>
  parts
    .join('')
    .replace(/[ \n]+/g, ' ')
    .trim();

async function extract(buf: Buffer): Promise<Extracted> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await task.promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const parts: string[] = [];
    for (const item of content.items) {
      if ('str' in item) parts.push(item.str, item.hasEOL ? '\n' : '');
    }
    pageTexts.push(joinLines(parts));
  }
  const { info } = await doc.getMetadata();
  const pages = doc.numPages;
  await task.destroy();
  return { text: pageTexts.join(' '), pageTexts, pages, info: info as Record<string, unknown> };
}

/*
 * Układ strony z gotowego pliku: tekst z pozycją linii bazowej i ścieżki z kolorem (w punktach strony,
 * oś y w górę). Macierze jak w canvas: [a, b, c, d, e, f], punkt' = M · punkt.
 */
type Matrix = readonly [number, number, number, number, number, number];
type Box = { minX: number; minY: number; maxX: number; maxY: number };
type PlacedText = { str: string; x: number; y: number; width: number; size: number };
type Drawn = { color: string; lineWidth: number; box: Box };
type PageScan = { items: PlacedText[]; strokes: Drawn[]; fills: Drawn[] };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

function boxOf(m: Matrix, [x0, y0, x1, y1]: readonly [number, number, number, number]): Box {
  const points = [
    [x0, y0],
    [x1, y1],
    [x0, y1],
    [x1, y0],
  ].map(([x = 0, y = 0]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

async function scanPage(buf: Buffer, pageNumber = 1): Promise<PageScan> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { OPS } = pdfjs;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const page = await (await task.promise).getPage(pageNumber);
  const items: PlacedText[] = [];
  for (const item of (await page.getTextContent()).items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const t = item.transform as number[];
    items.push({ str: item.str, x: t[4] ?? 0, y: t[5] ?? 0, width: item.width, size: t[0] ?? 0 });
  }
  const list = await page.getOperatorList();
  type State = { ctm: Matrix; stroke: string; fill: string; lineWidth: number };
  let state: State = { ctm: IDENTITY, stroke: '', fill: '', lineWidth: 1 };
  const stack: State[] = [];
  const strokes: Drawn[] = [];
  const fills: Drawn[] = [];
  list.fnArray.forEach((fn, i) => {
    const args = (list.argsArray[i] ?? []) as unknown[];
    if (fn === OPS.save) stack.push(state);
    else if (fn === OPS.restore) state = stack.pop() ?? state;
    else if (fn === OPS.transform) state = { ...state, ctm: multiply(state.ctm, args as unknown as Matrix) };
    else if (fn === OPS.setStrokeRGBColor) state = { ...state, stroke: String(args[0]) };
    else if (fn === OPS.setFillRGBColor) state = { ...state, fill: String(args[0]) };
    else if (fn === OPS.setLineWidth) state = { ...state, lineWidth: Number(args[0]) };
    else if (fn === OPS.constructPath) {
      const minMax = args[2] as ArrayLike<number> | null | undefined;
      if (!minMax || minMax.length < 4) return;
      const box = boxOf(state.ctm, [minMax[0] ?? 0, minMax[1] ?? 0, minMax[2] ?? 0, minMax[3] ?? 0]);
      const op = args[0];
      if (op === OPS.stroke || op === OPS.closeStroke || op === OPS.fillStroke) {
        strokes.push({ color: state.stroke, lineWidth: state.lineWidth, box });
      }
      if (op === OPS.fill || op === OPS.eoFill || op === OPS.fillStroke) {
        fills.push({ color: state.fill, lineWidth: state.lineWidth, box });
      }
    }
  });
  await task.destroy();
  return { items, strokes, fills };
}

/** Obrazy na stronie (paintImageXObject) jako prostokąty w punktach strony. */
async function imageBoxes(buf: Buffer): Promise<Box[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { OPS } = pdfjs;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const page = await (await task.promise).getPage(1);
  const list = await page.getOperatorList();
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  const boxes: Box[] = [];
  list.fnArray.forEach((fn, i) => {
    const args = (list.argsArray[i] ?? []) as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(ctm, args as unknown as Matrix);
    else if (fn === OPS.paintImageXObject) boxes.push(boxOf(ctm, [0, 0, 1, 1]));
  });
  await task.destroy();
  return boxes;
}

const PEN = tokens.colors.light.reportPen.toLowerCase();
const MARKER = tokens.colors.light.marker.toLowerCase();

beforeAll(async () => {
  registerPdfFonts(FONTS);
  await preparePdfFonts();
}, 30_000);

describe('registerPdfFonts', () => {
  it('rejestruje fonty raz; kolejne wywołania nic nie zmieniają', () => {
    expect(registeredPdfFontBase()).toBe(`${FONTS}/`);
    registerPdfFonts('/inna/sciezka/');
    expect(registeredPdfFontBase()).toBe(`${FONTS}/`);
  });

  it('nie dzieli polskich słów, tylko bardzo długie ciągi bez spacji', () => {
    expect(pdfHyphenation('najprawdopodobniej')).toEqual(['najprawdopodobniej']);
    expect(pdfHyphenation('Zażółć')).toEqual(['Zażółć']);
    const url = 'https://www.instagram.com/p/AbCdEfGhIjKl/';
    const parts = pdfHyphenation(url);
    expect(parts.join('')).toBe(url);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => Array.from(p).length <= 12)).toBe(true);
  });

  it('pliki fontów istnieją pod zarejestrowaną ścieżką', () => {
    for (const file of [
      'BricolageGrotesque-Medium.ttf',
      'BricolageGrotesque-SemiBold.ttf',
      'BricolageGrotesque-Bold.ttf',
      'AtkinsonHyperlegibleNext-Regular.ttf',
      'AtkinsonHyperlegibleNext-SemiBold.ttf',
      'AtkinsonHyperlegibleNext-Bold.ttf',
    ]) {
      expect(fs.existsSync(path.join(FONTS, file)), file).toBe(true);
    }
  });
});

describe('ReportPdf', () => {
  let drop: Extracted;
  let dropBuf: Buffer;

  beforeAll(async () => {
    dropBuf = await render(DROP);
    drop = await extract(dropBuf);
  }, 30_000);

  it('to jednostronicowy PDF A4', () => {
    expect(dropBuf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(drop.pages).toBe(1);
    expect(dropBuf.toString('latin1')).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/);
  });

  it('kluczowe wyświetlenia (trzy efekty w rzędzie) z przykładowymi tekstami mieszczą się na jednej stronie', async () => {
    const views = await extract(
      await render({
        ...EXAMPLE_REPORT,
        actions: { book: 0, call: 0, directions: 0 },
        keyMetric: 'views',
        headline: '12 480 wyświetleń we wrześniu',
        flags: { metricChangeNote: true },
      }),
    );
    expect(views.pages).toBe(1);
    expect(views.text).toContain('Plan na październik');
  }, 30_000);

  it('zawiera polskie znaki, cudzysłowy „ ” i prawdziwy minus (U+2212)', () => {
    expect(drop.text).toContain(CLIENT);
    expect(drop.text).toContain('Raport miesięczny dla: Zażółć Gęślą Jaźń — Łódź');
    expect(drop.text).toContain('Kliknięcia „Zarezerwuj”');
    expect(drop.text).toContain('−9% m/m');
    expect(drop.text).toContain('−');
    expect(drop.text).not.toMatch(/-\d+% m\/m/);
    expect(drop.text).toContain('23 osoby chciały się umówić');
    expect(drop.text).toContain('Co dał Instagram we wrześniu');
  });

  it('pokazuje liczby po polsku i porównanie z poprzednim miesiącem', () => {
    // Twarda spacja i spacja mają w foncie ten sam glif, więc w wyciągniętym tekście bywa zwykłą spacją.
    expect(drop.text).toMatch(/Wyświetlenia 10[\u00a0 ]000 \u22129% m\/m/);
    expect(drop.text).toContain('sierpień: 17');
    expect(drop.text).toContain('Plan na październik');
  });

  it('ma stopkę „Przygotowano w” przy brandingu sedno-footer', () => {
    expect(drop.text).toContain('Przygotowano w');
  });

  it('nie ma stopki Sedno przy brandingu autora', async () => {
    const own = await extract(await render({ ...DROP, branding: 'author' }));
    expect(own.text).not.toContain('Przygotowano w');
    expect(own.text).toContain(CLIENT);
  }, 30_000);

  it('ma metadane: tytuł, autora, twórcę i język pl', () => {
    expect(drop.info.Title).toBe(reportView(DROP).documentTitle);
    expect(drop.info.Title).toBe(`Raport za wrzesień 2026 — ${CLIENT}`);
    expect(drop.info.Author).toBe('Kadr Social');
    expect(drop.info.Creator).toBe('Sedno');
    // pdfjs nie udostępnia /Lang z katalogu dokumentu, więc sprawdzamy surowy słownik.
    expect(dropBuf.toString('latin1')).toContain('/Lang (pl)');
  });

  it('osadza fonty marki (Bricolage i Atkinson), nie Helveticę', () => {
    const raw = dropBuf.toString('latin1');
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+BricolageGrotesque/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+AtkinsonHyperlegibleNext/);
    expect(raw).not.toContain('/BaseFont /Helvetica');
  });

  // To kolejny PDF w tym samym procesie: bez preparePdfFonts() litery „n” (składnik „ń”) traciłyby
  // mapowanie ToUnicode i wypadały z kopiowanego tekstu („Brak daych z sierpia”).
  it('przy braku danych pokazuje „—” i „Brak danych z sierpnia” (także w kolejnym PDF)', async () => {
    const empty = await extract(
      await render(report({ actions: { book: 23, call: null, directions: null }, previous: undefined })),
    );
    expect(empty.text).toContain('—');
    expect(empty.text).toContain('Brak danych z sierpnia');
  }, 30_000);

  it('długa kluczowa liczba jest widoczna (mniejszy stopień, pętla w kolumnie)', async () => {
    const big = await extract(
      await render(
        report({
          keyMetric: 'views',
          headline: '1 234 567 wyświetleń we wrześniu',
          summary: { ...EXAMPLE_REPORT.summary, views: 1_234_567 },
        }),
      ),
    );
    // Tytuł, kluczowa liczba i słupek — trzy wystąpienia.
    expect(big.text.match(/1[\u00a0 ]234[\u00a0 ]567/g)).toHaveLength(3);
  }, 30_000);

  it('długi komentarz i plan przechodzą na drugą stronę: cały tekst, nagłówek z tekstem, stopka na końcu', async () => {
    const sentence = 'Rolki z metamorfozami brwi przyciągnęły nowe osoby z okolicy.';
    const long = `${sentence} `.repeat(19).trim();
    const buf = await render(
      report({ commentWorked: long, planNext: long, flags: { metricChangeNote: true } }),
    );
    const result = await extract(buf);
    expect(result.pages).toBe(2);
    // Nic nie ginie przy podziale stron: 19 zdań komentarza i 19 zdań planu.
    expect(result.text.split(sentence)).toHaveLength(2 * 19 + 1);
    // Nagłówek sekcji nie zostaje sam u dołu strony — stoi na tej samej stronie co początek tekstu.
    const planPage = result.pageTexts.find((t) => t.includes('Plan na październik')) ?? '';
    expect(planPage).toContain(`Plan na październik ${sentence}`);
    const [first = '', last = ''] = result.pageTexts;
    expect(first).toContain(`Co zadziałało ${sentence}`);
    // Przypisy i stopka raz, na ostatniej stronie.
    expect(first).not.toContain('Przygotowano w');
    expect(last).toContain('Od kwietnia 2025 r. Meta liczy wyświetlenia inaczej');
    expect(last).toMatch(/Przygotowano w$/);
  }, 30_000);
});

describe('ReportPdf: układ strony', () => {
  let example: PageScan;

  beforeAll(async () => {
    example = await scanPage(await render(EXAMPLE_REPORT));
  }, 30_000);

  it('ma dokładnie jedno zakreślenie (pętla długopisu 3,2 pt w kolorze report-pen)', () => {
    const rings = example.strokes.filter((d) => d.color === PEN && Math.abs(d.lineWidth - 3.2) < 0.01);
    expect(rings).toHaveLength(1);
  });

  it('cyfry kluczowej liczby siedzą w pętli tak jak w HTML (.sd-circled)', () => {
    const ring = example.strokes.find((d) => d.color === PEN && Math.abs(d.lineWidth - 3.2) < 0.01)?.box;
    const value = example.items.find((item) => item.str === '23');
    if (!ring || !value) throw new Error('brak pętli albo kluczowej liczby');
    const em = value.size;
    // CSS: pole 1,1 em (padding .08/.02), linia bazowa 0,08 + 0,83 em od góry (Bricolage 0,93/−0,27
    // przy line-height 1), pętla od −0,12 em, wysokość 1,32 em, ścieżka w pionie 8,6–90% pola SVG.
    // Cyfry Bricolage Bold mają 0,676 em wysokości.
    const baseline = 0.08 + 0.83;
    const ringTop = -0.12 + 0.086 * 1.32;
    const ringBottom = -0.12 + 0.9 * 1.32;
    const digitTop = value.y + 0.676 * em;
    // Oś y w PDF rośnie w górę: odstęp od góry pętli do góry cyfr i od dołu cyfr do dołu pętli.
    expect((ring.maxY - digitTop) / em).toBeCloseTo(baseline - 0.676 - ringTop, 1);
    expect((value.y - ring.minY) / em).toBeCloseTo(ringBottom - baseline, 1);
  });

  it('zakreślacz (tło marker) leży pod zaznaczonym fragmentem i tylko wtedy, gdy autor go zaznaczył', async () => {
    const marks = example.fills.filter((d) => d.color === MARKER);
    expect(marks).toHaveLength(1);
    const marked = example.items.find((item) => item.str === 'rolkach z metamorfozami brwi');
    if (!marked) throw new Error('brak zaznaczonego fragmentu');
    const box = marks[0]!.box;
    expect(box.minX).toBeLessThanOrEqual(marked.x + 0.5);
    expect(box.maxX).toBeGreaterThanOrEqual(marked.x + marked.width - 0.5);
    expect(box.minY).toBeLessThan(marked.y);
    expect(box.maxY).toBeGreaterThan(marked.y);

    const plain = await scanPage(await render(report({ commentMark: undefined })));
    expect(plain.fills.filter((d) => d.color === MARKER)).toEqual([]);
  }, 30_000);

  it('długa nazwa autora i klienta łamie się w swojej kolumnie, nie wchodzi na miesiąc ani za margines', async () => {
    const client = 'Pracownia Kosmetologiczna i Gabinet Medycyny Estetycznej Zażółć Gęślą';
    const author = 'Agencja Marketingu Internetowego Kadr Social Media Spółka z o.o. Łódź';
    const buf = await render(report({ client: { name: client }, author: { name: author } }));
    const scan = await scanPage(buf);
    const period = scan.items.filter((item) => item.str === 'Wrzesień 2026' || item.str === '1–30.09.2026');
    expect(period).toHaveLength(2);
    const periodLeft = Math.min(...period.map((item) => item.x));
    const intro = scan.items.find((item) => item.str === 'Co dał Instagram we wrześniu');
    if (!intro) throw new Error('brak wstępu');
    const header = scan.items.filter((item) => item.y > intro.y && !period.includes(item));
    expect(header.length).toBeGreaterThan(2);
    for (const item of header) expect(item.x + item.width, item.str).toBeLessThan(periodLeft);
    for (const item of scan.items)
      expect(item.x + item.width, item.str).toBeLessThanOrEqual(595.28 - 44 + 0.5);
    const { text } = await extract(buf);
    expect(text).toContain(author);
    expect(text).toContain(`Raport miesięczny dla: ${client}`);
  }, 30_000);
});

describe('zakreślenie w PDF', () => {
  it('kluczowa liczba ma 72 pt, a długa mniej — tak, by zmieściła się w kolumnie', () => {
    expect(keyFontSize(numberWidthEm('23', KEY_TRACKING_EM))).toBe(72);
    const em = numberWidthEm('1\u00a0234\u00a0567', KEY_TRACKING_EM);
    const size = keyFontSize(em);
    expect(size).toBeLessThan(72);
    expect((em + 0.66) * size).toBeLessThanOrEqual(((595.28 - 88 - 24) * 1.2) / 2.2);
  });

  it('skaluje ścieżkę pętli do pola w pt, zachowując wszystkie punkty', () => {
    const scaled = scaleCircledPath(200, 50);
    const count = (d: string) => (d.match(/[ML]/g) ?? []).length;
    expect(count(scaled)).toBe(count(circledPath));
    // Pierwszy punkt: M54.9 11.3 → x × 2, y × 0,5.
    expect(scaled.startsWith('M109.80 5.65')).toBe(true);
  });

  it('szacuje szerokość liczby z cyfr tabelarycznych', () => {
    expect(estimateWidth('23', 72)).toBeCloseTo(2 * 0.61 * 72, 5);
    expect(estimateWidth('12\u00a0480', 100)).toBeCloseTo((5 * 0.61 + 0.24) * 100, 5);
    expect(estimateWidth('—', 10)).toBeGreaterThan(estimateWidth('1', 10));
  });
});

describe('ReportPdf: logo autora', () => {
  it('logo zastępuje awatar z inicjałami i nazwę; PDF zostaje jednostronicowy', async () => {
    const buf = await render(DROP, pngDataUri(200, 50));
    const result = await extract(buf);
    expect(result.pages).toBe(1);
    const page = result.pageTexts[0]!;
    expect(page).toContain(`Raport miesięczny dla: ${CLIENT}`);
    expect(page).not.toMatch(/\bKS\b/);
    expect(page).not.toContain('Kadr Social');
    // Autor zostaje w metadanych dokumentu.
    expect(result.info.Author).toBe('Kadr Social');
    const [box, ...rest] = await imageBoxes(buf);
    expect(rest).toHaveLength(0);
    // Pole 160 × 40 pt w lewym górnym rogu treści (margines 44 pt, góra strony 842 − 40 pt).
    expect(box!.maxX - box!.minX).toBeCloseTo(160, 0);
    expect(box!.maxY - box!.minY).toBeCloseTo(40, 0);
    expect(box!.minX).toBeCloseTo(44, 0);
    expect(box!.maxY).toBeLessThanOrEqual(841.89 - 40 + 0.5);
  }, 30_000);

  it('szerokie i wysokie logo mieści się w polu 160 × 40 pt z zachowaniem proporcji', async () => {
    for (const [w, h] of [
      [2000, 50],
      [50, 400],
    ] as const) {
      const buf = await render(DROP, pngDataUri(w, h));
      expect((await extract(buf)).pages).toBe(1);
      const [box] = await imageBoxes(buf);
      const width = box!.maxX - box!.minX;
      const height = box!.maxY - box!.minY;
      expect(width).toBeLessThanOrEqual(160.5);
      expect(height).toBeLessThanOrEqual(40.5);
      expect(width / height).toBeCloseTo(w / h, 1);
    }
  }, 30_000);

  it('bez logo: inicjały i nazwa autora, bez obrazów', async () => {
    const buf = await render(DROP);
    expect(await imageBoxes(buf)).toHaveLength(0);
    expect((await extract(buf)).pageTexts[0]).toContain('KS Kadr Social');
  }, 30_000);
});

describe('downloadReportPdf', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('tworzy PDF w pamięci, pobiera go przez tymczasowy link i zwalnia adres', async () => {
    vi.useFakeTimers();
    const link = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { append } });
    let blob: Blob | undefined;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blob = b as Blob;
      return 'blob:sedno-test';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const fileName = await downloadReportPdf(DROP);

    expect(fileName).toBe('raport-zazolc-gesla-jazn-lodz-2026-09.pdf');
    expect(create).toHaveBeenCalledOnce();
    expect(blob?.type).toBe('application/pdf');
    const head = new Uint8Array(await blob!.slice(0, 5).arrayBuffer());
    expect(String.fromCharCode(...head)).toBe('%PDF-');
    expect(link).toMatchObject({ href: 'blob:sedno-test', download: fileName });
    expect(append).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:sedno-test');
  }, 30_000);

  it('z logoSrc pobiera logo z tej samej domeny i osadza je w PDF', async () => {
    const link = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { append: vi.fn() } });
    const logo = png(120, 40);
    const fetchMock = vi.fn(async () => new Response(logo, { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blob = b as Blob;
      return 'blob:sedno-logo';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    await downloadReportPdf(DROP, { logoSrc: '/app/logo' });

    expect(fetchMock).toHaveBeenCalledWith('/app/logo', { credentials: 'same-origin', cache: 'no-store' });
    const buf = Buffer.from(await blob!.arrayBuffer());
    expect(await imageBoxes(buf)).toHaveLength(1);
  }, 30_000);

  it('logo, które się nie wczytało, nie blokuje PDF (nazwa autora zamiast logo)', async () => {
    const link = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { append: vi.fn() } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('brak', { status: 404 })),
    );
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blob = b as Blob;
      return 'blob:sedno-no-logo';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    await downloadReportPdf(DROP, { logoSrc: '/r/AbCdEfGhIjKlMnOpQrStUv/logo' });

    const buf = Buffer.from(await blob!.arrayBuffer());
    expect(await imageBoxes(buf)).toHaveLength(0);
    expect((await extract(buf)).pageTexts[0]).toContain('Kadr Social');
  }, 30_000);
});

// Ostatni w pliku: czyści wspólny rejestr fontów react-pdf i wczytuje moduł fontów od nowa.
describe('preparePdfFonts po nieudanym pobraniu fontu', () => {
  it('kolejna próba pobiera font jeszcze raz (react-pdf nie pamięta błędu)', async () => {
    const { Font } = await import('@react-pdf/renderer');
    Font.clear();
    vi.resetModules();
    const fresh = await import('@/lib/pdf/fonts');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sedno-fonts-'));
    try {
      fresh.registerPdfFonts(dir);
      // Pierwsza próba: plików jeszcze nie ma (jak przerwane połączenie).
      await expect(fresh.preparePdfFonts()).rejects.toThrow();
      for (const file of fs.readdirSync(FONTS)) fs.copyFileSync(path.join(FONTS, file), path.join(dir, file));
      await expect(fresh.preparePdfFonts()).resolves.toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
