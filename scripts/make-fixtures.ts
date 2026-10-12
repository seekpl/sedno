/**
 * Generuje syntetyczne pliki testowe parsera: tests/fixtures/synthetic-*.csv (PROMPT.md §6, decyzja 19).
 * Wynik jest deterministyczny (własny generator liczb losowych z ziarnem), pliki są w repozytorium,
 * a test tests/unit/csv-fixtures.test.ts pilnuje, że odpowiadają temu skryptowi.
 * Wszystkie dane są zmyślone: marka „Studio Lumi” jak w brand/reference/, adresy i identyfikatory syntetyczne.
 *
 * Użycie: pnpm exec tsx scripts/make-fixtures.ts           — zapisuje pliki
 *         pnpm exec tsx scripts/make-fixtures.ts --check   — kończy się błędem, gdy pliki są nieaktualne
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES_DIR = path.join(ROOT, 'tests/fixtures');

/** Znacznik testu prywatności (CLAUDE.md, zasada 1). */
export const PRIVACY_CANARY = 'SEDNO-PRIVACY-CANARY-7f3a';

/* ───────────────────────── narzędzia ───────────────────────── */

/** Generator liczb losowych z ziarnem (mulberry32) — ten sam wynik przy każdym uruchomieniu. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(rnd: () => number, min: number, max: number): number {
  return min + rnd() * (max - min);
}

function int(rnd: () => number, min: number, max: number): number {
  return Math.floor(between(rnd, min, max + 1));
}

function shuffle<T>(rnd: () => number, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Dzieli sumę na liczby całkowite proporcjonalnie do wag (metoda największych reszt). Waga 0 → 0. */
function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ frac: r - Math.floor(r), i }))
    .filter(({ i }) => weights[i]! > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length]!.i]!++;
  return out;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

type Wall = { y: number; mo: number; d: number; h: number; mi: number };

/** Daty w miesiącu: od dnia `first` do `last` włącznie, równomiernie, godziny 7:00–21:59. */
function schedule(rnd: () => number, y: number, mo: number, n: number, first: number, last: number): Wall[] {
  return Array.from({ length: n }, (_, i) => ({
    y,
    mo,
    d: n === 1 ? first : first + Math.round((i * (last - first)) / (n - 1)),
    h: int(rnd, 7, 21),
    mi: int(rnd, 0, 59),
  }));
}

const fmt = {
  /** MM/DD/YYYY HH:mm (eksport amerykański). */
  mdy: (w: Wall) => `${pad2(w.mo)}/${pad2(w.d)}/${w.y} ${pad2(w.h)}:${pad2(w.mi)}`,
  /** DD.MM.YYYY HH:mm (polski Excel). */
  dmy: (w: Wall) => `${pad2(w.d)}.${pad2(w.mo)}.${w.y} ${pad2(w.h)}:${pad2(w.mi)}`,
  /** YYYY-MM-DD HH:mm:ss (bez strefy). */
  iso: (w: Wall) => `${w.y}-${pad2(w.mo)}-${pad2(w.d)} ${pad2(w.h)}:${pad2(w.mi)}:00`,
  /** ISO z przesunięciem czasu letniego (+02:00 — daty z sierpnia i września). */
  isoOffset: (w: Wall) => `${w.y}-${pad2(w.mo)}-${pad2(w.d)}T${pad2(w.h)}:${pad2(w.mi)}:00+02:00`,
};

/** „12,480” (eksport angielski). */
const enThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** „12 480” z twardą spacją (polski Excel). */
const plThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Wiersz CSV: cudzysłów, gdy komórka zawiera separator, cudzysłów, nową linię albo skrajne spacje. */
function csvLine(cells: readonly string[], delimiter: string): string {
  return cells
    .map((cell) =>
      cell.includes(delimiter) || /["\r\n]/.test(cell) || cell !== cell.trim()
        ? `"${cell.replace(/"/g, '""')}"`
        : cell,
    )
    .join(delimiter);
}

function csv(rows: readonly (readonly string[])[], delimiter: string, newline = '\n'): string {
  return rows.map((row) => csvLine(row, delimiter)).join(newline) + newline;
}

const utf8 = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));
const utf8Bom = (text: string) =>
  new Uint8Array(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]));

