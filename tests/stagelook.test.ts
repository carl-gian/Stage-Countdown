import { describe, expect, it } from 'vitest';
import { resolveLook, digitScale, ringFraction } from '../src/lib/stageLook';
import { fitStageBox } from '../src/lib/fitSize';

describe('stage look helpers', () => {
  it('auto follows Windows; light and dark are fixed', () => {
    expect(resolveLook('auto', true)).toBe('dark');
    expect(resolveLook('auto', false)).toBe('light');
    expect(resolveLook('light', true)).toBe('light');
    expect(resolveLook('dark', false)).toBe('dark');
  });

  it('number size: smaller / normal / larger', () => {
    expect(digitScale('normal')).toBe(1);
    expect(digitScale('smaller')).toBeLessThan(1);
    expect(digitScale('larger')).toBeGreaterThan(1);
  });

  it('the ring shows the time that is left (it shrinks), clamped to 0..1', () => {
    expect(ringFraction(300_000, 300_000)).toBe(1);
    expect(ringFraction(75_000, 300_000)).toBe(0.25);
    expect(ringFraction(-5, 300_000)).toBe(0);
    expect(ringFraction(400_000, 300_000)).toBe(1);
    // no total yet (before the first start): full if there is time set, empty if not
    expect(ringFraction(60_000, 0)).toBe(1);
    expect(ringFraction(0, 0)).toBe(0);
  });

  it('fits a 16:9 preview inside the free space', () => {
    expect(fitStageBox(480, 600)).toEqual({ width: 480, height: 270 });
    expect(fitStageBox(800, 180)).toEqual({ width: 320, height: 180 });
    expect(fitStageBox(0, 0)).toEqual({ width: 0, height: 0 });
  });
});
