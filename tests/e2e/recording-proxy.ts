/**
 * Proxy HTTP nagrywające każde żądanie przeglądarki — także z Web Workerów, których ruchu Playwright
 * nie pokazuje w zdarzeniach `request` ani w `route()` (sprawdzone na 1.56). Przeglądarka uruchomiona
 * z tym proxy (bez wyjątku dla adresów lokalnych) nie wyśle niczego poza nim.
 */
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';

export type ProxiedRequest = { method: string; url: string; body: Buffer };

export async function startRecordingProxy() {
  const requests: ProxiedRequest[] = [];
  /** Próby połączeń szyfrowanych (CONNECT) — każda oznacza ruch poza aplikację. */
  const tunnels: string[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = req.url ?? '';
      requests.push({ method: req.method ?? 'GET', url, body });
      const target = new URL(url);
      const upstream = http.request(
        {
          hostname: target.hostname,
          port: target.port,
          path: target.pathname + target.search,
          method: req.method,
          headers: req.headers,
        },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      upstream.end(body);
    });
  });

  server.on('connect', (req, socket: net.Socket) => {
    tunnels.push(req.url ?? '');
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server: `http://127.0.0.1:${port}`,
    requests,
    tunnels,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
