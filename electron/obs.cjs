// Optional OBS Studio link (obs-websocket v5, always on this PC). No Electron imports, so it is testable.
//
// Purpose: OBS feeds Zoom. When the countdown starts, OBS fades to the "Media Display" scene (which shows
// the timer on the stage display) and when it ends fades back to the "Camera" scene, so Zoom participants
// see the timer without anyone switching scenes by hand.
const { OBSWebSocket } = require('obs-websocket-js/json');
const { chooseFadeTransition } = require('./logic.cjs');

const RETRY_MS = 4000;
const CONNECT_TIMEOUT_MS = 4000;
const REQUEST_TIMEOUT_MS = 5000;
const AUTH_FAILED_CODE = 4009;

function withTimeout(promise, ms, what) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out: ${what}`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * @param {object} deps
 * @param {(msg: string, ...rest: unknown[]) => void} [deps.log]
 * @param {(status: object) => void} [deps.onStatus] called whenever the public status changes
 * @param {number} [deps.retryMs]
 */
function createObs({ log = () => {}, onStatus = () => {}, retryMs = RETRY_MS } = {}) {
  let settings = { enabled: false, port: 4455, password: '', mediaScene: '', cameraScene: '' };
  let ws = null;
  let state = 'off'; // off | searching | connecting | connected | auth-failed | error
  let error = '';
  let version = '';
  let scenes = [];
  let retryTimer = null;
  let generation = 0; // bumps on every (re)configure so stale connection attempts are ignored
  let lastKind = null; // 'media' | 'camera': what we last switched OBS to
  let queue = Promise.resolve();
  let saved = null; // the user's own transition, restored after our fade
  let restoreTimer = null;

  const status = () => ({
    enabled: settings.enabled,
    state,
    port: settings.port,
    hasPassword: !!settings.password,
    scenes,
    mediaScene: settings.mediaScene,
    cameraScene: settings.cameraScene,
    version,
    error,
  });

  const publish = () => onStatus(status());

  const setState = (next, message = '') => {
    state = next;
    error = message;
    publish();
  };

  const call = (type, data) => {
    if (!ws || state !== 'connected') return Promise.reject(new Error('Not connected to OBS'));
    return withTimeout(ws.call(type, data), REQUEST_TIMEOUT_MS, type);
  };

  const sceneNames = (list) => (list.scenes || []).map((s) => s.sceneName).reverse(); // OBS lists bottom-up

  async function refreshScenes() {
    scenes = sceneNames(await call('GetSceneList'));
    publish();
  }

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry() {
    clearRetry();
    if (!settings.enabled || state === 'auth-failed') return;
    const gen = generation;
    retryTimer = setTimeout(() => {
      if (gen === generation) connect();
    }, retryMs);
  }

  function dropSocket() {
    const old = ws;
    ws = null;
    if (old) {
      old.removeAllListeners?.();
      old.disconnect().catch(() => {});
    }
  }

  async function connect() {
    clearRetry();
    if (!settings.enabled || state === 'connecting' || state === 'connected') return;
    const gen = generation;
    setState('connecting');
    const client = new OBSWebSocket();
    try {
      const hello = await withTimeout(
        client.connect(`ws://127.0.0.1:${settings.port}`, settings.password || undefined, { rpcVersion: 1 }),
        CONNECT_TIMEOUT_MS,
        'connect'
      );
      if (gen !== generation) {
        client.disconnect().catch(() => {});
        return;
      }
      ws = client;
      version = hello?.obsWebSocketVersion || '';
      client.on('ConnectionClosed', () => {
        if (ws !== client) return;
        ws = null;
        log('[obs] connection closed');
        setState('searching');
        scheduleRetry();
      });
      client.on('SceneListChanged', () => refreshScenes().catch(() => {}));
      // "Connected" only once the scenes are known, so the UI never shows a connected OBS with an empty list.
      scenes = sceneNames(await withTimeout(client.call('GetSceneList'), REQUEST_TIMEOUT_MS, 'GetSceneList'));
      if (gen !== generation || ws !== client) return;
      setState('connected');
      log('[obs] connected', { port: settings.port, version });
    } catch (err) {
      client.disconnect().catch(() => {});
      if (gen !== generation) return;
      if (ws === client) ws = null;
      if (err && err.code === AUTH_FAILED_CODE) {
        setState('auth-failed', 'Wrong WebSocket password');
        return; // don't hammer OBS with a wrong password; retry when settings change
      }
      const refused = err && (err.code === 'ECONNREFUSED' || err.code === 1006 || /ECONNREFUSED|Timed out/i.test(String(err.message)));
      scenes = [];
      setState(refused ? 'searching' : 'error', refused ? '' : String(err?.message || err));
      scheduleRetry();
    }
  }

  /** Applies new settings. Reconnects only if the connection details changed (or `force`). */
  function configure(next, { force = false } = {}) {
    const differs = (k) => k in next && next[k] !== settings[k];
    const changedConn = differs('port') || differs('password') || differs('enabled');
    settings = { ...settings, ...next };
    if (changedConn || force) {
      generation++;
      clearRetry();
      dropSocket();
      scenes = [];
      version = '';
      if (!settings.enabled) {
        setState('off');
        return;
      }
      state = 'searching';
      connect();
    } else {
      publish();
    }
  }

  /** Re-detects OBS now (e.g. the user started OBS after the app). */
  function refresh() {
    configure({}, { force: true });
  }

  /** Where `kind`'s scene is, or why we can't switch (null = fine). */
  function resolveScene(kind) {
    if (!settings.enabled) return { skip: 'OBS scene switching is off' };
    if (state !== 'connected') return { skip: 'OBS is not connected' };
    const scene = kind === 'media' ? settings.mediaScene : settings.cameraScene;
    if (!scene) return { skip: `No ${kind === 'media' ? 'Media Display' : 'Camera'} scene chosen` };
    if (!scenes.includes(scene)) return { error: `Scene "${scene}" no longer exists in OBS` };
    return { scene };
  }

  async function doSwitch(kind, fadeMs) {
    const target = resolveScene(kind);
    if (target.skip) return { ok: false, skipped: true, error: target.skip };
    if (target.error) return { ok: false, error: target.error };

    try {
      const [{ studioModeEnabled }, current, list, program] = await Promise.all([
        call('GetStudioModeEnabled'),
        call('GetCurrentSceneTransition'),
        call('GetSceneTransitionList'),
        call('GetCurrentProgramScene'),
      ]);

      if (program.currentProgramSceneName === target.scene && !studioModeEnabled) {
        lastKind = kind;
        return { ok: true, alreadyThere: true };
      }

      // Fade for our hand-off, then put the operator's own transition AND the Fade's own duration back
      // (OBS keeps a separate duration per transition, readable only while that transition is current).
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = null;
      if (!saved) {
        const fade = chooseFadeTransition(list.transitions);
        saved = { originalName: current.transitionName, fadeName: fade ? fade.transitionName : current.transitionName, fadeFixed: !fade || !!fade.transitionFixed, fadeDuration: 0 };
        if (saved.fadeName !== current.transitionName) await call('SetCurrentSceneTransition', { transitionName: saved.fadeName });
        saved.fadeDuration = (await call('GetCurrentSceneTransition')).transitionDuration;
      }
      if (!saved.fadeFixed) {
        // 606 = this transition has no configurable duration: harmless
        await call('SetCurrentSceneTransitionDuration', { transitionDuration: fadeMs }).catch(() => {});
      }

      if (studioModeEnabled) {
        await call('SetCurrentPreviewScene', { sceneName: target.scene });
        await call('TriggerStudioModeTransition');
      } else {
        await call('SetCurrentProgramScene', { sceneName: target.scene });
      }
      lastKind = kind;

      restoreTimer = setTimeout(async () => {
        restoreTimer = null;
        const keep = saved;
        saved = null;
        if (!keep || state !== 'connected') return;
        try {
          if (!keep.fadeFixed) await call('SetCurrentSceneTransitionDuration', { transitionDuration: keep.fadeDuration }).catch(() => {});
          if (keep.originalName !== keep.fadeName) await call('SetCurrentSceneTransition', { transitionName: keep.originalName });
        } catch (err) {
          log('[obs] could not restore transition', String(err?.message || err));
        }
      }, fadeMs + 400);

      return { ok: true };
    } catch (err) {
      log('[obs] switch failed', String(err?.message || err));
      return { ok: false, error: String(err?.message || err) };
    }
  }

  /** Switches OBS to the media or camera scene with a fade. One at a time, in order. */
  function switchTo(kind, fadeMs) {
    const run = queue.then(() => doSwitch(kind, fadeMs));
    queue = run.catch(() => {});
    return run;
  }

  /** Quitting while OBS is on the media scene: put it back on the camera quickly. */
  function restoreCameraIfNeeded(fadeMs = 800) {
    return lastKind === 'media' ? switchTo('camera', fadeMs) : Promise.resolve({ ok: true, skipped: true });
  }

  function dispose() {
    generation++;
    clearRetry();
    if (restoreTimer) clearTimeout(restoreTimer);
    dropSocket();
  }

  return { configure, refresh, switchTo, restoreCameraIfNeeded, status, dispose };
}

module.exports = { createObs };
