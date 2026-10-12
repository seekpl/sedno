/**
 * Fonty PDF (PROMPT.md §11): statyczne TTF z brand/fonts/pdf/ (kopie w public/fonts/pdf/).
 * Bricolage — nagłówki i wszystkie liczby, Atkinson — tekst. Moduł importuje @react-pdf/renderer,
 * więc ładujemy go wyłącznie dynamicznie (lib/pdf/download.ts), nigdy w paczce strony.
 */
import { Font } from '@react-pdf/renderer';

/** Nazwy rodzin w PDF. */
export const PDF_FONT = { display: 'Bricolage', text: 'Atkinson' } as const;

/** Grubości w PDF. Marka używa 650 dla SemiBold Bricolage; statyczny plik ma grubość 600. */
export const PDF_WEIGHT = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

const FILES = {
  [PDF_FONT.display]: [
    { file: 'BricolageGrotesque-Medium.ttf', fontWeight: PDF_WEIGHT.medium },
    { file: 'BricolageGrotesque-SemiBold.ttf', fontWeight: PDF_WEIGHT.semibold },
    { file: 'BricolageGrotesque-Bold.ttf', fontWeight: PDF_WEIGHT.bold },
  ],
  [PDF_FONT.text]: [
    { file: 'AtkinsonHyperlegibleNext-Regular.ttf', fontWeight: PDF_WEIGHT.regular },
    { file: 'AtkinsonHyperlegibleNext-SemiBold.ttf', fontWeight: PDF_WEIGHT.semibold },
    { file: 'AtkinsonHyperlegibleNext-Bold.ttf', fontWeight: PDF_WEIGHT.bold },
  ],
};

let registeredBase: string | null = null;

/** Słowo dłuższe niż tyle znaków (np. adres) dzielimy na kawałki, żeby nie wychodziło poza stronę. */
const LONG_WORD = 24;
const CHUNK = 12;

/**
 * Dzielenie wyrazów w PDF. Zwykłych słów nie dzielimy (react-pdf domyślnie dzieli po angielsku, co psuje
 * polskie słowa). Tylko bardzo długie ciągi bez spacji (adresy, hasztagi) dostają miejsca podziału co
 * 12 znaków — react-pdf przenosi je wtedy z łącznikiem zamiast ucinać za prawym marginesem.
 */
export function pdfHyphenation(word: string): string[] {
  const chars = Array.from(word);
  if (chars.length <= LONG_WORD) return [word];
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += CHUNK) parts.push(chars.slice(i, i + CHUNK).join(''));
  return parts;
}

/**
 * Rejestruje fonty raz na proces/kartę. `base`: '/fonts/pdf/' w przeglądarce (pobranie z tej samej domeny)
 * albo bezwzględna ścieżka do public/fonts/pdf/ w testach. Kolejne wywołania nic nie zmieniają
 * (react-pdf wybiera pierwsze zarejestrowane źródło danej grubości).
 */
export function registerPdfFonts(base: string): void {
  if (registeredBase !== null) return;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  for (const [family, fonts] of Object.entries(FILES)) {
    Font.register({
      family,
      fonts: fonts.map(({ file, fontWeight }) => ({ src: `${prefix}${file}`, fontWeight })),
    });
  }
  Font.registerHyphenationCallback(pdfHyphenation);
  registeredBase = prefix;
}

/**
 * Znaki raportu: ASCII, polskie litery i typografia (cudzysłowy, półpauza, pauza, minus, twarda spacja).
 */
const WARM_UP_CHARS = [
  ...Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)),
  ...'ĄĆĘŁŃÓŚŹŻąćęłńóśźż„”»«–—−…·×\u00a0\u202f',
];

let prepared: Promise<void> | null = null;

/**
 * Wczytuje fonty i „rozgrzewa” ich glify. Obejście błędu fontkit: podzbiór fontu dodaje składniki glifów
 * złożonych (np. „n” z „ń”, „e” z „ę”) do wspólnej pamięci glifów bez kodu Unicode. Każdy kolejny PDF
 * w tej samej karcie miałby wtedy te litery bez mapowania ToUnicode — widoczne, ale niemożliwe
 * do skopiowania i wyszukania. Wczytanie glifów z kodami przed pierwszym PDF temu zapobiega.
 * Wymaga wcześniejszego registerPdfFonts(). Idempotentne; po błędzie (np. sieci) można ponowić.
 */
export function preparePdfFonts(): Promise<void> {
  prepared ??= (async () => {
    for (const [fontFamily, fonts] of Object.entries(FILES)) {
      for (const { fontWeight } of fonts) {
        await Font.load({ fontFamily, fontWeight });
        const font = Font.getFont({ fontFamily, fontWeight }).data;
        for (const ch of WARM_UP_CHARS) font?.glyphForCodePoint(ch.codePointAt(0) ?? 0);
      }
    }
  })().catch((error: unknown) => {
    prepared = null;
    forgetFailedFontLoads();
    throw error;
  });
  return prepared;
}

/**
 * react-pdf zapamiętuje odrzuconą obietnicę wczytania fontu (FontSource.loadResultPromise), więc po jednym
 * nieudanym pobraniu każda kolejna próba w tej karcie kończyłaby się tym samym błędem aż do przeładowania
 * strony. Zapominamy nieudane wczytania, żeby „Spróbuj ponownie” naprawdę pobierało font jeszcze raz.
 */
function forgetFailedFontLoads(): void {
  for (const [fontFamily, fonts] of Object.entries(FILES)) {
    for (const { fontWeight } of fonts) {
      const source = Font.getFont({ fontFamily, fontWeight });
      if (!source.data) source.loadResultPromise = null;
    }
  }
}

/** Czy fonty są już zarejestrowane (i skąd). Do testów. */
export function registeredPdfFontBase(): string | null {
  return registeredBase;
}
