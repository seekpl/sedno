/**
 * Web Worker parsera i klient (lib/csv/worker.ts, lib/csv/client.ts). W Node nie ma Workera, więc
 * zakres workera i konstruktor Worker podstawiamy atrapami; ścieżka zapasowa działa naprawdę.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseFileInWorker } from '@/lib/csv/client';
import { parseExport } from '@/lib/csv/parse';
import { LIMITS, type WorkerRequest, type WorkerResponse } from '@/lib/csv/types';
import { FIXTURES_DIR } from '@/scripts/make-fixtures';

function fixtureFile(name: string, type = 'text/csv'): File {
  return new File([fs.readFileSync(path.join(FIXTURES_DIR, name))], name, { type });
}

function bigCsv(rows: number): File {
  const text = 'Czas publikacji;Wyświetlenia;Zasięg\n' + '2026-09-01 10:00;1;1\n'.repeat(rows);
  return new File([text], 'duzy.csv', { type: 'text/csv' });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('worker.ts', () => {
  async function loadWorker() {
    let listener: ((event: MessageEvent<WorkerRequest>) => void) | undefined;
    const messages: WorkerResponse[] = [];
    let resolveResult: (m: WorkerResponse) => void = () => {};
    const result = new Promise<WorkerResponse>((resolve) => (resolveResult = resolve));
    vi.stubGlobal('self', {
      addEventListener: (type: string, fn: (event: MessageEvent<WorkerRequest>) => void) => {
        if (type === 'message') listener = fn;
      },
      postMessage: (message: WorkerResponse) => {
        messages.push(message);
        if (message.type === 'result') resolveResult(message);
      },
    });
    vi.resetModules();
    await import('@/lib/csv/worker');
    const send = (request: WorkerRequest) => listener!({ data: request } as MessageEvent<WorkerRequest>);
    return { send, messages, result };
  }

  it('czyta plik, raportuje postęp i odsyła wynik z czasem', async () => {
    const { send, messages, result } = await loadWorker();
    send({ type: 'parse', file: bigCsv(1200) });
    const final = await result;
    expect(final).toMatchObject({ type: 'result', result: { ok: true } });
    expect(final.type === 'result' && typeof final.ms === 'number').toBe(true);
    expect(messages.filter((m) => m.type === 'progress')).toEqual([
      { type: 'progress', done: 500, total: 1200 },
      { type: 'progress', done: 1000, total: 1200 },
      { type: 'progress', done: 1200, total: 1200 },
    ]);
  });

  it('stosuje mapowanie ręczne', async () => {
    const { send, result } = await loadWorker();
    send({
      type: 'parse',
      file: fixtureFile('synthetic-unknown-headers.csv'),
      mapping: { Kiedy: 'publishedAt', 'Ile razy obejrzano': 'views' },
    });
    const final = await result;
    expect(final.type === 'result' && final.result.ok && final.result.data.rows.length).toBe(6);
  });

  it('odrzuca plik po nazwie i rozmiarze, zanim go przeczyta', async () => {
    const { send, result } = await loadWorker();
    const file = fixtureFile('synthetic-not-csv.txt', 'text/plain');
    const read = vi.spyOn(file, 'arrayBuffer');
    send({ type: 'parse', file });
    expect(await result).toMatchObject({
      type: 'result',
      result: { ok: false, error: { code: 'E_NOT_CSV' } },
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('ignoruje obce wiadomości', async () => {
    const { send, messages } = await loadWorker();
    send({ type: 'inna' } as unknown as WorkerRequest);
    await new Promise((r) => setTimeout(r, 10));
    expect(messages).toEqual([]);
  });
});

type Listener = (event: { data?: unknown; preventDefault?: () => void }) => void;

/** Atrapa Workera: przetwarza żądanie jak worker.ts (albo zgłasza błąd). */
function fakeWorker(mode: 'ok' | 'error') {
  const created: { url: string; options: unknown }[] = [];
  let terminated = 0;
  class FakeWorker {
    private listeners = new Map<string, Listener[]>();
    constructor(url: URL, options: unknown) {
      created.push({ url: String(url), options });
    }
    addEventListener(type: string, fn: Listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    emit(type: string, event: { data?: unknown; preventDefault?: () => void }) {
      for (const fn of this.listeners.get(type) ?? []) fn(event);
    }
    postMessage(request: WorkerRequest) {
      setTimeout(async () => {
        if (mode === 'error') {
          this.emit('error', { preventDefault: () => {} });
          return;
        }
        const bytes = await request.file.arrayBuffer();
        const result = parseExport(
          { bytes, fileName: request.file.name, mimeType: request.file.type },
          {
            mapping: request.mapping,
            onProgress: (done, total) => this.emit('message', { data: { type: 'progress', done, total } }),
          },
        );
        this.emit('message', { data: { type: 'result', result, ms: 7 } });
      });
    }
    terminate() {
      terminated++;
    }
  }
  vi.stubGlobal('Worker', FakeWorker);
  return { created, terminated: () => terminated };
}

describe('parseFileInWorker', () => {
  it('uruchamia worker modułowy, przekazuje postęp i kończy go po wyniku', async () => {
    const fake = fakeWorker('ok');
    const onProgress = vi.fn();
    const { result, ms } = await parseFileInWorker(fixtureFile('synthetic-pl-semicolon-bom.csv'), {
      onProgress,
    });
    expect(result.ok && result.data.rows.length).toBe(59);
    expect(ms).toBe(7);
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]!.url).toMatch(/worker\.ts$/);
    expect(fake.created[0]!.options).toEqual({ type: 'module' });
    expect(onProgress).toHaveBeenLastCalledWith(59, 59);
    expect(fake.terminated()).toBe(1);
  });

  it('błąd workera → parsowanie w wątku głównym', async () => {
    const fake = fakeWorker('error');
    const { result } = await parseFileInWorker(fixtureFile('synthetic-en-comma.csv'));
    expect(result.ok && result.data.rows.length).toBe(20);
    expect(fake.terminated()).toBe(1);
  });

  it('brak Workera w środowisku → parsowanie w wątku głównym z postępem', async () => {
    vi.stubGlobal('Worker', undefined);
    const onProgress = vi.fn();
    const { result, ms } = await parseFileInWorker(bigCsv(600), { onProgress });
    expect(result.ok && result.data.rows.length).toBe(600);
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(onProgress.mock.calls).toEqual([
      [500, 600],
      [600, 600],
    ]);
  });

  it('mapowanie ręczne dociera do parsera', async () => {
    fakeWorker('ok');
    const { result } = await parseFileInWorker(fixtureFile('synthetic-unknown-headers.csv'), {
      mapping: { Kiedy: 'publishedAt', 'Ile razy obejrzano': 'views' },
    });
    expect(result.ok).toBe(true);
  });

  it('za duży plik albo nie-CSV: wynik od razu, bez Workera i bez czytania pliku', async () => {
    const fake = fakeWorker('ok');
    const tooBig = { name: 'duzy.csv', type: 'text/csv', size: LIMITS.maxBytes + 1 } as File;
    expect(await parseFileInWorker(tooBig)).toEqual({
      result: { ok: false, error: { code: 'E_TOO_BIG', reason: 'size' } },
      ms: 0,
    });
    const pdf = { name: 'raport.pdf', type: 'application/pdf', size: 10 } as File;
    expect((await parseFileInWorker(pdf)).result).toEqual({ ok: false, error: { code: 'E_NOT_CSV' } });
    expect(fake.created).toHaveLength(0);
  });
});
