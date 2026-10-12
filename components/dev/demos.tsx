'use client';

/**
 * Dema komponentów z tą samą treścią co brand/reference/components/<Nazwa>.html.
 * Służą do porównania zrzutów 1:1 na /dev/komponenty/<nazwa>. Dane są przykładowe.
 */
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { AppNav } from '@/components/ui/AppNav';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Circled } from '@/components/ui/Circled';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileChip } from '@/components/ui/FileChip';
import { Icon } from '@/components/ui/Icon';
import { KeyNumber } from '@/components/ui/KeyNumber';
import { Logo } from '@/components/ui/Logo';
import { Mark } from '@/components/ui/Mark';
import { Metric } from '@/components/ui/Metric';
import { Modal, ModalDialog } from '@/components/ui/Modal';
import { MonthSwitcher } from '@/components/ui/MonthSwitcher';
import { NumberField } from '@/components/ui/NumberField';
import { Pagination } from '@/components/ui/Pagination';
import { Progress } from '@/components/ui/Progress';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { ToastView, useToast } from '@/components/ui/Toast';
import { Tooltip, TooltipBubble } from '@/components/ui/Tooltip';
import { Upload } from '@/components/ui/Upload';
import { iconNodes, type IconName } from '@/lib/brand/svg.generated';
import type { DemoSlug } from './registry';
import s from './demos.module.css';

const noop = () => {};

function ButtonDemo() {
  return (
    <div className={s.wrap}>
      <div className="sd-row">
        <Button variant="primary">Utwórz raport</Button>
        <Button>Podgląd</Button>
        <Button variant="ghost" icon="copy">
          Kopiuj link
        </Button>
        <Button variant="danger">Usuń klienta</Button>
      </div>
      <div className="sd-row">
        <Button variant="primary" size="l" icon="download">
          Pobierz PDF
        </Button>
        <Button size="s">Edytuj</Button>
        <Button variant="primary" unavailable>
          Wyślij klientowi
        </Button>
        <Button variant="primary" busy>
          Tworzę raport
        </Button>
      </div>
    </div>
  );
}

function BadgeDemo() {
  return (
    <div className={`${s.wrap} ${s.center}`}>
      <StatusBadge status="draft" />
      <StatusBadge status="ready" />
      <StatusBadge status="sent" />
      <StatusBadge status="no-export" />
      <StatusBadge status="file-error" />
      <Badge variant="plan">Solo</Badge>
    </div>
  );
}

function KeyNumberDemo() {
  return (
    <div className={`${s.wrap} ${s.stretch}`}>
      <KeyNumber
        className={`sd-card ${s.keyCard}`}
        icon="booking"
        label="Kliknięcia „Zarezerwuj”"
        value="23"
        delta="we wrześniu · sierpień: 17"
      />
      <div className={`sd-card ${s.metricsCard}`}>
        <Metric icon="phone" label="Zadzwoń" value="9" delta="sierpień: 11" />
        <Metric icon="route" label="Wyznacz trasę" value="14" delta="sierpień: 10" />
        <Metric icon="eye" label="Wyświetlenia" value="12 480" delta="+9% m/m" />
        <Metric icon="client" label="Nowi obserwujący" value="64" delta="sierpień: 51" />
      </div>
    </div>
  );
}

function EmptyStateDemo() {
  return (
    <div className={s.pad}>
      <EmptyState
        title="Dodaj pierwszego klienta"
        actions={
          <>
            <Button variant="primary" icon="plus">
              Dodaj klienta
            </Button>
            <Link className="sd-link" href="/przyklad">
              Zobacz przykładowy raport
            </Link>
          </>
        }
      >
        Klient to jeden profil na Instagramie. Raporty, historia miesięcy i logo zapisują się przy nim.
      </EmptyState>
    </div>
  );
}

