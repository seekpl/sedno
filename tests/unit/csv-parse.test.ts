import { describe, expect, it, vi } from 'vitest';
import { detectDelimiter, findHeaderRow, parseExport, resolveColumns, tokenize } from '@/lib/csv/parse';
import {
  LIMITS,
  type ColumnMapping,
  type ParseInput,
  type ParseResult,
  type ParsedExport,
} from '@/lib/csv/types';
import { encodeCp1250 } from '@/scripts/make-fixtures';

const encoder = new TextEncoder();

function input(content: string | Uint8Array, fileName = 'eksport.csv', mimeType = 'text/csv'): ParseInput {
  const bytes = typeof content === 'string' ? encoder.encode(content) : content;
  return {
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    fileName,
    mimeType,
  };
}

function parse(content: string | Uint8Array, mapping?: ColumnMapping): ParseResult {
  return parseExport(input(content), { mapping });
}

function ok(result: ParseResult): ParsedExport {
  if (!result.ok) throw new Error(`Oczekiwano wyniku, jest błąd: ${JSON.stringify(result.error)}`);
  return result.data;
}

const BASIC = [
  ['Czas publikacji', 'Typ posta', 'Opis', 'Wyświetlenia', 'Zasięg', 'Polubienia'],
  ['2026-09-01 10:00', 'Rolka na Instagramie', 'Opis, z przecinkiem; i średnikiem', '1200', '900', '45'],
  ['2026-09-15 18:30', 'Relacja na Instagramie', 'Drugi opis', '300', '250', '3'],
];

function toCsv(rows: string[][], delimiter: string): string {
  return (
    rows
      .map((row) =>
        row.map((cell) => (/[",;\t\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(delimiter),
      )
      .join('\n') + '\n'
  );
}

describe('separator', () => {
  it.each([
    { delimiter: ',', name: 'przecinek' },
    { delimiter: ';', name: 'średnik' },
    { delimiter: '\t', name: 'tabulator' },
  ] as const)('wykrywa $name i daje te same wiersze', ({ delimiter }) => {
    const text = toCsv(BASIC, delimiter);
    expect(detectDelimiter(text)).toBe(delimiter);
    const data = ok(parse(text));
    expect(data.rows.map((r) => [r.views, r.reach, r.likes, r.type])).toEqual([
      [1200, 900, 45, 'reel'],
      [300, 250, 3, 'story'],
    ]);
  });

  it('średnik, choć opisy bez cudzysłowów zawierają przecinki', () => {
    const text = [
      'Czas publikacji;Opis;Wyświetlenia;Zasięg',
      '2026-09-01 10:00;Nowa kolekcja, zapraszamy, do zobaczenia;100;80',
      '2026-09-02 10:00;Bez przecinka;200;150',
      '2026-09-03 10:00;Raz, dwa;300;250',
    ].join('\n');
    expect(detectDelimiter(text)).toBe(';');
    expect(ok(parse(text)).rows.map((r) => r.views)).toEqual([100, 200, 300]);
  });

  it('nagłówek z przecinkiem („Konta, do których dotarto”) w pliku ze średnikiem', () => {
    const text = 'Czas publikacji;Wyświetlenia;Konta, do których dotarto\n2026-09-01 10:00;100;80\n';
    expect(detectDelimiter(text)).toBe(';');
    const data = ok(parse(text));
    expect(data.rows[0]).toMatchObject({ views: 100, reach: 80 });
    expect(data.fields).toEqual(['publishedAt', 'views', 'reach']);
  });

  it('przecinek z cudzysłowami: liczby „1,234” i opisy ze średnikami', () => {
    const text =
      'Publish time,Description,Views,Reach\n' +
      '09/01/2026 10:00,"Opis; ze średnikiem","1,234","1,000"\n' +
      '09/02/2026 10:00,"Drugi; opis","2,345",900\n';
    expect(detectDelimiter(text)).toBe(',');
    expect(ok(parse(text)).rows.map((r) => [r.views, r.reach])).toEqual([
      [1234, 1000],
      [2345, 900],
    ]);
  });

  it('bez rozpoznawalnych kolumn decyduje spójność liczby pól', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n4;5;6\n')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3\n')).toBe('\t');
    expect(detectDelimiter('jedna kolumna\nwartość\n')).toBe(',');
  });

  it('opis w cudzysłowie z nową linią nie rozbija wiersza', () => {
    const text =
      'Czas publikacji;Opis;Wyświetlenia\n2026-09-01 10:00;"Linia 1\nLinia 2; dalej";500\n2026-09-02 11:00;x;600\n';
    expect(ok(parse(text)).rows.map((r) => r.views)).toEqual([500, 600]);
  });
});

