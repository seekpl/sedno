/**
 * Wejście pliku: sprawdzenie nazwy, typu MIME i rozmiaru oraz dekodowanie bajtów na tekst (PROMPT.md §6).
 * Bez zależności (bez PapaParse), więc można go importować statycznie także z wątku głównego.
 */
import { LIMITS, type ParseError } from './types';

/** MIME, które przyjmujemy. Windows zgłasza CSV jako application/vnd.ms-excel. */
const ALLOWED_MIME = new Set(['', 'application/vnd.ms-excel', 'application/csv', 'application/x-csv']);

/**
 * Sprawdza nazwę, typ i rozmiar pliku przed jego odczytem. Kolejność: najpierw „to nie CSV”
 * (bardziej pomocny komunikat), potem rozmiar. Zwraca null, gdy plik można czytać.
 */
export function checkFileMeta(meta: { fileName: string; mimeType: string; size: number }): ParseError | null {
  if (!/\.csv$/i.test(meta.fileName.trim())) return { code: 'E_NOT_CSV' };
  const mime = (meta.mimeType.split(';')[0] ?? '').trim().toLowerCase();
  if (!mime.startsWith('text/') && !ALLOWED_MIME.has(mime)) return { code: 'E_NOT_CSV' };
  if (meta.size > LIMITS.maxBytes) return { code: 'E_TOO_BIG', reason: 'size' };
  return null;
}

export type DecodeResult =
  | {
      ok: true;
      text: string;
      /** Kodowanie, którym ostatecznie odczytano plik. */
      encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1250';
      /** true, gdy kodowanie zgadliśmy (zamiana na windows-1250) → ostrzeżenie W_ENCODING_GUESSED. */
      guessed: boolean;
      /** true, gdy plik zaczynał się od BOM. */
      bom: boolean;
    }
  | { ok: false; error: ParseError };

function decodeWith(encoding: string, bytes: Uint8Array): string {
  // fatal: false — błędne sekwencje zamieniają się w U+FFFD, które wykrywamy niżej.
  return new TextDecoder(encoding, { fatal: false, ignoreBOM: false }).decode(bytes);
}

/**
 * Hipoteza: UTF-16 LE bez BOM (rzadkie, ale Excel potrafi tak zapisać „Tekst Unicode”). Rozpoznajemy
 * po tym, że niemal każdy bajt na pozycji nieparzystej to 0, a na parzystej nie.
 */
function looksLikeUtf16LeWithoutBom(bytes: Uint8Array): boolean {
  const sample = Math.min(bytes.length - (bytes.length % 2), 2000);
  if (sample < 8) return false;
  let oddZeros = 0;
  let evenZeros = 0;
  for (let i = 0; i < sample; i += 2) {
    if (bytes[i] === 0) evenZeros++;
    if (bytes[i + 1] === 0) oddZeros++;
  }
  const pairs = sample / 2;
  return oddZeros / pairs > 0.9 && evenZeros / pairs < 0.1;
}

/** Czy bajty są poprawnym UTF-8 (dekoder ścisły). Dosłowny znak U+FFFD zapisany w UTF-8 jest poprawny. */
function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Czy tekst odczytany jako UTF-8 z błędami to jednak UTF-8 z kilkoma uszkodzonymi bajtami (np. ucięte emoji
 * w opisie)? Plik z polskiego Excela (windows-1250) ma każdą polską literę jako błędny bajt i prawie żadnych
 * poprawnych znaków spoza ASCII; eksport w UTF-8 ma ich więcej niż znaków zastępczych.
 */
function mostlyUtf8(text: string): boolean {
  let replacement = 0;
  let valid = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xfffd) replacement++;
    else if (code > 0x7f) valid++;
  }
  return valid > replacement;
}

/**
 * Dekoduje plik: BOM (UTF-8, UTF-16 LE/BE) → odpowiednie kodowanie; domyślnie UTF-8. Gdy w tekście jest
 * znak zastępczy U+FFFD, bo bajty nie są poprawnym UTF-8, a poprawnych znaków spoza ASCII jest mniej niż
 * zastępczych, czytamy plik jako windows-1250 (zapisany ponownie w polskim Excelu). Pojedynczy uszkodzony
 * bajt w eksporcie UTF-8 nie przełącza więc całego pliku na windows-1250 (polskie nagłówki by nie pasowały).
 * Znak NUL w tekście oznacza plik binarny (np. arkusz .xlsx z nazwą .csv) → E_NOT_CSV.
 */
export function decodeBytes(input: ArrayBuffer | Uint8Array): DecodeResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let text: string;
  let encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1250' = 'utf-8';
  let guessed = false;
  let bom = false;

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bom = true;
    text = decodeWith('utf-8', bytes);
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    bom = true;
    encoding = 'utf-16le';
    text = decodeWith('utf-16le', bytes);
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    bom = true;
    encoding = 'utf-16be';
    text = decodeWith('utf-16be', bytes);
  } else if (looksLikeUtf16LeWithoutBom(bytes)) {
    encoding = 'utf-16le';
    text = decodeWith('utf-16le', bytes);
  } else {
    text = decodeWith('utf-8', bytes);
    if (text.includes('\uFFFD') && !isValidUtf8(bytes) && !mostlyUtf8(text)) {
      try {
        text = decodeWith('windows-1250', bytes);
        encoding = 'windows-1250';
        guessed = true;
      } catch {
        // Środowisko bez windows-1250 (np. Node bez pełnego ICU): zostaje UTF-8 ze znakami zastępczymi.
      }
    }
  }

  // TextDecoder usuwa BOM, ale plik bywa sklejony z kilku (np. dwukrotny zapis) — zdejmujemy resztki.
  text = text.replace(/^\uFEFF+/, '');
  if (text.includes('\u0000')) return { ok: false, error: { code: 'E_NOT_CSV' } };
  if (text.trim() === '') return { ok: false, error: { code: 'E_EMPTY' } };
  return { ok: true, text, encoding, guessed, bom };
}