function AlertDemo() {
  return (
    <div className={`${s.wrap} ${s.alerts}`}>
      <Alert title="Meta zmieniła sposób liczenia wyświetleń">
        W kwietniu 2025 r. metrykę Impressions zastąpiły Views. Miesiące sprzed zmiany nie są wprost
        porównywalne, więc raport dodaje przypis dla klienta.
      </Alert>
      <Alert
        variant="success"
        title="Raport dla Studio Lumi jest gotowy"
        actions={
          <>
            <Button variant="primary" size="s" icon="copy">
              Kopiuj link
            </Button>
            <Button size="s" icon="download">
              Pobierz PDF
            </Button>
          </>
        }
      >
        Wyślij link albo pobierz PDF.
      </Alert>
      <Alert variant="warning" title="Brakuje danych za 3 dni">
        Eksport kończy się 27 września. Porównanie z sierpniem obejmie więc 27 dni, nie 30. Możesz wgrać pełny
        plik albo zostawić przypis w raporcie.
      </Alert>
      <Alert variant="error" title="Nie udało się wczytać pliku">
        Plik jest pusty lub zapisany w innym formacie niż CSV. Pobierz eksport ponownie i wgraj go bez
        otwierania w Excelu.
      </Alert>
    </div>
  );
}

function ModalDemo() {
  return (
    <div className={`sd-scrim ${s.scrim}`}>
      <ModalDialog
        title="Usunąć klienta Bistro Pod Lipą?"
        actions={
          <>
            <Button>Zostaw klienta</Button>
            <Button variant="danger">Usuń klienta i raporty</Button>
          </>
        }
      >
        Usuniesz też 7 raportów i ich linki. Klient, który ma link, zobaczy komunikat, że raport nie jest już
        dostępny.
      </ModalDialog>
    </div>
  );
}

function ToastDemo() {
  return (
    <div className={`${s.wrap} ${s.grid}`}>
      <ToastView message="Link skopiowany" action={{ label: 'Otwórz', onClick: noop }} />
      <ToastView
        message="Nie wysłano. Brak połączenia."
        variant="error"
        action={{ label: 'Ponów', onClick: noop }}
      />
    </div>
  );
}

function TextFieldDemo() {
  const [book, setBook] = useState<number | null>(23);
  return (
    <div className={`${s.wrap} ${s.fields}`}>
      <NumberField
        label="Kliknięcia „Zarezerwuj”"
        value={book}
        onChange={setBook}
        hint="Panel profesjonalny → Statystyki → Kontakty, wrzesień."
        invalidMessage="Wpisz liczbę cyframi, np. 9."
      />
      <TextField
        multiline
        label="Co zrobiliśmy w tym miesiącu"
        placeholder="np. 8 rolek z metamorfoz, nowy wyróżniony relacji „Cennik”"
      />
      <TextField
        label="Kliknięcia „Zadzwoń”"
        className="sd-input--num"
        inputMode="numeric"
        defaultValue="dziewięć"
        error="Wpisz liczbę cyframi, np. 9."
      />
    </div>
  );
}

function UploadDemo() {
  return (
    <div className={`${s.wrap} ${s.uploads}`}>
      <Upload
        title="Wgraj eksport z Meta Business Suite"
        hint="Plik CSV z sekcji Statystyki → Treści. Przeciągnij go tutaj albo wybierz z dysku."
        buttonLabel="Wybierz plik"
        onFile={noop}
      >
        <p className="sd-privacy">
          <Icon name="lock" size="s" />
          Plik zostaje w Twojej przeglądarce.
        </p>
      </Upload>
      <Upload
        title="Wgraj eksport z Meta Business Suite"
        overTitle="Upuść plik, żeby go wczytać"
        overHint="Jeden plik CSV naraz."
        buttonLabel="Wybierz plik"
        onFile={noop}
        previewOver
      />
      <div className="sd-card sd-stack">
        <FileChip name="Studio-Lumi-posty-wrzesien-2026.csv" size="48 KB" />
        <Alert variant="success" title="Wczytano 31 publikacji z września">
          Okres 1–30 września 2026. Teraz dopisz trzy liczby z panelu profesjonalnego.
        </Alert>
      </div>
      <Upload
        title="Wgraj eksport z Meta Business Suite"
        buttonLabel="Wybierz plik"
        onFile={noop}
        error={{
          title: 'To nie jest eksport treści',
          hint: 'W pliku brakuje kolumny „Wyświetlenia”. Pobierz eksport z zakładki Treści, nie z Odbiorców.',
          retryLabel: null,
          action: <Button>Pokaż, jak pobrać eksport</Button>,
        }}
      />
    </div>
  );
}

