'use client';

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass';
import { Icon, type IconName } from './Icon';

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: IconName;
  /** Trwa działanie: spinner przed tekstem i aria-busy. Kliknięcia są ignorowane. */
  busy?: boolean;
  /**
   * Niedostępny przycisk: aria-disabled="true" (nigdy natywne disabled), żeby był osiągalny z klawiatury
   * i mógł wyjaśnić, czego brakuje. Wyjaśnienie podaj przez aria-describedby albo Tooltip.
   */
  unavailable?: boolean;
  /** Wywoływane przy kliknięciu niedostępnego przycisku (np. otwarcie panelu z wyjaśnieniem). */
  onUnavailableClick?: () => void;
  children: ReactNode;
};

type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> & { href?: undefined };
type AsLink = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export type ButtonProps = AsButton | AsLink;

export function Button(props: ButtonProps) {
  const {
    variant,
    size = 'm',
    block,
    icon,
    busy,
    unavailable,
    onUnavailableClick,
    children,
    className,
    ...rest
  } = props;
  const cls = buttonClass({ variant, size, block, className });
  const content = (
    <>
      {busy ? (
        <span className="sd-btn__spin" aria-hidden="true" />
      ) : (
        icon && <Icon name={icon} size={size === 's' ? 's' : 'm'} />
      )}
      {children}
    </>
  );

  const guard = <E extends MouseEvent>(event: E, handler?: (e: E) => void) => {
    if (unavailable || busy) {
      event.preventDefault();
      if (unavailable) onUnavailableClick?.();
      return;
    }
    handler?.(event);
  };

  if (rest.href !== undefined) {
    const { href, onClick, ...anchor } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
    return (
      <Link
        href={href}
        className={cls}
        aria-disabled={unavailable || undefined}
        aria-busy={busy || undefined}
        onClick={(e) => guard(e, onClick)}
        {...anchor}
      >
        {content}
      </Link>
    );
  }

  const { onClick, type = 'button', ...button } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      type={type}
      className={cls}
      aria-disabled={unavailable || undefined}
      aria-busy={busy || undefined}
      onClick={(e) => guard(e, onClick)}
      {...button}
    >
      {content}
    </button>
  );
}
