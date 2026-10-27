import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEFAULT_CONFIG, deepMerge, shortcutToKeys, scheduleDueKey, describeShortcut, startsHidden } = require('../electron/logic.cjs');

describe('deepMerge', () => {
  it('merges nested objects without mutating the base', () => {
    const base = { a: { x: 1, y: 2 }, b: 1 };
    const out = deepMerge(base, { a: { y: 3 } });
    expect(out).toEqual({ a: { x: 1, y: 3 }, b: 1 });
    expect(base.a.y).toBe(2);
  });

  it('replaces arrays and null instead of merging them', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
    expect(deepMerge({ a: { x: 1 } }, { a: null })).toEqual({ a: null });
  });

  it('keeps defaults for keys missing from a saved config', () => {
    const out = deepMerge(DEFAULT_CONFIG, { schedule: { enabled: true } });
    expect(out.schedule).toEqual({ enabled: true, time1: '', time2: '', durationMinutes: 5 });
  });
});

describe('shortcutToKeys', () => {
  it('defaults to Shift+Alt+F3', () => {
    expect(shortcutToKeys(undefined)).toEqual({ vkCode: 0x72, hasAlt: true, hasShift: true, hasCtrl: false });
  });

  it('maps function keys F1-F12', () => {
    expect(shortcutToKeys({ code: 'F1' }).vkCode).toBe(0x70);
    expect(shortcutToKeys({ code: 'F12' }).vkCode).toBe(0x7b);
  });

  it('maps letters and digits to their ASCII virtual-key codes', () => {
    expect(shortcutToKeys({ code: 'KeyY' }).vkCode).toBe(0x59);
    expect(shortcutToKeys({ code: 'Digit5' }).vkCode).toBe(0x35);
  });

  it('respects explicit modifier flags', () => {
    const k = shortcutToKeys({ ctrl: true, alt: false, shift: false, code: 'KeyA' });
    expect(k).toEqual({ vkCode: 0x41, hasAlt: false, hasShift: false, hasCtrl: true });
  });
});

describe('scheduleDueKey', () => {
  const schedule = { enabled: true, time1: '18:30', time2: '09:05', durationMinutes: 5 };
  const at = (h: number, m: number, s = 30) => new Date(2026, 9, 21, h, m, s);

  it('is null when disabled or not at a scheduled time', () => {
    expect(scheduleDueKey({ ...schedule, enabled: false }, at(18, 30))).toBeNull();
    expect(scheduleDueKey(schedule, at(18, 31))).toBeNull();
  });

  it('returns the same key for every tick inside one scheduled minute', () => {
    const a = scheduleDueKey(schedule, at(18, 30, 0));
    expect(a).toBeTruthy();
    expect(scheduleDueKey(schedule, at(18, 30, 55))).toBe(a);
  });

  it('matches time2 with zero padding', () => {
    expect(scheduleDueKey(schedule, at(9, 5))).toBeTruthy();
  });

  it('ignores an empty time slot', () => {
    expect(scheduleDueKey({ ...schedule, time1: '' }, at(0, 0))).toBeNull();
  });
});

describe('describeShortcut', () => {
  it('writes the shortcut in words', () => {
    expect(describeShortcut(undefined)).toBe('Alt + Shift + F3');
    expect(describeShortcut({ ctrl: true, alt: false, shift: false, code: 'KeyY' })).toBe('Ctrl + Y');
    expect(describeShortcut({ ctrl: false, alt: true, shift: true, code: 'Digit5' })).toBe('Alt + Shift + 5');
  });
});

describe('startsHidden', () => {
  const base = { startMinimized: false, obs: { enabled: false, startHidden: true } };
  it('shows the window by default', () => {
    expect(startsHidden(base, [])).toBe(false);
  });
  it('hides while OBS switching is on, unless that option is off', () => {
    expect(startsHidden({ ...base, obs: { enabled: true, startHidden: true } }, [])).toBe(true);
    expect(startsHidden({ ...base, obs: { enabled: true } }, [])).toBe(true);
    expect(startsHidden({ ...base, obs: { enabled: true, startHidden: false } }, [])).toBe(false);
  });
  it('still honours the general setting and --hidden', () => {
    expect(startsHidden({ ...base, startMinimized: true, obs: { enabled: true, startHidden: false } }, [])).toBe(true);
    expect(startsHidden(base, ['--hidden'])).toBe(true);
  });
});
