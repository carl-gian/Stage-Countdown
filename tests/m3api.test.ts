import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const require = createRequire(import.meta.url);
const { createM3Api } = require('../electron/m3api.cjs');

let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

/** A fake M3 (TLC Edition) /api/media-display endpoint. Returns the port and what it received. */
async function fakeM3Tlc(state = 'shown') {
  const got: { method?: string; header?: string; body?: string }[] = [];
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      got.push({ method: req.method, header: req.headers['x-m3-dock'] as string, body });
      if (req.url !== '/api/media-display') return void res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.method === 'GET') return void res.end(JSON.stringify({ state, visible: state === 'shown' }));
      res.end(JSON.stringify({ ok: req.headers['x-m3-dock'] === '1' }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return { port: (server!.address() as AddressInfo).port, got };
}

describe('M3 (TLC Edition) API client', () => {
  it('reads the media display state', async () => {
    const { port } = await fakeM3Tlc('hidden');
    expect(await createM3Api({ port }).state()).toBe('hidden');
  });

  it('asks M3 to show or hide it, with the header M3 requires', async () => {
    const { port, got } = await fakeM3Tlc();
    expect(await createM3Api({ port }).set(false)).toBe(true);
    expect(got[0]).toMatchObject({ method: 'POST', header: '1', body: '{"visible":false}' });
  });

  it('answers null/false quickly when nothing is listening (official M3)', async () => {
    const { port } = await fakeM3Tlc();
    server!.close();
    server = null;
    const api = createM3Api({ port, timeoutMs: 300 });
    const t0 = Date.now();
    expect(await api.state()).toBeNull();
    expect(await api.set(true)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
