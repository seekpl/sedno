/**
 * Liczba całkowita ≥ 0 wpisana przez człowieka: „23”, „1 234”, „1 234” (twarda spacja).
 * Puste pole to null (brak danych), a nie 0. Zwraca 'invalid' dla czegokolwiek innego.
 */
export function parseCount(raw: string): number | null | 'invalid' {
  const compact = raw.replace(/[\s  ]/g, '');
  if (compact === '') return null;
  if (!/^\d{1,9}$/.test(compact)) return 'invalid';
  return Number(compact);
}