describe('nagłówek', () => {
  it('to pierwszy wiersz z co najmniej 3 znanymi polami (opis się liczy)', () => {
    const rows = tokenize('Raport;Opis\nOpis;Czas publikacji;Wyświetlenia\n2026-09-01;5;\n', ';');
    expect(findHeaderRow(rows)).toBe(1);
  });

  it('wiersze opisu nad nagłówkiem są pomijane', () => {
    const text = [
      'Eksport treści, konto przykładowe',
      'Data;Opis',
      '',
      'Czas publikacji;Opis;Wyświetlenia;Zasięg',
      '2026-09-01 10:00;Pierwszy;100;80',
    ].join('\n');
    const data = ok(parse(text));
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]!.views).toBe(100);
  });

  it('plik z samą datą i wyświetleniami (2 znane kolumny) też działa', () => {
    const data = ok(parse('Czas publikacji,Wyświetlenia\n2026-09-01 10:00,100\n2026-09-02 10:00,200\n'));
    expect(data.rows.map((r) => r.views)).toEqual([100, 200]);
    expect(data.fields).toEqual(['publishedAt', 'views']);
  });

  it('„Publish time” wygrywa z kolumną „Date” (wartość „Lifetime”), nawet gdy „Date” stoi wcześniej', () => {
    const text =
      'Date,Views,Reach,Publish time\nLifetime,100,80,09/01/2026 10:00\nLifetime,200,150,09/02/2026 10:00\n';
    const columns = resolveColumns(tokenize(text, ',')[0]!);
    expect(columns.publishedAt).toBe(3);
    expect(ok(parse(text)).rows).toHaveLength(2);
  });

  it('dwie kolumny o tym samym znaczeniu: wygrywa pierwsza z lewej', () => {
    expect(resolveColumns(['Views', 'Wyświetlenia', 'Czas publikacji']).views).toBe(0);
  });
});

describe('E_MISSING_COLUMNS', () => {
  it('brak daty', () => {
    const result = parse('Opis;Wyświetlenia;Zasięg;Polubienia\nx;1;2;3\n');
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'E_MISSING_COLUMNS',
        missing: ['publishedAt'],
        headers: ['Opis', 'Wyświetlenia', 'Zasięg', 'Polubienia'],
      },
    });
  });

  it('brak wyświetleń i zasięgu („Impressions” to inna metryka)', () => {
    const result = parse('Publish time,Impressions,Likes,Comments\n09/01/2026 10:00,100,2,3\n');
    expect(result).toMatchObject({ ok: false, error: { code: 'E_MISSING_COLUMNS', missing: ['views'] } });
  });

  it('nic nie rozpoznano: brakuje obu pól, nagłówki z pliku (przycięte, bez pustych)', () => {
    const result = parse('  Kiedy ;Ile;;Rodzaj\n2026-09-01;5;;x\n');
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'E_MISSING_COLUMNS',
        missing: ['publishedAt', 'views'],
        headers: ['Kiedy', 'Ile', 'Rodzaj'],
      },
    });
  });

  it('nic nie rozpoznano, a nad tabelą jest opis: nagłówki z wiersza o typowej liczbie pól', () => {
    const result = parse('Eksport z narzędzia\nKiedy;Ile;Rodzaj\n2026-09-01;5;x\n2026-09-02;6;y\n');
    expect(result).toMatchObject({ ok: false, error: { headers: ['Kiedy', 'Ile', 'Rodzaj'] } });
  });
});

