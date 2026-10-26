import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';

const require = createRequire(import.meta.url);
const { createObs } = require('../electron/obs.cjs');
const { chooseFadeTransition, sealSecret, openSecret } = require('../electron/logic.cjs');

/** A minimal obs-websocket v5 (JSON, no password) that records every request it gets. */
function fakeObs(opts: { studioMode?: boolean; program?: string; transition?: string } = {}) {
  const calls: { type: string; data?: Record<string, unknown> }[] = [];
  const state = {
    program: opts.program ?? 'Camera',
    transition: opts.transition ?? 'Cut',
    durations: { Cut: 0, Fade: 300 } as Record<string, number>,
    studio: !!opts.studioMode,
  };
  const transitions = [
    { transitionName: 'Cut', transitionKind: 'cut_transition', transitionFixed: true },
    { transitionName: 'Fade', transitionKind: 'fade_transition', transitionFixed: false },
  ];
  const wss = new WebSocketServer({
    port: 0,
    handleProtocols: (p) => (p.has('obswebsocket.json') ? 'obswebsocket.json' : false),
  });
  const handle = (type: string, data: Record<string, unknown> = {}): Record<string, unknown> | null => {
    switch (type) {
      case 'GetSceneList':
        return {
          currentProgramSceneName: state.program,
          scenes: [{ sceneName: 'Other', sceneIndex: 2 }, { sceneName: 'Media', sceneIndex: 1 }, { sceneName: 'Camera', sceneIndex: 0 }],
        };
      case 'GetStudioModeEnabled':
        return { studioModeEnabled: state.studio };
      case 'GetCurrentProgramScene':
        return { currentProgramSceneName: state.program };
      case 'GetCurrentSceneTransition':
        return { transitionName: state.transition, transitionDuration: state.durations[state.transition], transitionFixed: state.transition === 'Cut' };
      case 'GetSceneTransitionList':
        return { currentSceneTransitionName: state.transition, transitions };
      case 'SetCurrentSceneTransition':
        state.transition = String(data.transitionName);
        return {};
      case 'SetCurrentSceneTransitionDuration':
        state.durations[state.transition] = Number(data.transitionDuration);
        return {};
      case 'SetCurrentProgramScene':
        state.program = String(data.sceneName);
        return {};
      case 'SetCurrentPreviewScene':
      case 'TriggerStudioModeTransition':
        return {};
      default:
        return null;
    }
  };
  wss.on('connection', (ws: WebSocket) => {
    ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1 } }));
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.op === 1) ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      if (msg.op === 6) {
        const { requestType, requestId, requestData } = msg.d;
        calls.push({ type: requestType, data: requestData });
        const res = handle(requestType, requestData);
        ws.send(
          JSON.stringify({
            op: 7,
            d: { requestType, requestId, requestStatus: { result: !!res, code: res ? 100 : 204 }, responseData: res ?? undefined },
          })
        );
      }
    });
  });
  const port = () => (wss.address() as AddressInfo).port;
  return { wss, calls, state, port, close: () => new Promise<void>((r) => { wss.clients.forEach((c) => c.terminate()); wss.close(() => r()); }) };
}

const until = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

async function connected(server: ReturnType<typeof fakeObs>, extra = {}) {
  const obs = createObs({ retryMs: 100 });
  cleanup.push(() => obs.dispose());
  obs.configure({ enabled: true, port: server.port(), password: '', mediaScene: 'Media', cameraScene: 'Camera', ...extra });
  await until(() => obs.status().state === 'connected' && obs.status().scenes.length > 0);
  return obs;
}