/** Jawna tablica windows-1250 dla polskich liter i typografii (bez zależności od ICU). */
const CP1250: Record<string, number> = {
  ą: 0xb9,
  ć: 0xe6,
  ę: 0xea,
  ł: 0xb3,
  ń: 0xf1,
  ó: 0xf3,
  ś: 0x9c,
  ź: 0x9f,
  ż: 0xbf,
  Ą: 0xa5,
  Ć: 0xc6,
  Ę: 0xca,
  Ł: 0xa3,
  Ń: 0xd1,
  Ó: 0xd3,
  Ś: 0x8c,
  Ź: 0x8f,
  Ż: 0xaf,
  '„': 0x84,
  '”': 0x94,
  '“': 0x93,
  '–': 0x96,
  '—': 0x97,
  ' ': 0xa0,
};

export function encodeCp1250(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (CP1250[ch] !== undefined) out.push(CP1250[ch]);
    else throw new Error(`Znak spoza tablicy windows-1250: ${ch}`);
  }
  return new Uint8Array(out);
}

/* ───────────────────────── dane ───────────────────────── */

type Kind = 'reel' | 'post' | 'carousel' | 'story';

type Post = {
  at: Wall;
  kind: Kind;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  duration: number | null;
  n: number;
};

type MonthSpec = {
  y: number;
  mo: number;
  first: number;
  last: number;
  kinds: Partial<Record<Kind, number>>;
  views: number;
  follows: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

const VIEW_WEIGHT: Record<Kind, [number, number]> = {
  reel: [2.2, 4.2],
  carousel: [1.2, 2],
  post: [0.9, 1.6],
  story: [0.35, 0.7],
};

/** Publikacje miesiąca z dokładnie zadanymi sumami (sumy pilnują testy i e2e). */
function month(rnd: () => number, spec: MonthSpec, startN: number): Post[] {
  const kinds = shuffle(
    rnd,
    (Object.entries(spec.kinds) as [Kind, number][]).flatMap(([kind, n]) => Array<Kind>(n).fill(kind)),
  );
  const when = schedule(rnd, spec.y, spec.mo, kinds.length, spec.first, spec.last);
  const viewW = kinds.map((k) => between(rnd, ...VIEW_WEIGHT[k]));
  const notStory = (k: Kind, w: number) => (k === 'story' ? 0 : w);
  const views = distribute(spec.views, viewW);
  const likes = distribute(
    spec.likes,
    kinds.map((k, i) => viewW[i]! * (k === 'story' ? 0.3 : between(rnd, 0.8, 1.2))),
  );
  const comments = distribute(
    spec.comments,
    kinds.map((k) => notStory(k, between(rnd, 0.5, 1.5))),
  );
  const shares = distribute(
    spec.shares,
    kinds.map((k, i) => viewW[i]! * (k === 'story' ? 0.2 : between(rnd, 0.6, 1.4))),
  );
  const saves = distribute(
    spec.saves,
    kinds.map((k, i) => notStory(k, viewW[i]! * between(rnd, 0.6, 1.4))),
  );
  const follows = distribute(
    spec.follows,
    kinds.map((k, i) => viewW[i]! * (k === 'reel' ? 1.5 : 0.8) * between(rnd, 0.5, 1.5)),
  );
  return kinds.map((kind, i) => ({
    at: when[i]!,
    kind,
    views: views[i]!,
    reach: Math.round(views[i]! * between(rnd, 0.62, 0.84)),
    likes: likes[i]!,
    comments: comments[i]!,
    shares: shares[i]!,
    saves: saves[i]!,
    follows: follows[i]!,
    duration: kind === 'reel' ? int(rnd, 12, 58) : kind === 'story' ? 15 : null,
    n: startN + i,
  }));
}

/** Opisy po polsku (zmyślone) — parser ma je pominąć. Są tu średniki, przecinki, cudzysłowy i nowa linia. */
export const DESCRIPTIONS = [
  'Metamorfoza brwi krok po kroku. Zapisy przez link w profilu.',
  'Nowy cennik; szczegóły w wyróżnionych relacjach',
  'Kulisy sesji „przed i po”\nDziękujemy za zaufanie',
  'Pytanie tygodnia: "henna czy laminacja?"',
  'Jesienna pielęgnacja, krótko i konkretnie',
  'Wolne terminy na czwartek i piątek',
  'Zespół Studio Lumi (dane syntetyczne) przy pracy',
  'Efekt po 6 tygodniach — bez filtrów',
];

const ACCOUNT = {
  id: '900000000000001',
  username: 'studio_lumi_przyklad',
  name: 'Studio Lumi (dane syntetyczne)',
};

const PL_TYPE: Record<Kind, string> = {
  reel: 'Rolka na Instagramie',
  post: 'Obraz na Instagramie',
  carousel: 'Karuzela na Instagramie',
  story: 'Relacja na Instagramie',
};
const EN_TYPE: Record<Kind, string> = {
  reel: 'IG reel',
  post: 'IG image',
  carousel: 'IG carousel',
  story: 'IG story',
};

function permalink(p: Post): string {
  const code = `SYNTH${String(p.n).padStart(4, '0')}`;
  if (p.kind === 'reel') return `https://www.instagram.com/reel/${code}/`;
  if (p.kind === 'story') return `https://www.instagram.com/stories/${ACCOUNT.username}/${p.n}/`;
  return `https://www.instagram.com/p/${code}/`;
}

const byDateDesc = (a: Post, b: Post) => fmt.iso(b.at).localeCompare(fmt.iso(a.at)) || b.n - a.n;
const byDateAsc = (a: Post, b: Post) => fmt.iso(a.at).localeCompare(fmt.iso(b.at)) || a.n - b.n;

/**
 * Główny zestaw: sierpień i wrzesień 2026. Sumy wrześniowe = lib/report/example.ts (31 publikacji:
 * 8 rolek, 9 postów, 14 relacji; 12 480 wyświetleń; 611 interakcji; 64 obserwacje), sierpień: 11 420
 * wyświetleń i 51 obserwacji.
 */
export const MAIN_TOTALS = {
  '2026-09': {
    posts: 31,
    byType: { reel: 8, post: 9, story: 14 },
    views: 12480,
    interactions: 611,
    follows: 64,
  },
  '2026-08': {
    posts: 28,
    byType: { reel: 7, post: 8, story: 13 },
    views: 11420,
    interactions: 552,
    follows: 51,
  },
} as const;

function mainDataset(): Post[] {
  const rnd = random(20260930);
  const aug = month(
    rnd,
    {
      y: 2026,
      mo: 8,
      first: 1,
      last: 31,
      kinds: MAIN_TOTALS['2026-08'].byType,
      views: 11420,
      follows: 51,
      likes: 371,
      comments: 49,
      shares: 52,
      saves: 80,
    },
    1,
  );
  const sep = month(
    rnd,
    {
      y: 2026,
      mo: 9,
      first: 1,
      last: 30,
      kinds: MAIN_TOTALS['2026-09'].byType,
      views: 12480,
      follows: 64,
      likes: 402,
      comments: 57,
      shares: 61,
      saves: 91,
    },
    101,
  );
  const top = [...sep].sort((a, b) => b.views - a.views).slice(0, 4);
  if (new Set(top.map((p) => p.views)).size !== 4) throw new Error('Remis w najlepszych publikacjach');
  return [...aug, ...sep].sort(byDateDesc);
}

const PL_MAIN_HEADER = [
  'Identyfikator posta',
  'Identyfikator konta',
  'Nazwa użytkownika konta',
  'Nazwa konta',
  'Opis',
  'Czas trwania (s)',
  'Czas publikacji',
  'Permalink',
  'Typ posta',
  'Komentarz do danych',
  'Data',
  'Wyświetlenia',
  'Zasięg',
  'Polubienia',
  'Udostępnienia',
  'Obserwacje',
  'Komentarze',
  'Zapisania',
];

function plMainRow(p: Post, description: string, account = ACCOUNT): string[] {
  return [
    `syntetyczny-${String(p.n).padStart(4, '0')}`,
    account.id,
    account.username,
    account.name,
    description,
    p.duration === null ? '' : String(p.duration),
    fmt.mdy(p.at),
    permalink(p),
    PL_TYPE[p.kind],
    '',
    'Łącznie',
    String(p.views),
    String(p.reach),
    String(p.likes),
    String(p.shares),
    String(p.follows),
    String(p.comments),
    String(p.saves),
  ];
}

function plSemicolonBom(): Uint8Array {
  const posts = mainDataset();
  const rows = posts.map((p, i) => plMainRow(p, DESCRIPTIONS[i % DESCRIPTIONS.length]!));
  return utf8Bom(csv([PL_MAIN_HEADER, ...rows], ';'));
}

function privacyCanary(): Uint8Array {
  const posts = mainDataset();
  const account = {
    id: '900000000000002',
    username: 'sedno_canary_7f3a',
    name: `Konto kontrolne ${PRIVACY_CANARY}`,
  };
  // Pierwsza linia pliku (nagłówek) też zawiera znacznik: dodatkowa, nieznana kolumna.
  const header = [...PL_MAIN_HEADER, `Kolumna kontrolna ${PRIVACY_CANARY}`];
  const rows = posts.map((p, i) => [
    ...plMainRow(
      p,
      `${PRIVACY_CANARY} ${DESCRIPTIONS[i % DESCRIPTIONS.length]!} ${PRIVACY_CANARY}-${p.n}`,
      account,
    ),
    `${PRIVACY_CANARY}-${p.n}`,
  ]);
  return utf8Bom(csv([header, ...rows], ';'));
}

/** Eksport angielski, przecinek, MM/DD/YYYY, liczby „1,234” w cudzysłowach. */
export const EN_TOTALS = { posts: 20, views: 45678, follows: 37, interactions: 2130 } as const;

function enComma(): Uint8Array {
  const rnd = random(4567801);
  const posts = month(
    rnd,
    {
      y: 2026,
      mo: 9,
      first: 1,
      last: 30,
      kinds: { reel: 5, post: 6, carousel: 3, story: 6 },
      views: EN_TOTALS.views,
      follows: EN_TOTALS.follows,
      likes: 1500,
      comments: 210,
      shares: 180,
      saves: 240,
    },
    201,
  ).sort(byDateAsc);
  const header = [
    'Post ID',
    'Account ID',
    'Account username',
    'Account name',
    'Description',
    'Duration (sec)',
    'Publish time',
    'Permalink',
    'Post type',
    'Data comment',
    'Date',
    'Views',
    'Reach',
    'Likes',
    'Shares',
    'Follows',
    'Comments',
    'Saves',
  ];
  const rows = posts.map((p, i) => [
    `synthetic-${p.n}`,
    ACCOUNT.id,
    ACCOUNT.username,
    ACCOUNT.name,
    DESCRIPTIONS[(i + 3) % DESCRIPTIONS.length]!,
    p.duration === null ? '' : String(p.duration),
    fmt.mdy(p.at),
    permalink(p),
    EN_TYPE[p.kind],
    '',
    'Lifetime',
    enThousands(p.views),
    enThousands(p.reach),
    enThousands(p.likes),
    String(p.shares),
    String(p.follows),
    String(p.comments),
    String(p.saves),
  ]);
  return utf8(csv([header, ...rows], ','));
}

/** Tabulator, UTF-8 bez BOM, ISO z przesunięciem, tysiące z twardą spacją, inne nazwy kolumn. */
export const TAB_TOTALS = { posts: 12, views: 23456, follows: 18 } as const;

function tab(): Uint8Array {
  const rnd = random(2345601);
  const posts = month(
    rnd,
    {
      y: 2026,
      mo: 9,
      first: 2,
      last: 29,
      kinds: { reel: 4, post: 4, carousel: 2, story: 2 },
      views: TAB_TOTALS.views,
      follows: TAB_TOTALS.follows,
      likes: 640,
      comments: 88,
      shares: 71,
      saves: 95,
    },
    301,
  ).sort(byDateAsc);
  const typeName: Record<Kind, string> = {
    reel: 'Rolka',
    post: 'Post',
    carousel: 'Karuzela',
    story: 'Relacja',
  };
  const header = [
    'Czas publikacji',
    'Typ',
    'Opis',
    'Wyświetlenia',
    'Konta, do których dotarto',
    'Reakcje',
    'Komentarze',
    'Udostępnienia',
    'Zapisania',
    'Nowi obserwujący',
    'Link',
  ];
  const rows = posts.map((p, i) => [
    fmt.isoOffset(p.at),
    typeName[p.kind],
    DESCRIPTIONS[(i + 1) % DESCRIPTIONS.length]!.replace(/\n/g, ' '),
    plThousands(p.views),
    plThousands(p.reach),
    String(p.likes),
    String(p.comments),
    String(p.shares),
    String(p.saves),
    String(p.follows),
    permalink(p),
  ]);
  return utf8(csv([header, ...rows], '\t'));
}

/** Plik zapisany ponownie w polskim Excelu: windows-1250 bez BOM, średnik, DD.MM.YYYY, CRLF. */
export const CP1250_TOTALS = { posts: 10, views: 5432, follows: 12 } as const;

function windows1250(): Uint8Array {
  const rnd = random(5432101);
  const posts = month(
    rnd,
    {
      y: 2026,
      mo: 9,
      first: 3,
      last: 28,
      kinds: { reel: 3, post: 4, story: 3 },
      views: CP1250_TOTALS.views,
      follows: CP1250_TOTALS.follows,
      likes: 210,
      comments: 31,
      shares: 17,
      saves: 26,
    },
    401,
  ).sort(byDateAsc);
  const header = [
    'Czas publikacji',
    'Typ posta',
    'Opis',
    'Wyświetlenia',
    'Zasięg',
    'Polubienia',
    'Komentarze',
    'Udostępnienia',
    'Zapisania',
    'Obserwacje',
  ];
  const plDescriptions = [
    'Zażółć gęślą jaźń — ŻÓŁTA ŁĄKA, ŚWIEŻE ĆMY',
    'Jesień w Studio Lumi: „przed” i „po”',
    'Ćwiczenia z pielęgnacji – część druga',
    'Źródło inspiracji: wrzesień',
  ];
  const typeName: Record<Kind, string> = {
    reel: 'Rolka na Instagramie',
    post: 'Zdjęcie na Instagramie',
    carousel: 'Karuzela na Instagramie',
    story: 'Relacja na Instagramie',
  };
  const rows = posts.map((p, i) => [
    fmt.dmy(p.at),
    typeName[p.kind],
    plDescriptions[i % plDescriptions.length]!,
    String(p.views),
    String(p.reach),
    String(p.likes),
    String(p.comments),
    String(p.shares),
    String(p.saves),
    String(p.follows),
  ]);
  const bytes = encodeCp1250(csv([header, ...rows], ';', '\r\n'));
  // Kontrola tablicy: dekoder WHATWG musi odczytać dokładnie ten sam tekst.
  if (new TextDecoder('windows-1250').decode(bytes) !== csv([header, ...rows], ';', '\r\n')) {
    throw new Error('Tablica windows-1250 niezgodna z dekoderem');
  }
  return bytes;
}

/** Opis eksportu nad nagłówkiem (3 wiersze, w tym pusty). */
export const PREAMBLE_TOTALS = { posts: 8, views: 3210, follows: 9 } as const;

function preamble(): Uint8Array {
  const rnd = random(3210001);
  const posts = month(
    rnd,
    {
      y: 2026,
      mo: 9,
      first: 1,
      last: 30,
      kinds: { reel: 2, post: 3, story: 3 },
      views: PREAMBLE_TOTALS.views,
      follows: PREAMBLE_TOTALS.follows,
      likes: 120,
      comments: 14,
      shares: 9,
      saves: 11,
    },
    501,
  ).sort(byDateAsc);
  const header = [
    'Czas publikacji',
    'Typ posta',
    'Opis',
    'Wyświetlenia',
    'Zasięg',
    'Polubienia',
    'Obserwacje',
  ];
  const rows = posts.map((p, i) => [
    fmt.iso(p.at),
    PL_TYPE[p.kind],
    DESCRIPTIONS[i % DESCRIPTIONS.length]!,
    String(p.views),
    String(p.reach),
    String(p.likes),
    String(p.follows),
  ]);
  const lines = [
    'Eksport treści — dane syntetyczne',
    'Konto: Studio Lumi (przykład), okres: 1–30 września 2026',
    '',
  ].join('\n');
  return utf8(`${lines}\n${csv([header, ...rows], ',')}`);
}

/** Puste komórki, „-”, „—”, „N/A”, wiersz pusty, krótszy wiersz, wiersz bez daty i wiersz sumy. */
function emptyCells(): Uint8Array {
  const header = [
    'Czas publikacji',
    'Typ posta',
    'Opis',
    'Wyświetlenia',
    'Zasięg',
    'Polubienia',
    'Komentarze',
    'Udostępnienia',
    'Zapisania',
    'Obserwacje',
  ];
  const rows = [
    ['09/01/2026 10:00', 'Rolka na Instagramie', 'Opis pierwszy', '1200', '900', '45', '3', '2', '5', '2'],
    ['09/03/2026 12:30', 'Obraz na Instagramie', 'Opis drugi', '', '300', '12', '-', '0', 'N/A', ''],
    ['09/05/2026 18:00', 'Relacja na Instagramie', '', '250', '', '—'],
    ['', '', '', '', '', '', '', '', '', ''],
    ['09/08/2026 09:15', 'Rolka na Instagramie', 'Opis czwarty', 'n/a', '700', '30', '4', '1', '2', '1'],
    ['09/12/2026 20:45', '', 'Opis bez typu', '400', '350', ' ', '1', '0', '0', '0'],
    ['', 'Obraz na Instagramie', 'Wiersz bez daty', '100', '80', '1', '0', '0', '0', '0'],
    ['Suma', '', '', '1950', '2250', '88', '8', '3', '7', '3'],
    ['09/15/2026 11:00', 'Relacja na Instagramie', 'Opis szósty', '-5', '120', '0', '0', '0', '0', '0'],
  ];
  return utf8(csv([header, ...rows], ';'));
}

/** Sierpień w całości i wrzesień do 27 września. */
function incompleteMonth(): Uint8Array {
  const rnd = random(2709001);
  const common = { follows: 5, likes: 90, comments: 12, shares: 8, saves: 10 };
  const aug = month(
    rnd,
    { y: 2026, mo: 8, first: 1, last: 31, kinds: { reel: 3, post: 4, story: 3 }, views: 4100, ...common },
    601,
  );
  const sep = month(
    rnd,
    { y: 2026, mo: 9, first: 1, last: 27, kinds: { reel: 3, post: 3, story: 3 }, views: 3900, ...common },
    701,
  );
  const header = [
    'Publish time',
    'Post type',
    'Description',
    'Views',
    'Reach',
    'Likes',
    'Comments',
    'Shares',
    'Saves',
    'Follows',
  ];
  const rows = [...aug, ...sep]
    .sort(byDateAsc)
    .map((p, i) => [
      fmt.mdy(p.at),
      EN_TYPE[p.kind],
      DESCRIPTIONS[i % DESCRIPTIONS.length]!,
      String(p.views),
      String(p.reach),
      String(p.likes),
      String(p.comments),
      String(p.shares),
      String(p.saves),
      String(p.follows),
    ]);
  return utf8(csv([header, ...rows], ','));
}

/** Starszy eksport: „Impressions” i „Reach”, bez „Views” (marzec 2025, przed zmianą metryki). */
function noViews(): Uint8Array {
  const rnd = random(2503001);
  const posts = month(
    rnd,
    {
      y: 2025,
      mo: 3,
      first: 2,
      last: 30,
      kinds: { reel: 3, post: 3, story: 2 },
      views: 6400,
      follows: 7,
      likes: 150,
      comments: 20,
      shares: 11,
      saves: 14,
    },
    801,
  ).sort(byDateAsc);
  const header = [
    'Publish time',
    'Post type',
    'Description',
    'Impressions',
    'Reach',
    'Likes',
    'Comments',
    'Shares',
    'Saves',
    'Follows',
  ];
  const rows = posts.map((p, i) => [
    fmt.mdy(p.at),
    EN_TYPE[p.kind],
    DESCRIPTIONS[i % DESCRIPTIONS.length]!,
    String(p.views),
    String(p.reach),
    String(p.likes),
    String(p.comments),
    String(p.shares),
    String(p.saves),
    String(p.follows),
  ]);
  return utf8(csv([header, ...rows], ','));
}

/** Ani wyświetleń, ani zasięgu (tylko „Impressions”) → E_MISSING_COLUMNS. */
function noViewsNoReach(): Uint8Array {
  const header = ['Publish time', 'Post type', 'Description', 'Impressions', 'Likes', 'Comments'];
  const rows = [
    ['03/04/2025 10:00', 'IG reel', 'Opis pierwszy', '1500', '40', '3'],
    ['03/18/2025 17:30', 'IG image', 'Opis drugi', '620', '18', '1'],
  ];
  return utf8(csv([header, ...rows], ','));
}

/** Żadnego rozpoznawalnego nagłówka — do mapowania ręcznego. */
function unknownHeaders(): Uint8Array {
  const header = ['Kiedy', 'Ile razy obejrzano', 'Rodzaj', 'Notatka'];
  const rows = [
    ['2026-09-02 10:00', '1500', 'rolka', 'Notatka syntetyczna 1'],
    ['2026-09-06 18:30', '420', 'zdjęcie', 'Notatka syntetyczna 2'],
    ['2026-09-11 12:15', '310', 'relacja', 'Notatka syntetyczna 3'],
    ['2026-09-19 19:45', '2210', 'rolka', 'Notatka syntetyczna 4'],
    ['2026-09-24 08:05', '505', 'karuzela', 'Notatka syntetyczna 5'],
    ['2026-09-30 21:10', '275', 'relacja', 'Notatka syntetyczna 6'],
  ];
  return utf8(csv([header, ...rows], ','));
}

/** DD.MM.YYYY z dniem > 12 (i dniami ≤ 12, które bez tego byłyby niejednoznaczne). */
function dmyDates(): Uint8Array {
  const header = ['Czas publikacji', 'Typ posta', 'Wyświetlenia', 'Zasięg', 'Polubienia'];
  const rows = [
    ['05.09.2026 09:30', 'Rolka na Instagramie', '800', '600', '25'],
    ['09.09.2026 14:00', 'Obraz na Instagramie', '300', '240', '11'],
    ['13.09.2026 19:15', 'Relacja na Instagramie', '150', '140', '2'],
    ['28.09.2026 07:45', 'Rolka na Instagramie', '1100', '820', '40'],
  ];
  return utf8(csv([header, ...rows], ';'));
}

/** Permalinki: poprawne mieszane z javascript:, http:, innymi domenami i instagram.com bez www. */
export const PERMALINK_CASES: readonly [string, string | undefined][] = [
  ['https://www.instagram.com/p/SYNTH0901/', 'https://www.instagram.com/p/SYNTH0901/'],
  ['javascript:alert(1)', undefined],
  ['http://www.instagram.com/p/SYNTH0903/', undefined],
  ['https://evil.example/p/SYNTH0904/', undefined],
  ['https://instagram.com/p/SYNTH0905/', undefined],
  [
    '  https://www.instagram.com/reel/SYNTH0906/?igsh=abc  ',
    'https://www.instagram.com/reel/SYNTH0906/?igsh=abc',
  ],
  ['https://www.instagram.com.evil.example/p/SYNTH0907/', undefined],
  ['JavaScript:https://www.instagram.com/p/x/', undefined],
  ['https://www.instagram.com/p/SYNTH0909/"onmouseover="alert(1)', undefined],
  ['data:text/html,<script>alert(1)</script>', undefined],
];

function jsPermalink(): Uint8Array {
  const header = ['Publish time', 'Post type', 'Permalink', 'Views', 'Reach', 'Likes'];
  const rows = PERMALINK_CASES.map(([link], i) => [
    `09/${pad2(i + 1)}/2026 12:00`,
    'IG image',
    link,
    String(100 + i),
    String(80 + i),
    String(i),
  ]);
  return utf8(csv([header, ...rows], ','));
}

function headerOnly(): Uint8Array {
  return utf8Bom(csv([PL_MAIN_HEADER], ';'));
}

/** Plik binarny z nazwą .csv (nagłówek ZIP jak w .xlsx i bajty zerowe). */
function binary(): Uint8Array {
  const rnd = random(7);
  const head = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x21, 0x00];
  const body = Array.from({ length: 242 }, (_, i) => (i % 7 === 0 ? 0 : int(rnd, 0, 255)));
  return new Uint8Array([...head, ...body]);
}

