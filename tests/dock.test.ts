import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import http from 'node:http';
import { DOCK_URL } from '../src/lib/help';

const require = createRequire(import.meta.url);
const { createDock, parseCommand, DOCK_PORT } = require('../electron/dock.cjs');

function request(port: number, opts: { method?: string; path: string; host?: string; headers?: Record<string, string>; body?: unknown }) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: opts.path, method: opts.method ?? 'GET', headers: { Host: opts.host ?? `127.0.0.1:${port}`, ...opts.headers } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

async function startDock(over: Record<string, unknown> = {}) {
  const sent: unknown[] = [];
  let opened = 0;
  const dock = createDock({
    port: 0,
    getState: () => ({ timerState: 'idle', minutes: 5, seconds: 0 }),
    sendCommand: (c: unknown) => (sent.push(c), true),
    openWindow: () => opened++,
    ...over,
  });
  const st = await dock.start();
  cleanup.push(() => dock.stop());
  return { dock, port: st.port as number, sent, opened: () => opened };
}

describe('dock command parsing', () => {
  it('accepts the actions and validates their numbers', () => {
    expect(parseCommand({ action: 'pause' })).toEqual({ action: 'pause' });
    expect(parseCommand({ action: 'setTime', minutes: 7, seconds: 30 })).toEqual({ action: 'setTime', minutes: 7, seconds: 30 });
    expect(parseCommand({ action: 'start', minutes: 1, seconds: 0 })).toEqual({ action: 'start', minutes: 1, seconds: 0 });
    expect(parseCommand({ action: 'start' })).toEqual({ action: 'start' });
    expect(parseCommand({ action: 'startAt', time: '18:30' })).toEqual({ action: 'startAt', time: '18:30' });
  });

  it('rejects anything else', () => {
    expect(parseCommand(null)).toBeNull();
    expect(parseCommand({ action: 'format-disk' })).toBeNull();
    expect(parseCommand({ action: 'setTime' })).toBeNull(); // needs minutes + seconds
    expect(parseCommand({ action: 'setTime', minutes: 100, seconds: 0 })).toBeNull();
    expect(parseCommand({ action: 'setTime', minutes: 1, seconds: 60 })).toBeNull();
    expect(parseCommand({ action: 'setTime', minutes: '5', seconds: 0 })).toBeNull();
    expect(parseCommand({ action: 'startAt', time: '25:00' })).toBeNull();
    expect(parseCommand({ action: 'startAt', time: '18:5' })).toBeNull();
    expect(parseCommand({ action: 'startAt' })).toBeNull();
  });
});

describe('dock server', () => {
  it('is the address the Help guide tells people to paste into OBS', () => {
    expect(DOCK_URL).toBe(`http://127.0.0.1:${DOCK_PORT}/dock`);
  });

  it('serves the dock page and the state (with the server clock)', async () => {
    const { port } = await startDock();
    const page = await request(port, { path: '/dock' });
    expect(page.status).toBe(200);
    expect(page.body).toContain('Stage Countdown');
    const state = JSON.parse((await request(port, { path: '/api/state' })).body);
    expect(state).toMatchObject({ timerState: 'idle', minutes: 5 });
    expect(typeof state.now).toBe('number');
  });

  it('relays a valid command from the dock to the app window', async () => {
    const { port, sent } = await startDock();
    const res = await request(port, { method: 'POST', path: '/api/command', headers: { 'X-Stage-Dock': '1' }, body: { action: 'setTime', minutes: 3, seconds: 15 } });
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(sent).toEqual([{ action: 'setTime', minutes: 3, seconds: 15 }]);
  });

  it('refuses commands without the dock header (other websites cannot send it)', async () => {
    const { port, sent } = await startDock();
    expect((await request(port, { method: 'POST', path: '/api/command', body: { action: 'stop' } })).status).toBe(403);
    expect((await request(port, { method: 'POST', path: '/api/open' })).status).toBe(403);
    expect(sent).toEqual([]);
  });

  it('refuses requests addressed to another host name (DNS rebinding)', async () => {
    const { port } = await startDock();
    expect((await request(port, { path: '/api/state', host: 'evil.example.com' })).status).toBe(403);
    expect((await request(port, { path: '/dock', host: `evil.example.com:${port}` })).status).toBe(403);
  });

  it('rejects bad commands and reports a missing app window', async () => {
    const { port } = await startDock();
    const bad = await request(port, { method: 'POST', path: '/api/command', headers: { 'X-Stage-Dock': '1' }, body: { action: 'nope' } });
    expect(bad.status).toBe(400);
    const junk = await request(port, { method: 'POST', path: '/api/command', headers: { 'X-Stage-Dock': '1' }, body: '{not json' });
    expect(junk.status).toBe(400);

    const gone = await startDock({ sendCommand: () => false });
    const res = await request(gone.port, { method: 'POST', path: '/api/command', headers: { 'X-Stage-Dock': '1' }, body: { action: 'pause' } });
    expect(JSON.parse(res.body).ok).toBe(false);
  });

  it('opens the app window on request and stops cleanly', async () => {
    const { dock, port, opened } = await startDock();
    await request(port, { method: 'POST', path: '/api/open', headers: { 'X-Stage-Dock': '1' } });
    expect(opened()).toBe(1);
    dock.stop();
    expect(dock.status().running).toBe(false);
    await expect(request(port, { path: '/dock' })).rejects.toBeTruthy();
  });

  it('reports a busy port instead of crashing', async () => {
    const first = await startDock();
    const second = createDock({ port: first.port, getState: () => ({}), sendCommand: () => true, openWindow: () => {} });
    const st = await second.start();
    expect(st.running).toBe(false);
    expect(st.error).toMatch(/already in use/);
  });
});
