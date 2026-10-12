/**
 * Uruchomienie parsera z komponentów klienta. Domyślnie w Web Workerze; gdy worker nie działa
 * (brak wsparcia, błąd ładowania), parsujemy w wątku głównym przez import dynamiczny — plik
 * nadal nie opuszcza przeglądarki. PapaParse ładuje się wyłącznie dynamicznie (CLAUDE.md §15).
 */
import { checkFileMeta } from './decode';
import type { ColumnMapping, ParseResult, WorkerRequest, WorkerResponse } from './types';

export type ParseFileOptions = {
  mapping?: ColumnMapping;
  onProgress?: (done: number, total: number) => void;
};

export type ParseFileResult = { result: ParseResult; ms: number };

/** Parsowanie w wątku głównym (zapasowe). */
async function parseOnMainThread(file: File, opts: ParseFileOptions): Promise<ParseFileResult> {
  const started = performance.now();
  const [{ parseExport }, bytes] = await Promise.all([import('./parse'), file.arrayBuffer()]);
  const result = parseExport(
    { bytes, fileName: file.name, mimeType: file.type },
    { mapping: opts.mapping, onProgress: opts.onProgress },
  );
  return { result, ms: Math.round(performance.now() - started) };
}

export function parseFileInWorker(file: File, opts: ParseFileOptions = {}): Promise<ParseFileResult> {
  // Nazwa, typ i rozmiar sprawdzamy, zanim ktokolwiek przeczyta plik do pamięci.
  const metaError = checkFileMeta({ fileName: file.name, mimeType: file.type, size: file.size });
  if (metaError) return Promise.resolve({ result: { ok: false, error: metaError }, ms: 0 });

  return new Promise<ParseFileResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    } catch {
      parseOnMainThread(file, opts).then(resolve, reject);
      return;
    }

    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      parseOnMainThread(file, opts).then(resolve, reject);
    };

    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      if (settled) return;
      const message = event.data;
      if (message.type === 'progress') {
        opts.onProgress?.(message.done, message.total);
      } else if (message.type === 'result') {
        settled = true;
        worker.terminate();
        resolve({ result: message.result, ms: message.ms });
      }
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      fallback();
    });
    worker.addEventListener('messageerror', fallback);

    const request: WorkerRequest = { type: 'parse', file, mapping: opts.mapping };
    try {
      worker.postMessage(request);
    } catch {
      fallback();
    }
  });
}