function TooltipDemo() {
  return (
    <div className={s.pad}>
      <TooltipBubble>
        Wyświetlenia liczą każde pokazanie treści, także wielokrotne tej samej osobie.
      </TooltipBubble>
    </div>
  );
}

function AppNavDemo() {
  const [month, setMonth] = useState('2026-09');
  return (
    <>
      <AppNav
        homeHref="#"
        items={[
          { href: '#klienci', label: 'Klienci', current: true },
          { href: '#raporty', label: 'Raporty' },
          { href: '#ustawienia', label: 'Ustawienia' },
        ]}
        right={<MonthSwitcher month={month} onChange={setMonth} />}
        desktopExtras={<Badge variant="plan">Solo</Badge>}
      />
      <div className={`sd-muted ${s.note}`}>
        Na telefonie: logo, przełącznik miesiąca i przycisk <Icon name="menu" size="s" /> menu otwierający
        listę sekcji.
      </div>
    </>
  );
}

type ClientRow = {
  id: string;
  initials: string;
  name: string;
  book: number | null;
  call: number | null;
  views: number | null;
  status: 'sent' | 'ready' | 'no-export';
  action: string;
};

const CLIENT_ROWS: ClientRow[] = [
  {
    id: 'sl',
    initials: 'SL',
    name: 'Studio Lumi',
    book: 23,
    call: 9,
    views: 12480,
    status: 'sent',
    action: 'Otwórz',
  },
  {
    id: 'bl',
    initials: 'BL',
    name: 'Bistro Pod Lipą',
    book: 41,
    call: 17,
    views: 8320,
    status: 'ready',
    action: 'Wyślij',
  },
  {
    id: 'fr',
    initials: 'FR',
    name: 'Fizjo Ruch',
    book: null,
    call: null,
    views: null,
    status: 'no-export',
    action: 'Wgraj',
  },
];

function DataTableDemo() {
  return (
    <div className={s.pad}>
      <DataTable<ClientRow>
        caption="Klienci we wrześniu"
        rows={CLIENT_ROWS}
        rowKey={(r) => r.id}
        selectedKey="bl"
        columns={[
          {
            key: 'client',
            header: 'Klient',
            render: (r) => (
              <div className="sd-client">
                <span className="sd-avatar" aria-hidden="true">
                  {r.initials}
                </span>
                {r.name}
              </div>
            ),
          },
          { key: 'book', header: 'Zarezerwuj', numeric: true, value: (r) => r.book },
          { key: 'call', header: 'Zadzwoń', numeric: true, value: (r) => r.call },
          { key: 'views', header: 'Wyświetlenia', numeric: true, value: (r) => r.views },
          { key: 'status', header: 'Wrzesień', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            header: 'Działania',
            headerHidden: true,
            render: (r) => (
              <Button variant="ghost" size="s">
                {r.action}
              </Button>
            ),
          },
        ]}
      />
      <p className={`sd-muted ${s.caption}`}>Dane przykładowe.</p>
    </div>
  );
}

function PaginationDemo() {
  return (
    <div className={s.pad}>
      <Pagination page={2} pageCount={8} hrefFor={(p) => `#strona-${p}`} label="Strony historii" />
    </div>
  );
}

function CircledDemo() {
  return (
    <div className={`${s.wrap} ${s.circled}`}>
      <span className={s.circledHero}>
        <Circled>23</Circled>
      </span>
      <span className={s.circledSmall}>
        <Circled>9</Circled>
      </span>
      <p className={s.circledText}>
        We wrześniu <Mark>23 osoby kliknęły „Zarezerwuj”</Mark> — o sześć więcej niż w sierpniu.
      </p>
    </div>
  );
}

