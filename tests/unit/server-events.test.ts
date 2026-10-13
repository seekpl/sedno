import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const inserted: unknown[] = [];
let failing = false;
vi.mock('@/lib/server/store', () => ({
  getStore: () => ({
    insertEvent: async (row: unknown) => {
      if (failing) throw new Error('awaria');
      inserted.push(row);
    },
  }),
}));

const { recordServerEvent } = await import('@/lib/server/server-events');

afterEach(() => {
  inserted.length = 0;
  failing = false;
});

describe('zdarzenia zapisywane przez serwer', () => {
  it('zapisuje zdarzenie ze ścisłym schematem i właścicielem, bez identyfikatora sesji', async () => {
    await recordServerEvent('link_created', {}, '00000000-0000-0000-0000-000000000001');
    expect(inserted).toEqual([
      { name: 'link_created', anonId: null, ownerId: '00000000-0000-0000-0000-000000000001', props: {} },
    ]);
  });

  it('odrzuca właściwości spoza schematu (np. token linku)', async () => {
    await recordServerEvent('link_opened', { token: 'abc' } as never);
    expect(inserted).toEqual([]);
  });

  it('awaria magazynu nie przerywa akcji', async () => {
    failing = true;
    await expect(recordServerEvent('link_opened', {})).resolves.toBeUndefined();
  });
});
