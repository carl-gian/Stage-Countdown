// Meeting Media Manager (M3) hand-off. No Electron imports, so it is testable with a simulated M3.
//
// M3 has TWO windows. The MEDIA window, "Media Player - M3" (what the audience sees, the one that covers the stage), is
// the one we DETECT. M3's own controller window, "Meeting media - M3", is never used to decide anything, but it is SELECTED
// (brought to the front) before the shortcut is pressed, because M3 needs to be the active program for the key press to
// register reliably (the original PowerShell tool did the same). If it cannot be selected the shortcut is still sent.
//
// M3's shortcut flips an internal flag inside M3, and M3 ignores it while one of its dialogs is open, so a press can
// silently do nothing. We therefore never trust a remembered state: before and after every press we READ the real state
// of the media window (PowerShell worker: `state|<title>` -> shown | hidden | none) and verify the result.
//   1. send the shortcut, check, retry once;
//   2. if M3 still ignores it, hide/show the media window directly (Win32), so it can never stay on top of the timer;
//   3. while a countdown runs a guard re-checks every ~1.5 s, and gives up (with a clear message) instead of
//      hammering the keyboard if nothing works.
const { shortcutToKeys, describeShortcut } = require('./logic.cjs');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} d
 * @param {(command: string, timeoutMs?: number) => Promise<string>} d.ps  the PowerShell worker
 * @param {() => object} d.getConfig
 * @param {(...a: unknown[]) => void} [d.log]
 * @param {(status: object) => void} [d.onStatus] called when the visible status changes
 * @param {number} [d.pollMs] background state refresh while idle
 * @param {number} [d.guardMs] guard check interval while a countdown runs
 * @param {number} [d.guardGiveUpAfter] consecutive failed guard cycles before the guard stops trying
 * @param {number} [d.guardBackoffMs] pause after a failed guard cycle (multiplied by the number of failures)
 * @param {number} [d.verifyMs] how long to wait for M3 to react to a shortcut
 * @param {number} [d.verifyStepMs]
 * @param {number} [d.focusSettleMs] pause between selecting M3's controller window and pressing the keys
 */
