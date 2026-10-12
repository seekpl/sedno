/**
 * Raport dla klienta w PDF (PROMPT.md §11): A4 pionowo, marginesy 40/44 pt, układ arkusza A4
 * z brand/reference/screens/EkranRaport.html. Ten sam model widoku co HTML (lib/report/format.ts).
 * Kolory wyłącznie z tokenów (lib/brand/tokens.generated.ts), fonty z lib/pdf/fonts.ts.
 * Moduł importuje @react-pdf/renderer, więc ładujemy go tylko dynamicznie (lib/pdf/download.ts).
 * Biblioteka nie tworzy PDF tagowanego — dostępną wersją raportu jest link (docs/decisions.md).
 */
import { Document, Page, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import { circledPath } from '@/lib/brand/svg.generated';
import { tokens } from '@/lib/brand/tokens.generated';
import { common } from '@/lib/copy/common';
import { PDF_FONT, PDF_WEIGHT } from '@/lib/pdf/fonts';
import {
  KEY_TRACKING_EM,
  numberWidthEm,
  reportView,
  type MetricView,
  type ReportView,
} from '@/lib/report/format';
import type { ReportData } from '@/lib/report/types';
import { PdfIcon, PdfLogo } from './PdfSvg';

const color = {
  paper: tokens.colors.light.reportPaper,
  ink: tokens.colors.light.reportInk,
  secondary: tokens.colors.light.reportInkSecondary,
  line: tokens.colors.light.reportLine,
  pen: tokens.colors.light.reportPen,
  previous: tokens.colors.light.reportPrevious,
  marker: tokens.colors.light.marker,
};

const px = (value: string) => Number.parseFloat(value);
const space = (key: keyof typeof tokens.space) => px(tokens.space[key]);

/** Rozmiar i interlinia jak w CSS („14px/20px”); 1 px makiety = 1 pt arkusza A4 (595 × 842). */
const type = (size: number, line: number) => ({ fontSize: size, lineHeight: line / size });

/** Cyfry tabelaryczne i nautyczne, jak klasa sd-num. */
const TABULAR = ['tnum', 'lnum'] as const;

/** Kluczowa liczba: .sd-key__value (72/72, −0,02 em) i .sd-circled z brand/components.css. */
const KEY_SIZE = 72;
const CIRCLED = { padTop: 0.08, padX: 0.28, padBottom: 0.02, inset: 0.12, grow: 0.22, stroke: 3.2 } as const;

/**
 * Bricolage (hhea): wznoszenie 0,93 em, zejście 0,27 em. Przeglądarka przy line-height 1 dzieli ujemną
 * interlinię po równo, więc linia bazowa stoi 0,83 em od góry wiersza; react-pdf stawia ją zawsze
 * na wysokości wznoszenia (0,93 em). Bez korekty cyfry w PDF siedzą 0,1 em niżej niż w HTML
 * i dolna krawędź pętli przecina ich dół. Przesuwamy tylko rysowanie tekstu, nie wymiary pola.
 */
const DISPLAY_ASCENT = 0.93;
const DISPLAY_DESCENT = 0.27;
const KEY_BASELINE_SHIFT = (DISPLAY_ASCENT + DISPLAY_DESCENT - 1) / 2;

/** Szerokość treści A4 (595,28 pt minus marginesy 44 pt) i kolumny kluczowej liczby (1,2fr z 1,2fr + 1fr, odstęp 24). */
const CONTENT_WIDTH = 595.28 - 2 * 44;
const KEY_COLUMN = ((CONTENT_WIDTH - 24) * 1.2) / 2.2;

/** Szacowana szerokość tekstu z liczbami w pt (szerokości znaków Bricolage z lib/report/format.ts). */
export function estimateWidth(text: string, size: number, tracking = 0): number {
  return numberWidthEm(text, tracking) * size;
}

/**
 * Stopień kluczowej liczby: 72 pt, mniej dla długich liczb, żeby liczba z pętlą (wcięcia .28 em z obu
 * stron i .1 em pętli w prawo) zmieściła się w swojej kolumnie i nie weszła na pozostałe liczby.
 */
export function keyFontSize(valueEm: number): number {
  return Math.min(KEY_SIZE, Math.floor((KEY_COLUMN / (valueEm + 2 * CIRCLED.padX + 0.1)) * 10) / 10);
}

/** Ścieżka pętli (viewBox 100 × 100, same polecenia M/L) przeskalowana do pola w pt — kreska bez zniekształceń. */
export function scaleCircledPath(width: number, height: number, d: string = circledPath): string {
  const sx = width / 100;
  const sy = height / 100;
  return d.replace(
    /([ML])\s*(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/g,
    (_, cmd: string, x: string, y: string) =>
      `${cmd}${(Number(x) * sx).toFixed(2)} ${(Number(y) * sy).toFixed(2)}`,
  );
}

const s = StyleSheet.create({
  page: {
    paddingVertical: 40,
    paddingHorizontal: 44,
    backgroundColor: color.paper,
    color: color.ink,
    fontFamily: PDF_FONT.text,
    fontWeight: PDF_WEIGHT.regular,
    ...type(16, 24),
    display: 'flex',
    flexDirection: 'column',
  },
  // Odstęp między blokami arkusza (gap: 22px w makiecie). Marginesy zamiast gap na stronie: react-pdf przy
  // dzieleniu na strony nie uwzględnia gap i spychał stopkę na drugą stronę.
  // 18 zamiast 22: przy pełnej treści (przypis o metrykach, niepełny miesiąc, trzy efekty) raport musi się
  // zmieścić na jednej stronie A4 — przy 22 przechodził na drugą (docs/decisions.md).
  block: { marginTop: 18 }, // ref: brand/reference/screens/EkranRaport.html (PDF A4, gap 22)
  secondary: { color: color.secondary },
  num: { fontFamily: PDF_FONT.display, fontWeight: PDF_WEIGHT.medium, fontFeatureSettings: [...TABULAR] },
  hr: { borderTopWidth: 1, borderTopColor: color.line, borderTopStyle: 'solid' },

  brand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space('space3'),
  },
  // Nazwa i klient zajmują resztę wiersza obok miesiąca (flexBasis 0). Sam flexShrink nie wystarcza:
  // react-pdf łamał wtedy tekst na pełną szerokość strony i długa nazwa (do 80 znaków) wchodziła
  // na miesiąc i zakres dat albo za prawy margines.
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  avatar: {
    width: 40,
    flexShrink: 0,
    height: 40,
    borderRadius: px(tokens.radius.radiusS),
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: PDF_FONT.display,
    fontWeight: PDF_WEIGHT.bold,
    fontSize: 13,
    lineHeight: 1,
    color: color.paper,
  },
  authorText: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  authorName: { fontWeight: PDF_WEIGHT.bold, ...type(16, 24) },
  client: { color: color.secondary, ...type(13, 24) },
  period: { flexShrink: 0, alignItems: 'flex-end', color: color.secondary, ...type(13, 24) },

  intro: { color: color.secondary, ...type(14, 20) },
  title: {
    marginTop: space('space1'),
    fontFamily: PDF_FONT.display,
    fontWeight: PDF_WEIGHT.bold,
    letterSpacing: -0.26,
    ...type(26, 32),
  },

  numbers: { flexDirection: 'row', alignItems: 'flex-end', gap: space('space5') },
  key: { flexGrow: 1.2, flexBasis: 0, gap: space('space2') },
  metrics: { flexGrow: 1, flexBasis: 0, gap: 14 },
  metricsCompact: { flexGrow: 1, flexBasis: 0, gap: space('space2') },
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space('space3'),
  },
  metric: { gap: space('space1') },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space('space2') },
  keyLabel: { color: color.secondary, ...type(16, 24) },
  metricLabel: { color: color.secondary, ...type(14, 20) },
  circled: { position: 'relative', alignSelf: 'flex-start' },
  ring: { position: 'absolute' },
  keyValue: {
    fontFamily: PDF_FONT.display,
    fontWeight: PDF_WEIGHT.bold,
    lineHeight: 1,
    fontFeatureSettings: [...TABULAR],
    textAlign: 'center',
  },
  metricValue: {
    fontFamily: PDF_FONT.display,
    fontWeight: PDF_WEIGHT.semibold,
    fontFeatureSettings: [...TABULAR],
    ...type(26, 30),
  },
  compactValue: {
    fontFamily: PDF_FONT.display,
    fontWeight: PDF_WEIGHT.semibold,
    fontFeatureSettings: [...TABULAR],
    ...type(20, 24),
  },
  delta: {
    color: color.secondary,
    fontFamily: PDF_FONT.display,
    fontWeight: PDF_WEIGHT.medium,
    fontFeatureSettings: [...TABULAR],
    ...type(14, 20),
  },

  // Tekst sekcji 6 pt pod nagłówkiem (gap: 6px w makiecie A4).
  prose: { marginTop: 6 }, // ref: brand/reference/screens/EkranRaport.html (PDF A4)
  heading: { fontFamily: PDF_FONT.display, fontWeight: PDF_WEIGHT.semibold, ...type(17, 24) },
  text: { ...type(14, 20) },
  mark: { backgroundColor: color.marker },

  reach: { gap: space('space2') },
  bars: { gap: space('space2') },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space('space2'), ...type(14, 20) },
  // Kolumna etykiet: 7,5 em z .sd-r-bar, poszerzona do 8 em, żeby „Nowi obserwujący” (110 pt) mieścił się w linii.
  barLabel: { width: 8 * 14 },
  track: { flexGrow: 1, flexBasis: 0 },
  // Słupek .sd-r-bar i z brand/components.css: wysokość 10, zaokrąglenie 3.
  fill: { height: 10, borderRadius: 3 },
  // Kolumna liczb jednakowej szerokości we wszystkich wierszach (tory słupków równej długości), do lewej.
  barValue: { textAlign: 'left' },

  // Odstęp rośnie, żeby przypisy stały u dołu strony (margin-top: auto w makiecie).
  spacer: { flexGrow: 1, minHeight: 14 },
  foot: { gap: space('space1') },
  footText: { color: color.secondary, ...type(12, 16) },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

