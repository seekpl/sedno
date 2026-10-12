/**
 * Web Worker parsera (PROMPT.md §5). Plik czytamy i parsujemy tutaj, poza wątkiem interfejsu.
 * Worker nie wykonuje żadnych żądań sieciowych — plik nigdy nie opuszcza przeglądarki (zasada 1).
 */
import { checkFileMeta } from './decode';
import { parseExport } from './parse';
import type { WorkerRequest, WorkerResponse } from './types';

/** Minimalny typ zakresu workera (tsconfig ma lib „dom”, bez „webworker”). */
type WorkerScope = {
  postMessage(message: WorkerResponse): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
};

const ctx = self as unknown as WorkerScope;

async function handle(request: WorkerRequest): Promise<void> {
  const started = performance.now();
  const { file, mapping } = request;
  const elapsed = () => Math.round(performance.now() - started);

  // Nazwa, typ i rozmiar przed odczytem: nie czytamy do pamięci pliku, który i tak odrzucimy.
  const metaError = checkFileMeta({ fileName: file.name, mimeType: file.type, size: file.size });
  if (metaError) {
    ctx.postMessage({ type: 'result', result: { ok: false, error: metaError }, ms: elapsed() });
    return;
  }

  const bytes = await file.arrayBuffer();
  const result = parseExport(
    { bytes, fileName: file.name, mimeType: file.type },
    { mapping, onProgress: (done, total) => ctx.postMessage({ type: 'progress', done, total }) },
  );
  ctx.postMessage({ type: 'result', result, ms: elapsed() });
}

ctx.addEventListener('message', (event) => {
  const request = event.data;
  if (request?.type !== 'parse') return;
  handle(request).catch((error: unknown) => {
    // Nieoczekiwany wyjątek przekazujemy jako zdarzenie „error” workera — klient przełączy się
    // wtedy na parsowanie w wątku głównym.
    setTimeout(() => {
      throw error;
    });
  });
});
