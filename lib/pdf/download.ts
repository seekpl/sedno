/**
 * Pobranie raportu jako PDF w przeglądarce (bez konta, PROMPT.md §2.2). @react-pdf/renderer i <ReportPdf>
 * ładujemy importem dynamicznym dopiero po kliknięciu, więc nie ma ich w paczce żadnej strony.
 * Jedyny ruch sieciowy to pobranie fontów i — z kontem — logo autora z tej samej domeny (/fonts/pdf/,
 * /app/logo, /r/{token}/logo). Dane raportu nie opuszczają karty.
 */
import { createElement, type ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { reportView } from '@/lib/report/format';
import type { ReportData } from '@/lib/report/types';

/** Ścieżka fontów PDF w public/ (kopie brand/fonts/pdf/). */
export const PDF_FONTS_URL = '/fonts/pdf/';

export type DownloadPdfOptions = {
  /** Logo autora z tej samej domeny (/app/logo, /r/{token}/logo). Bez niego PDF ma nazwę i inicjały autora. */
  logoSrc?: string;
};

/** Tworzy PDF, zapisuje go przez tymczasowy link <a download> i zwraca nazwę pliku. */
export async function downloadReportPdf(data: ReportData, options: DownloadPdfOptions = {}): Promise<string> {
  const [{ pdf }, { ReportPdf }, { preparePdfFonts, registerPdfFonts }, { loadPdfLogo }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/report/ReportPdf'),
    import('./fonts'),
    import('./logo'),
  ]);
  registerPdfFonts(PDF_FONTS_URL);
  const [logoSrc] = await Promise.all([
    options.logoSrc ? loadPdfLogo(options.logoSrc) : Promise.resolve(null),
    preparePdfFonts(),
  ]);

  // <ReportPdf> zwraca <Document>; pdf() oczekuje elementu z propsami dokumentu.
  const element = createElement(ReportPdf, {
    data,
    ...(logoSrc ? { logoSrc } : {}),
  }) as unknown as ReactElement<DocumentProps>;
  const blob = await pdf(element).toBlob();
  const fileName = reportView(data).fileName;

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Zwolnienie adresu po rozpoczęciu pobierania (Safari potrzebuje chwili po kliknięciu).
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return fileName;
}
