/**
 * Pobranie raportu jako PDF w przeglądarce (bez konta, PROMPT.md §2.2). @react-pdf/renderer i <ReportPdf>
 * ładujemy importem dynamicznym dopiero po kliknięciu, więc nie ma ich w paczce żadnej strony.
 * Jedyny ruch sieciowy to pobranie fontów z tej samej domeny (/fonts/pdf/). Dane raportu nie opuszczają karty.
 */
import { createElement, type ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { reportView } from '@/lib/report/format';
import type { ReportData } from '@/lib/report/types';

/** Ścieżka fontów PDF w public/ (kopie brand/fonts/pdf/). */
export const PDF_FONTS_URL = '/fonts/pdf/';

/** Tworzy PDF, zapisuje go przez tymczasowy link <a download> i zwraca nazwę pliku. */
export async function downloadReportPdf(data: ReportData): Promise<string> {
  const [{ pdf }, { ReportPdf }, { preparePdfFonts, registerPdfFonts }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/report/ReportPdf'),
    import('./fonts'),
  ]);
  registerPdfFonts(PDF_FONTS_URL);
  await preparePdfFonts();

  // <ReportPdf> zwraca <Document>; pdf() oczekuje elementu z propsami dokumentu.
  const element = createElement(ReportPdf, { data }) as unknown as ReactElement<DocumentProps>;
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