describe('kolumna daty bez dat (zła kolumna z synonimu)', () => {
  const RENAMED =
    'Post ID,Date,Publish date and time,Views,Reach\n' +
    '1,Lifetime,09/01/2026 10:00,100,80\n' +
    '2,Lifetime,09/02/2026 10:00,200,150\n';

  it('„Date” z „Lifetime”, a daty w kolumnie o nieznanej nazwie → ekran „Przypisz kolumny”, nie E_EMPTY', () => {
    expect(parse(RENAMED)).toEqual({
      ok: false,
      error: {
        code: 'E_MISSING_COLUMNS',
        missing: ['publishedAt'],
        headers: ['Post ID', 'Date', 'Publish date and time', 'Views', 'Reach'],
      },
    });
    const data = ok(parse(RENAMED, { 'Publish date and time': 'publishedAt' }));
    expect(data.rows.map((r) => r.views)).toEqual([100, 200]);
  });

  it('to samo po polsku („Data” z „Łącznie”), także po złym mapowaniu ręcznym', () => {
    const text = 'Data;Godzina publikacji;Wyświetlenia;Zasięg\nŁącznie;13.09.2026 10:00;100;80\n';
    expect(parse(text)).toMatchObject({
      ok: false,
      error: { code: 'E_MISSING_COLUMNS', missing: ['publishedAt'] },
    });
    expect(parse(text, { Zasięg: 'publishedAt' })).toMatchObject({
      ok: false,
      error: { code: 'E_MISSING_COLUMNS', missing: ['publishedAt'] },
    });
    expect(ok(parse(text, { 'Godzina publikacji': 'publishedAt' })).rows).toHaveLength(1);
  });

  it('daty tylko w opisie się nie liczą (opisu nie czytamy) → E_EMPTY', () => {
    const text =
      'Data;Opis;Wyświetlenia;Zasięg\nŁącznie;2026-09-01 10:00;1;1\nŁącznie;2026-09-02 10:00;1;1\n';
    expect(parse(text)).toEqual({ ok: false, error: { code: 'E_EMPTY' } });
  });
});

describe('zasięg bez wyświetleń', () => {
  it('przyjmuje plik, ale wyświetlenia zostają null (zasięgu nie kopiujemy)', () => {
    const data = ok(
      parse('Publish time,Impressions,Reach,Likes\n09/01/2026 10:00,900,500,2\n09/02/2026 10:00,700,400,1\n'),
    );
    expect(data.rows.map((r) => [r.views, r.reach])).toEqual([
      [null, 500],
      [null, 400],
    ]);
    expect(data.fields).not.toContain('views');
    expect(data.fields).toContain('reach');
  });
});

describe('mapowanie ręczne', () => {
  const UNKNOWN =
    'Kiedy,Ile razy obejrzano,Rodzaj\n2026-09-02 10:00,1500,rolka\n2026-09-06 18:30,420,zdjęcie\n';

  it('plik bez znanych kolumn staje się czytelny po wskazaniu daty i wyświetleń', () => {
    expect(parse(UNKNOWN).ok).toBe(false);
    const data = ok(parse(UNKNOWN, { Kiedy: 'publishedAt', 'Ile razy obejrzano': 'views' }));
    expect(data.rows.map((r) => [r.publishedAt.toISOString(), r.views, r.type])).toEqual([
      ['2026-09-02T08:00:00.000Z', 1500, 'other'],
      ['2026-09-06T16:30:00.000Z', 420, 'other'],
    ]);
    expect(data.fields).toEqual(['publishedAt', 'views']);
  });

  it('mapowanie typu i dopasowanie nagłówka po normalizacji', () => {
    const data = ok(
      parse(UNKNOWN, { ' kiedy ': 'publishedAt', 'ILE RAZY OBEJRZANO': 'views', Rodzaj: 'type' }),
    );
    expect(data.rows.map((r) => r.type)).toEqual(['reel', 'post']);
  });

  it('ma pierwszeństwo przed synonimami', () => {
    const text = 'Czas publikacji;Views;Plays;Zasięg\n2026-09-01 10:00;100;999;50\n';
    expect(ok(parse(text)).rows[0]!.views).toBe(100);
    expect(ok(parse(text, { Plays: 'views' })).rows[0]!.views).toBe(999);
  });

  it('kolumnę można oznaczyć jako opis — wtedy nie jest czytana', () => {
    const text = 'Czas publikacji;Wyświetlenia;Zasięg;Polubienia\n2026-09-01 10:00;100;50;7\n';
    const data = ok(parse(text, { Polubienia: 'description' }));
    expect(data.rows[0]!.likes).toBeNull();
    expect(data.fields).not.toContain('likes');
  });

  it('ignoruje mapowanie na nieznane pola i nagłówki, których nie ma w pliku', () => {
    const mapping = {
      Kiedy: 'publishedAt',
      'Ile razy obejrzano': 'impressions',
      Inne: 'views',
    } as unknown as ColumnMapping;
    expect(parse(UNKNOWN, mapping)).toMatchObject({
      ok: false,
      error: { code: 'E_MISSING_COLUMNS', missing: ['views'] },
    });
  });
});

