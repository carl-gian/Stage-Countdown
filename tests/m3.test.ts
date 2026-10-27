import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createM3 } = require('../electron/m3.cjs');

/** A simulated M3: a media window that the shortcut toggles after a short fade, like the real one. */
function fakeM3(opts: { visible?: boolean; exists?: boolean; ignoreKeys?: number; stateWorks?: boolean; directWorks?: boolean } = {}) {
  const win = { exists: opts.exists ?? true, visible: opts.visible ?? true, ignoreKeys: opts.ignoreKeys ?? 0 };
  const calls: string[] = [];
  const ps = async (cmd: string) => {
    const type = cmd.split('|')[0];
    calls.push(type);
    if (type === 'state') return opts.stateWorks === false ? 'FAIL worker-unavailable' : !win.exists ? 'none' : win.visible ? 'shown' : 'hidden';
    if (type === 'windows') return win.exists ? `[Media Player - M3 visible=${win.visible}]` : '(none)';
    if (type === 'hide' || type === 'show') {
      if (opts.directWorks === false || !win.exists) return 'OK 0';
      const want = type === 'show';
      if (win.visible === want) return 'OK 0';
      win.visible = want;
      return 'OK 1';
    }
    if (type === 'key') {
      if (win.ignoreKeys > 0) win.ignoreKeys--;
      else setTimeout(() => (win.visible = !win.visible), 20); // M3 fades, then toggles
      return 'OK';
    }
    return 'FAIL unknown';
  };
  return { win, ps, keys: () => calls.filter((c) => c === 'key').length, calls };
}

const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

function make(sim: ReturnType<typeof fakeM3>, enabled = true, m3Extra: Record<string, unknown> = {}) {
  const statuses: Record<string, unknown>[] = [];
  const m3 = createM3({
    ps: sim.ps,
    getConfig: () => ({ m3: { enabled, ...m3Extra }, m3WindowTitle: 'Meeting media - M', m3MediaWindowTitle: 'Media Player - M', hideShortcut: { code: 'F3', alt: true, shift: true, ctrl: false } }),
    onStatus: (s: Record<string, unknown>) => statuses.push(s),
    verifyMs: 400,
    verifyStepMs: 10,
    focusSettleMs: 0,
    guardMs: 25,
    pollMs: 30,
    guardBackoffMs: 30,
  });
  cleanup.push(() => m3.dispose());
  return { m3, statuses };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 5000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await sleep(20);
  }
};

describe('M3 hand-off with real detection', () => {
  it('hides the media window when it is showing, and brings it back afterwards', async () => {
    const sim = fakeM3({ visible: true });
    const { m3 } = make(sim);
    const hid = await m3.hide();
    expect(hid).toMatchObject({ ok: true, media: 'hidden', hidden: true });
    expect(sim.keys()).toBe(1);
    expect(m3.needsRestore()).toBe(true);

    const shown = await m3.show();
    expect(shown).toMatchObject({ ok: true, media: 'shown' });
    expect(sim.keys()).toBe(2);
    expect(m3.needsRestore()).toBe(false);
  });

  it('sends nothing when M3 is not showing, and then does not "restore" what it never hid', async () => {
    const sim = fakeM3({ visible: false });
    const { m3 } = make(sim);
    expect(await m3.hide()).toMatchObject({ ok: true, media: 'hidden' });
    expect(await m3.show()).toMatchObject({ ok: true, media: 'hidden' });
    expect(sim.keys()).toBe(0);
  });

  it('retries once when the first shortcut is swallowed', async () => {
    const sim = fakeM3({ visible: true, ignoreKeys: 1 });
    const { m3 } = make(sim);
    expect(await m3.hide()).toMatchObject({ ok: true, media: 'hidden' });
    expect(sim.keys()).toBe(2);
  });

  it('reports a clear error when nothing works (shortcut ignored and the direct fallback is off)', async () => {
    const sim = fakeM3({ visible: true, ignoreKeys: 99 });
    const { m3 } = make(sim, true, { directFallback: false });
    const r = await m3.hide();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/did not react to the shortcut/);
    expect(r.error).toMatch(/Media Window/);
    expect(sim.keys()).toBe(2);
  });

  it('when M3 ignores the shortcut it hides the media window directly, so it can never stay on top', async () => {
    const sim = fakeM3({ visible: true, ignoreKeys: 99 });
    const { m3, statuses } = make(sim);
    const r = await m3.hide();
    expect(r).toMatchObject({ ok: true, media: 'hidden' });
    expect(sim.keys()).toBe(2); // the shortcut was tried twice first
    expect(statuses.some((s) => String(s.note ?? '').includes('hidden directly'))).toBe(true);
    expect(m3.needsRestore()).toBe(true);
  });

  it('a window it hid directly is shown directly again (M3 never knew about it), without more shortcuts', async () => {
    const sim = fakeM3({ visible: true, ignoreKeys: 99 });
    const { m3 } = make(sim);
    await m3.hide();
    const keysBefore = sim.keys();
    expect(await m3.show()).toMatchObject({ ok: true, media: 'shown' });
    expect(sim.keys()).toBe(keysBefore);
    expect(m3.needsRestore()).toBe(false);
  });

  it('never touches M3\'s own controller window (no focus step at all)', async () => {
    const sim = fakeM3({ visible: true });
    const { m3 } = make(sim);
    await m3.hide();
    await m3.show();
    expect(sim.calls).not.toContain('focus');
  });

  it('does not try to restore a media window that M3 closed in the meantime', async () => {
    const sim = fakeM3({ visible: true });
    const { m3 } = make(sim);
    await m3.hide();
    sim.win.exists = false; // operator closed M3's media window
    const before = sim.keys();
    expect(await m3.show()).toMatchObject({ ok: true, media: 'none' });
    expect(sim.keys()).toBe(before);
    expect(m3.needsRestore()).toBe(false);
  });

  it('Toggle flips whatever is on screen, even if the app did not hide it', async () => {
    const sim = fakeM3({ visible: false });
    const { m3 } = make(sim);
    expect(await m3.toggle()).toMatchObject({ media: 'shown' });
    expect(await m3.toggle()).toMatchObject({ media: 'hidden' });
    expect(sim.keys()).toBe(2);
  });

  it('two requests at once never overlap (one shortcut, not two)', async () => {
    const sim = fakeM3({ visible: true });
    const { m3 } = make(sim);
    await Promise.all([m3.hide(), m3.hide()]);
    expect(sim.keys()).toBe(1);
  });

  it('standalone mode (M3 control off) never reads or sends anything', async () => {
    const sim = fakeM3({ visible: true });
    const { m3 } = make(sim, false);
    expect(await m3.hide()).toMatchObject({ ok: true, enabled: false });
    expect(await m3.show()).toMatchObject({ ok: true, enabled: false });
    expect(sim.calls).toEqual([]);
  });

  it('falls back to a remembered toggle only when the real state cannot be read', async () => {
    const sim = fakeM3({ visible: true, stateWorks: false });
    const { m3 } = make(sim);
    expect(await m3.hide()).toMatchObject({ ok: true, hidden: true });
    expect(await m3.hide()).toMatchObject({ ok: true, hidden: true });
    expect(sim.keys()).toBe(1); // the second hide knew it was already hidden
    await m3.show();
    expect(sim.keys()).toBe(2);
  });
});

