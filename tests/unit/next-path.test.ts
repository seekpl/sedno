import { describe, expect, it } from 'vitest';
import { AFTER_LOGIN_PATH, safeNextPath } from '@/lib/auth/next-path';

describe('ścieżka powrotu po zalogowaniu', () => {
  it('przepuszcza ścieżki /app z parametrami', () => {
    expect(safeNextPath('/app/klienci?m=2026-09')).toBe('/app/klienci?m=2026-09');
    expect(safeNextPath('/app')).toBe('/app');
    expect(safeNextPath('/app/klienci/abc/2026-09#krok-3')).toBe('/app/klienci/abc/2026-09#krok-3');
  });

  it('odrzuca wszystko inne, także próby przekierowania na inny host', () => {
    for (const value of [
      null,
      undefined,
      '',
      'https://zly.example/app',
      '//zly.example/app',
      '/app//zly.example',
      '/app\\zly',
      '/application',
      '/r/abc',
      '/app/\u0000x',
      'javascript:alert(1)',
    ]) {
      expect(safeNextPath(value)).toBe(AFTER_LOGIN_PATH);
    }
  });
});
