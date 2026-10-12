import { describe, expect, it } from 'vitest';
import { csv } from '@/lib/copy/csv';

describe('teksty ostrzeżeń pliku', () => {
  it('W_INCOMPLETE_MONTH odmienia dni', () => {
    const body = csv.warnings.W_INCOMPLETE_MONTH.body;
    expect(body('sierpniem', 1, 31)).toContain('obejmie 1 dzień, nie 31.');
    expect(body('sierpniem', 2, 31)).toContain('obejmie 2 dni, nie 31.');
    expect(body('sierpniem', 27, 30)).toContain('obejmie 27 dni, nie 30.');
  });
});
