/**
 * Kontrakt parsera eksportu Meta Business Suite (PROMPT.md §6).
 * Wiersze żyją wyłącznie w pamięci przeglądarki — nigdy nie są wysyłane ani zapisywane.
 */

/** Pola, które parser rozpoznaje w nagłówkach. `description` tylko po to, żeby je pominąć. */
export type FieldKey =
  | 'publishedAt'
  | 'views'
  | 'reach'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saves'
  | 'follows'
  | 'type'
  | 'permalink'
  | 'description';

/** Pola wymagane do raportu: data i wyświetlenia (albo zasięg, gdy nie ma kolumny wyświetleń). */
export type RequiredField = 'publishedAt' | 'views';

export type PostType = 'reel' | 'post' | 'carousel' | 'story' | 'other';

export type PostRow = {
  publishedAt: Date;
  type: PostType;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  follows: number | null;
  /** Tylko https://www.instagram.com/… — inne adresy są odrzucane (docs/decisions.md, p. 16). */
  permalink?: string;
};

export type WarningCode =
  'W_ENCODING_GUESSED' | 'W_INCOMPLETE_MONTH' | 'W_MONTH_IN_PROGRESS' | 'W_METRIC_CHANGE';

export type Warning = { code: WarningCode; params?: Record<string, string | number> };

export type ParsedExport = {
  rows: PostRow[];
  range: { from: Date; to: Date };
  /** Miesiące obecne w pliku, rosnąco, 'YYYY-MM' (strefa Europe/Warsaw). */
  months: string[];
  warnings: Warning[];
  /** Pola rozpoznane w pliku (bez `description`). Np. brak `follows` → „nowi obserwujący” = null, nie 0. */
  fields: FieldKey[];
};

export type ErrorCode = 'E_NOT_CSV' | 'E_EMPTY' | 'E_TOO_BIG' | 'E_MISSING_COLUMNS' | 'E_NO_ROWS_IN_MONTH';

export type ParseError =
  | { code: 'E_NOT_CSV' }
  | { code: 'E_EMPTY' }
  | { code: 'E_TOO_BIG'; reason: 'size' | 'rows' }
  | {
      code: 'E_MISSING_COLUMNS';
      /** Brakujące pola wymagane. */
      missing: RequiredField[];
      /** Nagłówki z pliku (oryginalny tekst, przycięty) — do ekranu „Przypisz kolumny”. */
      headers: string[];
    };

export type ParseResult = { ok: true; data: ParsedExport } | { ok: false; error: ParseError };

/** Mapowanie ręczne: oryginalny nagłówek z pliku → pole. Zapamiętywane w localStorage. */
export type ColumnMapping = Record<string, FieldKey>;

/** Wejście parsera (z File w przeglądarce albo z pliku w testach). */
export type ParseInput = {
  bytes: ArrayBuffer;
  fileName: string;
  /** MIME z File.type; pusty, gdy przeglądarka go nie zna. */
  mimeType: string;
};

/** Limity (PROMPT.md §6). */
export const LIMITS = { maxBytes: 10 * 1024 * 1024, maxRows: 20_000 } as const;

/** Protokół Web Workera. */
export type WorkerRequest = { type: 'parse'; file: File; mapping?: ColumnMapping };
export type WorkerResponse =
  { type: 'progress'; done: number; total: number } | { type: 'result'; result: ParseResult; ms: number };