describe('wiersze i wartości', () => {
  it('pomija wiersze z datą, której nie da się odczytać; brak komórek → null', () => {
    const text = [
      'Czas publikacji;Typ posta;Wyświetlenia;Zasięg;Polubienia;Obserwacje',
      '2026-09-01 10:00;IG reel;100;80;5;1',
      'Suma;;100;80;5;1',
      ';IG image;50;40;1;0',
      '2026-09-02 10:00;IG image;200',
    ].join('\n');
    const data = ok(parse(text));
    expect(data.rows).toHaveLength(2);
    expect(data.rows[1]).toEqual({
      publishedAt: new Date('2026-09-02T08:00:00.000Z'),
      type: 'post',
      views: 200,
      reach: null,
      likes: null,
      comments: null,
      shares: null,
      saves: null,
      follows: null,
    });
  });

  it('liczniki z częścią ułamkową zaokrąglamy (np. po Excelu)', () => {
    const data = ok(parse('Czas publikacji;Wyświetlenia;Zasięg\n2026-09-01 10:00;"1.234,5";12,4\n'));
    expect(data.rows[0]).toMatchObject({ views: 1235, reach: 12 });
  });

  it('data niejednoznaczna rozstrzygana dla całej kolumny', () => {
    const text = 'Czas publikacji;Wyświetlenia;Zasięg\n05/09/2026 10:00;1;1\n13/09/2026 10:00;2;2\n';
    const data = ok(parse(text));
    expect(data.rows[0]!.publishedAt.toISOString()).toBe('2026-09-05T08:00:00.000Z');
  });

  it('zakres i miesiące (rosnąco, bez powtórzeń, strefa Europe/Warsaw)', () => {
    const text = [
      'Czas publikacji;Wyświetlenia;Zasięg',
      '2026-10-01 00:30;1;1',
      '2026-08-15 12:00;1;1',
      '2026-09-30 23:59;1;1',
      '2026-08-01 00:10;1;1',
    ].join('\n');
    const data = ok(parse(text));
    expect(data.months).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(data.range.from.toISOString()).toBe('2026-07-31T22:10:00.000Z');
    expect(data.range.to.toISOString()).toBe('2026-09-30T22:30:00.000Z');
  });

  it('wiersz zawiera tylko dozwolone pola — żadnego tekstu z pliku poza permalinkiem', () => {
    const text =
      'Czas publikacji;Opis;Wyświetlenia;Zasięg;Permalink;Nazwa konta\n' +
      '2026-09-01 10:00;Tajny opis;1;1;https://www.instagram.com/p/x/;Tajne konto\n';
    const row = ok(parse(text)).rows[0]!;
    expect(Object.keys(row).sort()).toEqual(
      [
        'comments',
        'follows',
        'likes',
        'permalink',
        'publishedAt',
        'reach',
        'saves',
        'shares',
        'type',
        'views',
      ].sort(),
    );
    expect(JSON.stringify(row)).not.toMatch(/Tajn/);
  });

  it('odczytuje plik windows-1250 i dodaje ostrzeżenie W_ENCODING_GUESSED', () => {
    const data = ok(
      parse(encodeCp1250('Czas publikacji;Opis;Wyświetlenia;Zasięg\n01.09.2026 10:00;Zażółć;100;50\n')),
    );
    expect(data.warnings).toEqual([{ code: 'W_ENCODING_GUESSED' }]);
    expect(data.fields).toEqual(['publishedAt', 'views', 'reach']);
  });

  it('uszkodzony bajt w opisie pliku UTF-8 nie psuje polskich nagłówków', () => {
    const bytes = encoder.encode(
      'Czas publikacji;Opis;Wyświetlenia;Zasięg\n2026-09-01 10:00;Opis XX z emoji;100;50\n',
    );
    const at = bytes.indexOf(0x58); // pierwsze „X” w opisie
    bytes[at] = 0xf0; // początek czterobajtowego znaku bez kontynuacji
    bytes[at + 1] = 0x9f;
    const data = ok(parse(bytes));
    expect(data.fields).toEqual(['publishedAt', 'views', 'reach']);
    expect(data.rows[0]).toMatchObject({ views: 100, reach: 50 });
    expect(data.warnings).toEqual([]);
  });

  it('plik UTF-8 bez ostrzeżeń', () => {
    expect(ok(parse(toCsv(BASIC, ';'))).warnings).toEqual([]);
  });
});