function createM3({ ps, getConfig, log = () => {}, onStatus = () => {}, pollMs = 2000, guardMs = 1500, guardGiveUpAfter = 3, guardBackoffMs = 5000, verifyMs = 2000, verifyStepMs = 150, focusSettleMs = 250 }) {
  let media = 'unknown'; // shown | hidden | none (no media window at all) | unknown (cannot read it)
  let hiddenByUs = false; // we hid it, so we are the ones to bring it back
  let hiddenVia = ''; // 'shortcut' | 'window': how we hid it (a window hidden directly must be shown directly)
  let belief = false; // only used when the real state cannot be read (non-Windows, worker down)
  let note = '';
  let noteTimer = null;
  let lastError = '';
  let queue = Promise.resolve();
  let queued = 0;
  let pollTimer = null;
  let guardTimer = null;
  let guardOn = false;
  let guardFails = 0;
  let guardPausedUntil = 0;
  let lastEmitted = '';

  const enabled = () => getConfig().m3.enabled !== false;
  const directFallbackOn = () => getConfig().m3.directFallback !== false;
  const title = () => getConfig().m3MediaWindowTitle;

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

  function setNote(text, ms = 8000) {
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
    const r = await ps(`state|${title()}`, 2500);
    media = r === 'shown' || r === 'hidden' || r === 'none' ? r : 'unknown';
    emit();
    return media;
  }

  async function waitFor(pred, ms = verifyMs) {
    let s = await detect();
    for (let waited = 0; !pred(s) && waited < ms; waited += verifyStepMs) {
      await wait(verifyStepMs);
      s = await detect();
    }
    return s;
  }

  /** Which windows match the media title right now (for the log, when something does not work). */
  async function logWindows(why, part = title()) {
    const list = await ps(`windows|${part}`, 2500);
    log(`[m3] ${why}: windows matching "${part}": ${list}`);
    return list;
  }

  /** Selects (brings to the front) M3's controller window, "Meeting media - M3". Best effort: returns the worker's answer. */
  async function selectController() {
    const cfg = getConfig();
    if (cfg.m3.focusController === false) return 'skipped';
    const r = await ps(`focus|${cfg.m3WindowTitle}`, 4000);
    if (r !== 'OK') {
      log(`[m3] could not select M3's controller window "${cfg.m3WindowTitle}" (${r}) - sending the shortcut anyway`);
      if (r === 'FAIL nowindow') await logWindows('controller window not found', cfg.m3WindowTitle);
    } else {
      await wait(focusSettleMs);
    }
    return r;
  }

  /** Selects M3's controller window, then presses M3's Media Window shortcut. Returns an error text or null. */
  async function sendKey() {
    const cfg = getConfig();
    const k = shortcutToKeys(cfg.hideShortcut);
    const selected = await selectController();
    log(`[m3] sending the shortcut ${describeShortcut(cfg.hideShortcut)} (virtual key ${k.vkCode}; controller window: ${selected})`);
    const key = await ps(`key|${k.vkCode}|${+k.hasAlt}|${+k.hasShift}|${+k.hasCtrl}`);
    if (key !== 'OK') {
      log('[m3] shortcut failed:', key);
      return `Could not send the shortcut (${key})`;
    }
    return null;
  }

  /** Hides or shows the media window directly, bypassing M3's shortcut. Returns true if the window's state changed as wanted. */
  async function direct(wantShown) {
    const r = await ps(`${wantShown ? 'show' : 'hide'}|${title()}`, 2500);
    log(`[m3] direct ${wantShown ? 'show' : 'hide'}: ${r}`);
    if (!/^OK [1-9]/.test(r)) return false;
    const s = await waitFor((x) => (wantShown ? x === 'shown' : x !== 'shown'), 1000);
    return wantShown ? s === 'shown' : s !== 'shown';
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
    hiddenVia = target ? 'shortcut' : '';
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
        hiddenVia = 'shortcut';
        return ok();
      }
      log(`[m3] the media display is still showing after the shortcut (attempt ${attempt})`);
    }

    // M3 ignored the shortcut twice. Do not leave it on top of the timer: hide the window directly.
    await logWindows('shortcut had no effect');
    if (directFallbackOn() && (await direct(false))) {
      hiddenByUs = true;
      hiddenVia = 'window';
      setNote('M³ ignored the shortcut, so its media display was hidden directly');
      return ok();
    }
    return fail(
      'M³ did not react to the shortcut. Check that it is the same as M³\'s "Media Window" shortcut, that keyboard shortcuts are enabled in M³, and that no M³ dialog is open.'
    );
  }

  async function showInner({ force = false } = {}) {
    if (!enabled()) return ok();
    if (!hiddenByUs && !force) return ok(); // we did not hide it, so it is not ours to bring back
    const s = await detect();
    if (s === 'unknown') return legacy(false);
    if (s === 'shown') {
      hiddenByUs = false;
      hiddenVia = '';
      return ok();
    }
    if (s === 'none' && !force) {
      hiddenByUs = false; // M3 closed its media window meanwhile: nothing left to restore
      hiddenVia = '';
      return ok();
    }
    const done = () => {
      hiddenByUs = false;
      hiddenVia = '';
      return ok();
    };

    // A window we hid directly is unknown to M3, so show it directly too.
    if (hiddenVia === 'window' && (await direct(true))) return done();

    for (let attempt = 1; attempt <= 2; attempt++) {
      const err = await sendKey();
      if (err) return fail(err);
      if ((await waitFor((x) => x === 'shown')) === 'shown') return done();
      log(`[m3] the media display did not come back after the shortcut (attempt ${attempt})`);
    }
    await logWindows('shortcut had no effect');
    if (directFallbackOn() && (await direct(true))) {
      setNote('M³ ignored the shortcut, so its media display was shown directly');
      return done();
    }
    return fail('M³\'s media display did not come back. Check M³ and its "Media Window" shortcut.');
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

  /**
   * Settings > M3 > Test. Presses the shortcut ONCE and reports whether M3's media display really reacted, then puts
   * it back as it was. If the shortcut did nothing it tries the direct method, so the answer is one of:
   * shortcut-ok | direct-only | nothing-works | no-window | cannot-read | off.
   */
  const test = () =>
    enqueue(async () => {
      const cfg = getConfig();
      const report = { shortcut: describeShortcut(cfg.hideShortcut), title: title() };
      if (!enabled()) return { ...report, result: 'off' };
      const before = await detect();
      report.before = before;
      report.windows = await ps(`windows|${title()}`, 2500);
      report.controller = await ps(`windows|${cfg.m3WindowTitle}`, 2500);
      if (before === 'unknown') return { ...report, result: 'cannot-read' };
      if (before === 'none') return { ...report, result: 'no-window' };

      const err = await sendKey();
      if (err) return { ...report, result: 'nothing-works', error: err };
      const after = await waitFor((x) => x !== before);
      report.after = after;
      if (after !== before) {
        // The shortcut works. Put M3 back as it was.
        await sendKey();
        await waitFor((x) => x === before);
        return { ...report, result: 'shortcut-ok' };
      }

      // The shortcut changed nothing. Does the direct method work?
      const wantShown = before !== 'shown';
      const worked = await direct(wantShown);
      if (worked) await direct(!wantShown);
      return { ...report, result: worked ? 'direct-only' : 'nothing-works' };
    });

  // --- GUARD: while a countdown runs, M3's media window must stay hidden ---
  async function guardTick() {
    if (!guardOn || !enabled() || queued > 0 || Date.now() < guardPausedUntil) return;
    enqueue(async () => {
      if (!guardOn) return status();
      const s = await detect();
      if (s !== 'shown') {
        guardFails = 0;
        return status();
      }
      log('[m3] guard: M3\'s media display is showing while the countdown runs - hiding it again');
      setNote('M³ was showing on top of the timer — hid it again');
      const r = await hideInner();
      if (r.ok) {
        guardFails = 0;
      } else {
        guardFails++;
        guardPausedUntil = Date.now() + guardBackoffMs * guardFails; // do not hammer the keyboard
        if (guardFails >= guardGiveUpAfter) {
          log(`[m3] guard: giving up after ${guardFails} failed attempts (nothing hides M3's media display)`);
          stopGuard();
          setNote('M³ keeps showing and could not be hidden. Check the shortcut (Settings → M³ → Test).', 30_000);
        }
      }
      return r;
    }).catch(() => {});
  }

  function startGuard() {
    guardOn = true;
    guardFails = 0;
    guardPausedUntil = 0;
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
    test,
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