describe('OBS link', () => {
  it('detects OBS, reports its version and lists scenes in OBS order', async () => {
    const server = fakeObs();
    cleanup.push(server.close);
    const obs = await connected(server);
    expect(obs.status()).toMatchObject({ state: 'connected', version: '5.5.0', scenes: ['Camera', 'Media', 'Other'] });
  });

  it('is idle when disabled (never opens a connection)', async () => {
    const server = fakeObs();
    cleanup.push(server.close);
    const obs = createObs({ retryMs: 50 });
    cleanup.push(() => obs.dispose());
    obs.configure({ enabled: false, port: server.port() });
    await new Promise((r) => setTimeout(r, 200));
    expect(obs.status().state).toBe('off');
    expect(server.wss.clients.size).toBe(0);
  });

  it('keeps looking while OBS is closed and connects as soon as it opens', async () => {
    const probe = fakeObs();
    const port = probe.port();
    await probe.close();
    const obs = createObs({ retryMs: 80 });
    cleanup.push(() => obs.dispose());
    obs.configure({ enabled: true, port, password: '' });
    await until(() => obs.status().state === 'searching');
    const wss = new WebSocketServer({ port, handleProtocols: (p) => (p.has('obswebsocket.json') ? 'obswebsocket.json' : false) });
    cleanup.push(() => new Promise<void>((r) => { wss.clients.forEach((c) => c.terminate()); wss.close(() => r()); }));
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1 } }));
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        if (m.op === 1) ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        if (m.op === 6)
          ws.send(JSON.stringify({ op: 7, d: { requestType: m.d.requestType, requestId: m.d.requestId, requestStatus: { result: true, code: 100 }, responseData: { scenes: [{ sceneName: 'A', sceneIndex: 0 }] } } }));
      });
    });
    await until(() => obs.status().state === 'connected');
    expect(obs.status().scenes).toEqual(['A']);
  });

  it('fades to the media scene over the requested time, then restores the operator\'s transition', async () => {
    const server = fakeObs({ transition: 'Cut' });
    cleanup.push(server.close);
    const obs = await connected(server);
    server.calls.length = 0;

    const result = await obs.switchTo('media', 120);
    expect(result).toEqual({ ok: true });
    const writes = server.calls.filter((c) => c.type.startsWith('Set')).map((c) => [c.type, ...Object.values(c.data ?? {})]);
    expect(writes).toEqual([
      ['SetCurrentSceneTransition', 'Fade'],
      ['SetCurrentSceneTransitionDuration', 120],
      ['SetCurrentProgramScene', 'Media'],
    ]);
    expect(server.state.program).toBe('Media');

    await until(() => server.state.transition === 'Cut'); // restored after the fade
    expect(server.state.durations.Fade).toBe(300); // the operator's own Fade timing is untouched
  });

  it('uses preview + Transition in Studio Mode', async () => {
    const server = fakeObs({ studioMode: true, transition: 'Fade' });
    cleanup.push(server.close);
    const obs = await connected(server);
    server.calls.length = 0;
    await obs.switchTo('camera', 100);
    const types = server.calls.map((c) => c.type);
    expect(types).toContain('SetCurrentPreviewScene');
    expect(types).toContain('TriggerStudioModeTransition');
    expect(types).not.toContain('SetCurrentProgramScene');
  });

  it('does nothing when OBS is already on that scene', async () => {
    const server = fakeObs({ program: 'Camera' });
    cleanup.push(server.close);
    const obs = await connected(server);
    server.calls.length = 0;
    expect(await obs.switchTo('camera', 100)).toEqual({ ok: true, alreadyThere: true });
    expect(server.calls.some((c) => c.type.startsWith('Set'))).toBe(false);
  });

  it('skips (without failing) when no scene is chosen, and reports a scene that vanished', async () => {
    const server = fakeObs();
    cleanup.push(server.close);
    const obs = await connected(server, { mediaScene: '' });
    expect(await obs.switchTo('media', 100)).toMatchObject({ ok: false, skipped: true });
    obs.configure({ mediaScene: 'Deleted' });
    expect(await obs.switchTo('media', 100)).toMatchObject({ ok: false, error: expect.stringContaining('Deleted') });
  });

  it('puts OBS back on the camera when the app closes mid-countdown', async () => {
    const server = fakeObs();
    cleanup.push(server.close);
    const obs = await connected(server);
    await obs.switchTo('media', 50);
    await obs.restoreCameraIfNeeded(50);
    expect(server.state.program).toBe('Camera');
  });
});

describe('helpers', () => {
  it('chooseFadeTransition prefers Fade, then any fade, then a non-fixed one', () => {
    const fade = { transitionName: 'Fade', transitionKind: 'fade_transition', transitionFixed: false };
    const cut = { transitionName: 'Cut', transitionKind: 'cut_transition', transitionFixed: true };
    const swipe = { transitionName: 'Swipe', transitionKind: 'swipe_transition', transitionFixed: false };
    expect(chooseFadeTransition([cut, swipe, fade])).toBe(fade);
    expect(chooseFadeTransition([cut, { ...fade, transitionName: 'Soft' }])?.transitionName).toBe('Soft');
    expect(chooseFadeTransition([cut, swipe])).toBe(swipe);
    expect(chooseFadeTransition([cut])).toBeNull();
    expect(chooseFadeTransition(undefined)).toBeNull();
  });

  it('seals and opens a password round trip (with and without OS encryption)', () => {
    const fake = {
      encryptString: (s: string) => Buffer.from(s.split('').reverse().join('')),
      decryptString: (b: Buffer) => b.toString().split('').reverse().join(''),
    };
    expect(openSecret(sealSecret('hunter2', fake), fake)).toBe('hunter2');
    expect(openSecret(sealSecret('hunter2', null), null)).toBe('hunter2');
    expect(sealSecret('', fake)).toBe('');
    expect(openSecret('enc:garbage', null)).toBe('');
  });
});