describe('błędy', () => {
  it('E_NOT_CSV: rozszerzenie i MIME', () => {
    const text = toCsv(BASIC, ';');
    expect(parseExport(input(text, 'eksport.txt'))).toEqual({ ok: false, error: { code: 'E_NOT_CSV' } });
    expect(parseExport(input(text, 'eksport.xlsx', 'application/vnd.ms-excel'))).toEqual({
      ok: false,
      error: { code: 'E_NOT_CSV' },
    });
    expect(parseExport(input(text, 'eksport.csv', 'application/pdf'))).toEqual({
      ok: false,
      error: { code: 'E_NOT_CSV' },
    });
    expect(ok(parseExport(input(text, 'EKSPORT.CSV', 'application/vnd.ms-excel'))).rows).toHaveLength(2);
    expect(ok(parseExport(input(text, 'eksport.csv', ''))).rows).toHaveLength(2);
  });

  it('E_NOT_CSV: bajty zerowe (plik binarny)', () => {
    expect(parse(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x41]))).toEqual({
      ok: false,
      error: { code: 'E_NOT_CSV' },
    });
  });

  it('E_EMPTY: pusty plik, sam BOM, same białe znaki, same separatory', () => {
    for (const content of [new Uint8Array(0), new Uint8Array([0xef, 0xbb, 0xbf]), ' \n\r\n', ';;;\n;;;\n']) {
      expect(parse(content)).toEqual({ ok: false, error: { code: 'E_EMPTY' } });
    }
  });

  it('E_EMPTY: sam nagłówek albo żadnej daty do odczytania', () => {
    expect(parse('Czas publikacji;Wyświetlenia;Zasięg\n')).toEqual({ ok: false, error: { code: 'E_EMPTY' } });
    expect(parse('Czas publikacji;Wyświetlenia;Zasięg\nLifetime;1;2\nSuma;3;4\n')).toEqual({
      ok: false,
      error: { code: 'E_EMPTY' },
    });
  });

  it('E_TOO_BIG (size): ponad 10 MB, sprawdzane przed dekodowaniem', () => {
    const bytes = new ArrayBuffer(LIMITS.maxBytes + 1);
    expect(parseExport({ bytes, fileName: 'duzy.csv', mimeType: 'text/csv' })).toEqual({
      ok: false,
      error: { code: 'E_TOO_BIG', reason: 'size' },
    });
  });

  it('E_TOO_BIG (rows): ponad 20 000 wierszy danych; równo 20 000 przechodzi', () => {
    const line = '2026-09-01 10:00;IG reel;100;80;5;1;2;3\n';
    const header =
      'Czas publikacji;Typ posta;Wyświetlenia;Zasięg;Polubienia;Komentarze;Udostępnienia;Zapisania\n';
    expect(parse(header + line.repeat(LIMITS.maxRows + 1))).toEqual({
      ok: false,
      error: { code: 'E_TOO_BIG', reason: 'rows' },
    });
    const data = ok(parse(header + line.repeat(LIMITS.maxRows)));
    expect(data.rows).toHaveLength(LIMITS.maxRows);
  });
});

describe('postęp', () => {
  it('co 500 wierszy i raz na końcu', () => {
    const header = 'Czas publikacji;Wyświetlenia;Zasięg\n';
    const text = header + '2026-09-01 10:00;1;1\n'.repeat(1234);
    const onProgress = vi.fn();
    ok(parseExport(input(text), { onProgress }));
    expect(onProgress.mock.calls).toEqual([
      [500, 1234],
      [1000, 1234],
      [1234, 1234],
    ]);
  });

  it('mały plik: jedno wywołanie na końcu', () => {
    const onProgress = vi.fn();
    ok(parseExport(input(toCsv(BASIC, ';')), { onProgress }));
    expect(onProgress.mock.calls).toEqual([[2, 2]]);
  });
});
