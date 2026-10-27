// Meeting Media Manager (M3) hand-off. No Electron imports, so it is testable with a simulated M3.
//
// M3 has TWO windows. The one that matters here is the MEDIA window, "Media Player - M3" (what the audience sees,
// the one that covers the stage display). The other, "Meeting media - M3", is M3's own controller window: it is
// never used to decide whether M3 is showing (it is only brought forward, best effort, so the keyboard shortcut reaches M3).
//
// M3's "Media Window" shortcut is a TOGGLE, so we never trust a remembered state: before and after every shortcut we READ
// the real state of the media window (PowerShell worker: `state|<title>` -> shown | hidden | none), verify the result and
// retry once. While a countdown runs a guard re-checks every ~1.5 s and sends the shortcut again if M3's media window has
// come back on top of the timer.
const { shortcutToKeys } = require('./logic.cjs');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} d
 * @param {(command: string, timeoutMs?: number) => Promise<string>} d.ps  the PowerShell worker
 * @param {() => object} d.getConfig
 * @param {(...a: unknown[]) => void} [d.log]
 * @param {(status: object) => void} [d.onStatus] called when the visible status changes
 * @param {number} [d.pollMs] background state refresh while idle
 * @param {number} [d.guardMs] guard check interval while a countdown runs
 * @param {number} [d.verifyMs] how long to wait for M3 to react to a shortcut
 * @param {number} [d.verifyStepMs]
 * @param {number} [d.focusSettleMs] pause between bringing M3 forward and pressing the keys
 */
