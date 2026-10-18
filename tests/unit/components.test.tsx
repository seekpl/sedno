// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBadge, STATUS_BADGES } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { NumberField } from '@/components/ui/NumberField';
import { pageItems } from '@/components/ui/Pagination';
import { parseCount } from '@/lib/parse-count';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe('Button', () => {
  it('niedostępny przycisk ma aria-disabled, nie natywne disabled, i nie wywołuje onClick', () => {
    const onClick = vi.fn();
    const onUnavailable = vi.fn();
    render(
      <Button unavailable onClick={onClick} onUnavailableClick={onUnavailable}>
        Wyślij klientowi
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Wyślij klientowi' });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledOnce();
  });

  it('zajęty przycisk ma spinner i aria-busy', () => {
    render(
      <Button variant="primary" busy>
        Tworzę raport
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Tworzę raport' });
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.querySelector('.sd-btn__spin')).not.toBeNull();
    expect(btn.className).toBe('sd-btn sd-btn--primary');
  });

  it('nakłada wyłącznie klasy sd-*', () => {
    render(
      <Button variant="ghost" size="s" block>
        Edytuj
      </Button>,
    );
    expect(screen.getByRole('button').className).toBe('sd-btn sd-btn--ghost sd-btn--s sd-btn--block');
  });
});

describe('Icon', () => {
  it('bez etykiety jest dekoracyjna', () => {
    const { container } = render(<Icon name="phone" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('z etykietą ma role="img" i aria-label', () => {
    render(<Icon name="menu" label="Menu" />);
    expect(screen.getByRole('img', { name: 'Menu' })).toBeTruthy();
  });
});

describe('StatusBadge', () => {
  it.each(Object.keys(STATUS_BADGES) as (keyof typeof STATUS_BADGES)[])('%s ma ikonę i słowo', (status) => {
    const { container } = render(<StatusBadge status={status} />);
    const badge = container.querySelector('.sd-badge')!;
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(badge.textContent).toBe(STATUS_BADGES[status].label);
  });
});

describe('NumberField', () => {
  function Harness({ onValue }: { onValue: (v: number | null) => void }) {
    const [value, setValue] = useState<number | null>(null);
    return (
      <NumberField
        label="Kliknięcia „Zadzwoń”"
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
        hint="Panel profesjonalny"
        invalidMessage="Wpisz liczbę cyframi, np. 9."
      />
    );
  }

  it('ma etykietę nad polem, inputmode numeric i podpowiedź przez aria-describedby', () => {
    render(<Harness onValue={() => {}} />);
    const input = screen.getByLabelText('Kliknięcia „Zadzwoń”');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    const describedBy = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)?.textContent).toBe('Panel profesjonalny');
  });

  it('przekazuje liczbę, pusty wpis jako null, a błędny wpis pokazuje błąd powiązany z polem', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText('Kliknięcia „Zadzwoń”');
    fireEvent.change(input, { target: { value: '1 234' } });
    expect(onValue).toHaveBeenLastCalledWith(1234);
    fireEvent.change(input, { target: { value: '' } });
    expect(onValue).toHaveBeenLastCalledWith(null);
    fireEvent.change(input, { target: { value: 'dziewięć' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(
      'Wpisz liczbę cyframi, np. 9.',
    );
    expect(onValue).toHaveBeenCalledTimes(2);
  });
});

describe('parseCount', () => {
  it.each([
    ['23', 23],
    [' 1 234 ', 1234],
    ['1 234', 1234],
    ['', null],
    ['   ', null],
    ['-3', 'invalid'],
    ['2,5', 'invalid'],
    ['dziewięć', 'invalid'],
  ] as const)('„%s” → %s', (raw, expected) => {
    expect(parseCount(raw)).toBe(expected);
  });
});

describe('Modal', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Usuń klienta</button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Usunąć klienta?"
          actions={
            <>
              <button onClick={() => setOpen(false)}>Zostaw klienta</button>
              <button>Usuń klienta i raporty</button>
            </>
          }
        >
          Usuniesz też raporty.
        </Modal>
      </>
    );
  }

  it('przenosi fokus do okna, trzyma go w środku, zamyka się Esc i oddaje fokus', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Usuń klienta' });
    opener.focus();
    act(() => opener.click());
    const dialog = screen.getByRole('dialog', { name: 'Usunąć klienta?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Treść okna opisuje je dla czytników ekranu (ostrzeżenie słychać razem z tytułem).
    const described = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe('Usuniesz też raporty.');
    const first = screen.getByRole('button', { name: 'Zostaw klienta' });
    const last = screen.getByRole('button', { name: 'Usuń klienta i raporty' });
    expect(document.activeElement).toBe(first);

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('DataTable', () => {
  it('brak danych pokazuje „—”, nie 0', () => {
    const { container } = render(
      <DataTable<{ id: string; v: number | null }>
        caption="Klienci"
        rows={[
          { id: 'a', v: null },
          { id: 'b', v: 0 },
        ]}
        rowKey={(r) => r.id}
        columns={[
          { key: 'id', header: 'Klient', render: (r) => r.id },
          { key: 'v', header: 'Zadzwoń', numeric: true, value: (r) => r.v },
        ]}
      />,
    );
    const cells = [...container.querySelectorAll('td.num')].map((td) => td.textContent);
    expect(cells).toEqual(['—', '0']);
  });
});

describe('pageItems', () => {
  it('jak na makiecie Pagination: 1 [2] 3 … 8', () => {
    expect(pageItems(2, 8)).toEqual([1, 2, 3, 'gap', 8]);
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(5, 9)).toEqual([1, 'gap', 4, 5, 6, 'gap', 9]);
  });
});