function SkeletonDemo() {
  return (
    <div className={s.skeleton}>
      <div className={`sd-card ${s.skeletonCard}`}>
        <Skeleton height={14} width="40%" />
        <Skeleton height={56} width="30%" />
        <Skeleton height={14} width="60%" />
      </div>
      <div className={s.progress}>
        <span className="body-s">Czytam plik: 31 z 31 publikacji</span>
        <Progress value={100} label="Wczytywanie pliku" />
      </div>
    </div>
  );
}

const DEMOS: Record<DemoSlug, () => ReactNode> = {
  button: ButtonDemo,
  badge: BadgeDemo,
  keynumber: KeyNumberDemo,
  emptystate: EmptyStateDemo,
  alert: AlertDemo,
  modal: ModalDemo,
  toast: ToastDemo,
  textfield: TextFieldDemo,
  upload: UploadDemo,
  tooltip: TooltipDemo,
  appnav: AppNavDemo,
  datatable: DataTableDemo,
  pagination: PaginationDemo,
  circled: CircledDemo,
  skeleton: SkeletonDemo,
};

export function ReferenceDemo({ slug }: { slug: DemoSlug }) {
  const Demo = DEMOS[slug];
  return <Demo />;
}

/** Komponenty bez osobnej makiety i zachowania interaktywne (do sprawdzenia ręcznie i w testach). */
export function ExtraDemos() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState('2026-09');
  const [value, setValue] = useState<number | null>(null);
  const toast = useToast();
  return (
    <div className={s.extras}>
      <section className={s.section} aria-labelledby="ikony">
        <h2 id="ikony" className="heading-3">
          Icon
        </h2>
        <ul className={s.icons}>
          {(Object.keys(iconNodes) as IconName[]).map((name) => (
            <li key={name} className={s.iconItem}>
              <Icon name={name} size="l" />
              <span className="caption">{name}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className={s.section} aria-labelledby="logo">
        <h2 id="logo" className="heading-3">
          Logo
        </h2>
        <div className="sd-row">
          <Logo height={28} />
          <Logo height={24} variant="mono-ink" />
          <span className={s.onDark}>
            <Logo height={24} variant="on-dark" />
          </span>
          <span className={s.onPen}>
            <Logo height={24} variant="mono-white" />
          </span>
          <Logo height={12} />
        </div>
      </section>
      <section className={s.section} aria-labelledby="zachowanie">
        <h2 id="zachowanie" className="heading-3">
          Zachowanie
        </h2>
        <div className="sd-row">
          <Button variant="danger" onClick={() => setOpen(true)}>
            Usuń klienta
          </Button>
          <Button
            onClick={() =>
              toast({ message: 'Raport dla Studio Lumi wysłany', action: { label: 'Cofnij', onClick: noop } })
            }
          >
            Pokaż powiadomienie
          </Button>
          <Tooltip content="Link do raportu wymaga konta.">
            {(id) => (
              <Button variant="primary" unavailable aria-describedby={id}>
                Utwórz link
              </Button>
            )}
          </Tooltip>
          <MonthSwitcher month={month} onChange={setMonth} max="2026-10" />
        </div>
        <NumberField
          label="Kliknięcia „Wyznacz trasę”"
          value={value}
          onChange={setValue}
          placeholder="np. 14"
          hint={`Wartość: ${value ?? '—'}`}
          invalidMessage="Wpisz liczbę cyframi, np. 9."
        />
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Usunąć klienta Bistro Pod Lipą?"
          actions={
            <>
              <Button onClick={() => setOpen(false)}>Zostaw klienta</Button>
              <Button variant="danger" onClick={() => setOpen(false)}>
                Usuń klienta i raporty
              </Button>
            </>
          }
        >
          Usuniesz też 7 raportów i ich linki. Klient, który ma link, zobaczy komunikat, że raport nie jest
          już dostępny.
        </Modal>
      </section>
    </div>
  );
}