function createM3({ ps, getConfig, log = () => {}, onStatus = () => {}, pollMs = 2000, guardMs = 1500, verifyMs = 2000, verifyStepMs = 150, focusSettleMs = 200 }) {
  let media = 'unknown'; // shown | hidden | none (no media window at all) | unknown (cannot read it)
  let hiddenByUs = false; // we hid it, so we are the ones to bring it back
  let belief = false; // only used when the real state cannot be read (non-Windows, worker down)
  let note = '';
  let noteTimer = null;
  let lastError = '';
  let queue = Promise.resolve();
  let queued = 0;
  let pollTimer = null;
  let guardTimer = null;
  let guardOn = false;
  let lastEmitted = '';

  const enabled = () => getConfig().m3.enabled !== false;

  const status = (ok = true, error = '') => ({
    ok,
    enabled: enabled(),
    media,
    // "hidden" = not covering the screen (hidden, or no media window at all)
    hidden: media === 'unknown' ? belief : media !== 'shown',
    ...(error ? { error } : {}),
    ...(note ? { note } : {}),
  });

  function emit() {
    const s = status(!lastError, lastError);
    const key = JSON.stringify(s);
    if (key !== lastEmitted) {
      lastEmitted = key;
      onStatus(s);
    }
  }

  function setNote(text, ms = 6000) {
    note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      note = '';
      emit();
    }, ms);
    emit();
  }

  /** Reads the media window's real state. */
  async function detect() {
    if (!enabled()) {
      media = 'unknown';
      return 'unknown';
    }
    const r = await ps(`state|${getConfig().m3MediaWindowTitle}`, 2500);
    media = r === 'shown' || r === 'hidden' || r === 'none' ? r : 'unknown';
    emit();
    return media;
  }

  async function waitFor(pred) {
    let s = await detect();
    for (let waited = 0; !pred(s) && waited < verifyMs; waited += verifyStepMs) {
      await wait(verifyStepMs);
      s = await detect();
    }
    return s;
  }

  /** Brings M3's own window forward (best effort) and presses its Media Window shortcut. Returns an error text or null. */
  async function sendKey() {
    const cfg = getConfig();
    const focus = await ps(`focus|${cfg.m3WindowTitle}`);
    if (focus !== 'OK') log('[m3] could not bring M3 forward (', focus, ') - sending the shortcut anyway (it is a global shortcut)');
    await wait(focusSettleMs);
    const k = shortcutToKeys(cfg.hideShortcut);
    const key = await ps(`key|${k.vkCode}|${+k.hasAlt}|${+k.hasShift}|${+k.hasCtrl}`);
    if (key !== 'OK') {
      log('[m3] shortcut failed:', key);
      return `Could not send the shortcut (${key})`;
    }
    return null;
  }

  const fail = (error) => {
    lastError = error;
    emit();
    return status(false, error);
  };
  const ok = () => {
    lastError = '';
    emit();
    return status();
  };

  // Legacy path: the real state cannot be read, so fall back to a remembered toggle (the old behaviour).
  async function legacy(target) {
    if (belief === target) return ok();
    const err = await sendKey();
    if (err) return fail(err);
    belief = target;
    hiddenByUs = target;
    return ok();
  }

  async function hideInner() {
    if (!enabled()) return ok();
    const s = await detect();
    if (s === 'unknown') return legacy(true);
    if (s !== 'shown') return ok(); // nothing is covering the screen: nothing to hide
    for (let attempt = 1; attempt <= 2; attempt++) {
      const err = await sendKey();
      if (err) return fail(err);
      if ((await waitFor((x) => x !== 'shown')) !== 'shown') {
        hiddenByUs = true;
        return ok();
      }
      log(`[m3] the media display is still showing after the shortcut (attempt ${attempt})`);
    }
    return fail(
      'M³\'s media display is still showing after sending the shortcut. Check that the shortcut here matches M³\'s "Media Window" shortcut and that keyboard shortcuts are enabled in M³.'
    );
  }

  async function showInner({ force = false } = {}) {
    if (!enabled()) return ok();
    if (!hiddenByUs && !force) return ok(); // we did not hide it, so it is not ours to bring back
    const s = await detect();
    if (s === 'unknown') return legacy(false);
    if (s === 'shown') {
      hiddenByUs = false;
      return ok();
    }
    if (s === 'none' && !force) {
      hiddenByUs = false; // M3 closed its media window meanwhile: nothing left to restore
      return ok();
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      const err = await sendKey();
      if (err) return fail(err);
      if ((await waitFor((x) => x === 'shown')) === 'shown') {
        hiddenByUs = false;
        return ok();
      }
      log(`[m3] the media display did not come back after the shortcut (attempt ${attempt})`);
    }
    return fail('M³\'s media display did not come back after sending the shortcut. Check M³ and its shortcut.');
  }

  function enqueue(fn) {
    queued++;
    const run = queue.then(fn);
    queue = run.catch(() => {}).finally(() => queued--);
    return run;
  }

  const hide = () => enqueue(hideInner);
  const show = (opts) => enqueue(() => showInner(opts));

  /** The operator's Toggle button: flips whatever is on screen right now. */
  const toggle = () =>
    enqueue(async () => {
      const s = await detect();
      if (s === 'shown') return hideInner();
      return showInner({ force: true });
    });

  /** Re-reads the state now (used by the UI and background refresh). */
  const refresh = () =>
    enqueue(async () => {
      await detect();
      return status(!lastError, lastError);
    });

  // --- GUARD: while a countdown runs, M3's media window must stay hidden ---
  async function guardTick() {
    if (!guardOn || !enabled() || queued > 0) return;
    enqueue(async () => {
      if (!guardOn) return status();
      const s = await detect();
      if (s !== 'shown') return status();
      log('[m3] guard: M3\'s media display is showing while the countdown runs - hiding it again');
      setNote('M³ was showing on top of the timer — hid it again');
      return hideInner();
    }).catch(() => {});
  }

  function startGuard() {
    guardOn = true;
    if (!guardTimer) guardTimer = setInterval(guardTick, guardMs);
  }

  function stopGuard() {
    guardOn = false;
    clearInterval(guardTimer);
    guardTimer = null;
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (enabled() && queued === 0) refresh().catch(() => {});
    }, pollMs);
  }

  function dispose() {
    stopGuard();
    clearInterval(pollTimer);
    pollTimer = null;
    clearTimeout(noteTimer);
  }

  return {
    hide,
    show,
    toggle,
    refresh,
    startGuard,
    stopGuard,
    startPolling,
    dispose,
    status: () => status(!lastError, lastError),
    /** True if the app hid M3's media window and has not brought it back yet. */
    needsRestore: () => hiddenByUs,
    pushStatus: emit,
  };
}

module.exports = { createM3 };