/* ───────────────────────── zapis ───────────────────────── */

export function buildFixtures(): Map<string, Uint8Array> {
  return new Map<string, Uint8Array>([
    ['synthetic-pl-semicolon-bom.csv', plSemicolonBom()],
    ['synthetic-en-comma.csv', enComma()],
    ['synthetic-tab.csv', tab()],
    ['synthetic-windows-1250.csv', windows1250()],
    ['synthetic-preamble.csv', preamble()],
    ['synthetic-empty-cells.csv', emptyCells()],
    ['synthetic-incomplete-month.csv', incompleteMonth()],
    ['synthetic-no-views.csv', noViews()],
    ['synthetic-no-views-no-reach.csv', noViewsNoReach()],
    ['synthetic-unknown-headers.csv', unknownHeaders()],
    ['synthetic-dmy-dates.csv', dmyDates()],
    ['synthetic-js-permalink.csv', jsPermalink()],
    ['synthetic-empty.csv', new Uint8Array(0)],
    ['synthetic-header-only.csv', headerOnly()],
    ['synthetic-binary.csv', binary()],
    ['synthetic-not-csv.txt', utf8('To jest zwykły plik tekstowy, nie eksport CSV.\n')],
    ['synthetic-privacy-canary.csv', privacyCanary()],
  ]);
}

function main() {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const [name, bytes] of buildFixtures()) {
    const file = path.join(FIXTURES_DIR, name);
    const current = fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null;
    if (current && Buffer.from(current).equals(Buffer.from(bytes))) continue;
    if (check) {
      console.error(
        `Nieaktualny plik: tests/fixtures/${name}. Uruchom pnpm exec tsx scripts/make-fixtures.ts.`,
      );
      stale = true;
    } else {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
      fs.writeFileSync(file, bytes);
      console.log(`Zapisano tests/fixtures/${name}`);
    }
  }
  if (stale) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
