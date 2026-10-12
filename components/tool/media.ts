'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Telefon albo ekran dotykowy: przyciski na całą szerokość, cele dotyku 48 px, bez przeciągania pliku. */
export const PHONE_QUERY = '(pointer: coarse), (max-width: 767px)';
/** Od 1024 px edytor ma podgląd raportu na żywo obok formularza (brand/docs/5-ekrany.md). */
export const WIDE_QUERY = '(min-width: 1024px)';

function canMatch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/**
 * Zapytanie o media jako zewnętrzny magazyn. Na serwerze i przy hydratacji zwraca `serverValue`
 * (mobile-first: telefon), potem prawdziwą wartość — bez rozjazdu markupu przy hydratacji.
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatch()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = () => (canMatch() ? window.matchMedia(query).matches : serverValue);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue);
}

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY, true);
}

export function useIsWide(): boolean {
  return useMediaQuery(WIDE_QUERY, false);
}
