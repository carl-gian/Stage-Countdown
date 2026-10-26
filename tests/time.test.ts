import { describe, expect, it } from 'vitest';
import { formatCountdown, nextOccurrence } from '../src/lib/time';
import { DEFAULT_VISUAL_SETTINGS, mergeVisual } from '../src/types';

describe('formatCountdown', () => {
  it('rounds up so 05:00 holds for a full second', () => {
    expect(formatCountdown(300_000)).toBe('05:00');
    expect(formatCountdown(299_999)).toBe('05:00');
    expect(formatCountdown(299_000)).toBe('04:59');
  });

  it('never goes negative and pads', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-500)).toBe('00:00');
    expect(formatCountdown(61_000)).toBe('01:01');
    expect(formatCountdown(125 * 60_000)).toBe('125:00');
  });
});

describe('nextOccurrence', () => {
  const now = new Date(2026, 9, 21, 18, 0, 30);

  it('returns today when the time is still ahead', () => {
    const t = nextOccurrence('18:30', now);
    expect(t.getDate()).toBe(21);
    expect(t.getHours()).toBe(18);
    expect(t.getMinutes()).toBe(30);
  });

  it('rolls to tomorrow when the time has passed or is right now', () => {
    expect(nextOccurrence('17:00', now).getDate()).toBe(22);
    expect(nextOccurrence('18:00', now).getDate()).toBe(22);
  });
});

describe('mergeVisual', () => {
  it('returns defaults for junk input', () => {
    expect(mergeVisual(null)).toEqual(DEFAULT_VISUAL_SETTINGS);
    expect(mergeVisual('x')).toEqual(DEFAULT_VISUAL_SETTINGS);
  });

  it('keeps boolean clock24h a boolean (it used to become an object)', () => {
    expect(mergeVisual({ clock24h: false }).clock24h).toBe(false);
    expect(mergeVisual({}).clock24h).toBe(true);
  });

  it('fills missing nested keys from defaults', () => {
    const v = mergeVisual({ progressRing: { color1: '#ff0000' } });
    expect(v.progressRing.color1).toBe('#ff0000');
    expect(v.progressRing.thickness).toBe(DEFAULT_VISUAL_SETTINGS.progressRing.thickness);
  });
});