function Label({ metric, size, style }: { metric: MetricView; size: number; style: typeof s.keyLabel }) {
  return (
    <View style={s.labelRow}>
      <PdfIcon name={metric.icon} size={size} color={color.secondary} />
      <Text style={style}>{metric.label}</Text>
    </View>
  );
}

function Delta({ metric }: { metric: MetricView }) {
  return (
    <Text style={s.delta}>
      {metric.delta}
      {metric.change ? ` ${metric.change}` : ''}
    </Text>
  );
}

/** Kluczowa liczba w pętli długopisu — jedyne zakreślenie w raporcie. */
function CircledValue({ value, valueEm }: { value: string; valueEm: number }) {
  const size = keyFontSize(valueEm);
  const boxWidth = (valueEm + 2 * CIRCLED.padX) * size;
  const boxHeight = size * (1 + CIRCLED.padTop + CIRCLED.padBottom);
  const ringWidth = boxWidth + CIRCLED.grow * size;
  const ringHeight = boxHeight + CIRCLED.grow * size;
  return (
    // Bez stałej wysokości: react-pdf pomija wiersz, który choćby o ułamek punktu nie mieści się w polu.
    <View style={[s.circled, { width: boxWidth }]}>
      <Svg
        style={[
          s.ring,
          { top: -CIRCLED.inset * size, left: -CIRCLED.inset * size, width: ringWidth, height: ringHeight },
        ]}
        viewBox={`0 0 ${ringWidth.toFixed(2)} ${ringHeight.toFixed(2)}`}
      >
        <Path
          d={scaleCircledPath(ringWidth, ringHeight)}
          stroke={color.pen}
          strokeWidth={CIRCLED.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      <Text
        style={[
          s.keyValue,
          {
            fontSize: size,
            letterSpacing: KEY_TRACKING_EM * size,
            paddingTop: CIRCLED.padTop * size,
            paddingBottom: CIRCLED.padBottom * size,
            position: 'relative',
            top: -KEY_BASELINE_SHIFT * size,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Sekcja tekstowa jako dwa elementy strony (nie jeden View): tylko wtedy react-pdf przenosi nagłówek
 * na następną stronę razem z tekstem (minPresenceAhead), zamiast zostawić go samego u dołu.
 */
function Prose({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Text style={[s.block, s.heading]} minPresenceAhead={42}>
        {title}
      </Text>
      <Text style={[s.text, s.prose]}>{children}</Text>
    </>
  );
}

function Reach({ view }: { view: ReportView }) {
  const valueWidth = Math.max(
    ...view.reach.map((row) => estimateWidth(row.change ? `${row.value} ${row.change}` : row.value, 14)),
  );
  return (
    <View style={[s.block, s.reach]} wrap={false}>
      <Text style={s.heading}>{view.sections.reach}</Text>
      <View style={s.bars}>
        {view.reach.map((row, i) => (
          <View key={i} style={s.bar}>
            <Text style={[s.barLabel, ...(row.previous ? [s.secondary] : [])]}>{row.label}</Text>
            <View style={s.track}>
              <View
                style={[
                  s.fill,
                  {
                    width: `${row.widthPercent}%`,
                    backgroundColor: row.previous ? color.previous : color.pen,
                  },
                ]}
              />
            </View>
            <Text style={[s.num, s.barValue, { width: valueWidth }, ...(row.previous ? [s.secondary] : [])]}>
              {row.value}
              {row.change ? <Text style={s.secondary}>{` ${row.change}`}</Text> : null}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ReportPdf({ data }: { data: ReportData }) {
  const view = reportView(data);
  const threeMetrics = view.metrics.length === 3;
  return (
    <Document
      title={view.documentTitle}
      author={view.author.name || undefined}
      language="pl"
      creator={common.ui.logo}
      producer={common.ui.logo}
    >
      <Page size="A4" style={s.page}>
        {/* 1. Marka autora, klient, miesiąc i zakres dat */}
        <View style={s.brand}>
          <View style={s.author}>
            {view.author.initials ? (
              <View style={s.avatar}>
                <Text style={s.avatarText}>{view.author.initials}</Text>
              </View>
            ) : null}
            <View style={s.authorText}>
              {view.author.name ? <Text style={s.authorName}>{view.author.name}</Text> : null}
              <Text style={s.client}>{view.forClientLong}</Text>
            </View>
          </View>
          <View style={s.period}>
            <Text>{view.monthLabel}</Text>
            <Text style={s.num}>{view.dateRangeShort}</Text>
          </View>
        </View>
        <View style={[s.block, s.hr]} />

        {/* 2. Tytuł */}
        <View style={s.block} wrap={false}>
          <Text style={s.intro}>{view.intro}</Text>
          <Text style={s.title}>{view.headline}</Text>
        </View>

        {/* 3–4. Kluczowa liczba z zakreśleniem i pozostałe liczby efektów. Gdy kluczowe są wyświetlenia,
            trzy efekty idą w zwartych wierszach (etykieta i liczba w jednej linii) — pełne bloki wypchnęłyby
            plan na drugą stronę A4. */}
        <View style={[s.block, s.numbers]} wrap={false}>
          <View style={s.key}>
            <Label metric={view.key} size={16} style={s.keyLabel} />
            <CircledValue value={view.key.value} valueEm={view.keyValueEm} />
            <Delta metric={view.key} />
          </View>
          <View style={threeMetrics ? s.metricsCompact : s.metrics}>
            {view.metrics.map((m) =>
              threeMetrics ? (
                <View key={m.key} style={s.metric}>
                  <View style={s.compactRow}>
                    <Label metric={m} size={16} style={s.metricLabel} />
                    <Text style={s.compactValue}>{m.value}</Text>
                  </View>
                  <Delta metric={m} />
                </View>
              ) : (
                <View key={m.key} style={s.metric}>
                  <Label metric={m} size={16} style={s.metricLabel} />
                  <Text style={s.metricValue}>{m.value}</Text>
                  <Delta metric={m} />
                </View>
              ),
            )}
          </View>
        </View>

        {/* 5. Co zadziałało — najwyżej jeden fragment w zakreślaczu */}
        {view.worked ? (
          <Prose title={view.sections.worked}>
            {view.worked.map((segment, i) =>
              segment.marked ? (
                <Text key={i} style={s.mark}>
                  {segment.text}
                </Text>
              ) : (
                segment.text
              ),
            )}
          </Prose>
        ) : null}

        {/* 6. Zasięg */}
        <Reach view={view} />

        {/* 7. Plan na kolejny miesiąc */}
        {view.plan ? <Prose title={view.sections.plan}>{view.plan}</Prose> : null}

        {/* 8–9. Przypisy i stopka */}
        <View style={s.spacer} />
        <View style={s.foot} wrap={false}>
          <View style={s.hr} />
          <Text style={[s.footText, { marginTop: space('space2') }]}>{view.footnotes.join(' ')}</Text>
          {view.showSednoFooter ? (
            <View style={s.footer}>
              <Text style={s.footText}>{view.footer}</Text>
              <PdfLogo height={12} />
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