describe('guard while a countdown runs', () => {
  it('hides M3 again when its media display comes back on top of the timer', async () => {
    const sim = fakeM3({ visible: true });
    const { m3, statuses } = make(sim);
    await m3.hide();
    m3.startGuard();
    const keysAfterHide = sim.keys();

    sim.win.visible = true; // M3 pops back on top
    await sleep(250);
    expect(sim.keys()).toBe(keysAfterHide + 1);
    expect(sim.win.visible).toBe(false);
    expect(statuses.some((s) => String(s.note ?? '').includes('hid it again'))).toBe(true);
  });

  it('does nothing while the media window is hidden, and nothing once stopped', async () => {
    const sim = fakeM3({ visible: false });
    const { m3 } = make(sim);
    m3.startGuard();
    await sleep(150);
    expect(sim.keys()).toBe(0);

    m3.stopGuard();
    sim.win.visible = true;
    await sleep(150);
    expect(sim.keys()).toBe(0);
  });

  it('gives up with a clear message instead of hammering the keyboard when nothing can hide M3', async () => {
    const sim = fakeM3({ visible: true, ignoreKeys: 999, directWorks: false });
    const { m3, statuses } = make(sim);
    m3.startGuard();
    await until(() => statuses.some((s) => String(s.note ?? '').includes('could not be hidden')), 15000);
    const keysAtGiveUp = sim.keys();
    // 3 cycles x 2 attempts, then it stops: no more presses afterwards
    expect(keysAtGiveUp).toBeLessThanOrEqual(6);
    await sleep(400);
    expect(sim.keys()).toBe(keysAtGiveUp);
  }, 20000);
});

describe('Settings > M3 > Test', () => {
  it('shortcut works: reports it and leaves M3 as it was', async () => {
    const sim = fakeM3({ visible: true });
    const { m3 } = make(sim);
    const r = await m3.test();
    expect(r).toMatchObject({ result: 'shortcut-ok', before: 'shown', shortcut: 'Alt + Shift + F3' });
    expect(sim.win.visible).toBe(true);
    expect(sim.keys()).toBe(2); // once to test, once to put it back
  });

  it('shortcut ignored but the direct method works: says so (and restores)', async () => {
    const sim = fakeM3({ visible: true, ignoreKeys: 99 });
    const { m3 } = make(sim);
    const r = await m3.test();
    expect(r.result).toBe('direct-only');
    expect(sim.win.visible).toBe(true);
  });

  it('nothing works: says so', async () => {
    const sim = fakeM3({ visible: true, ignoreKeys: 99, directWorks: false });
    const { m3 } = make(sim);
    expect((await m3.test()).result).toBe('nothing-works');
  });

  it('no media window / unreadable / standalone', async () => {
    expect((await make(fakeM3({ exists: false })).m3.test()).result).toBe('no-window');
    expect((await make(fakeM3({ stateWorks: false })).m3.test()).result).toBe('cannot-read');
    expect((await make(fakeM3({ visible: true }), false).m3.test()).result).toBe('off');
  });

  it('lists the windows it found (for the log and the result)', async () => {
    const r = await make(fakeM3({ visible: true })).m3.test();
    expect(String(r.windows)).toContain('Media Player - M3');
  });
});

describe('status for the UI', () => {
  it('background refresh notices a change made by hand and tells the UI', async () => {
    const sim = fakeM3({ visible: true });
    const { m3, statuses } = make(sim);
    m3.startPolling();
    await sleep(120);
    expect(statuses.at(-1)).toMatchObject({ media: 'shown', hidden: false });
    sim.win.visible = false;
    await sleep(150);
    expect(statuses.at(-1)).toMatchObject({ media: 'hidden', hidden: true });
  });
});
