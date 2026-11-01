import { describe, expect, it } from 'vitest';
import { DEFAULT_VISUAL_SETTINGS, mergeVisual } from '../src/types';

describe('visual settings: the stage look', () => {
  it('defaults to the scene style: Mountains, light, Calm, the line above the numbers, normal size', () => {
    expect(DEFAULT_VISUAL_SETTINGS.stage).toEqual({
      style: 'scene',
      scene: 'mountains',
      look: 'light',
      motion: 'calm',
      showKicker: true,
      numberSize: 'normal',
    });
  });

  it('an old saved config (no stage section) gets the new look and keeps its own colours', () => {
    const old = {
      background: { mode: 'solid', color1: '#112233', color2: '#000000', opacity: 0.8 },
      progressRing: { color1: '#ff0000' },
      clock24h: false,
    };
    const v = mergeVisual(old);
    expect(v.stage).toEqual(DEFAULT_VISUAL_SETTINGS.stage);
    expect(v.background.color1).toBe('#112233');
    expect(v.progressRing.color1).toBe('#ff0000');
    expect(v.progressRing.thickness).toBe(DEFAULT_VISUAL_SETTINGS.progressRing.thickness);
    expect(v.clock24h).toBe(false);
  });

  it('keeps valid saved choices', () => {
    const v = mergeVisual({ stage: { style: 'custom', scene: 'lake', look: 'auto', motion: 'plain', showKicker: false, numberSize: 'larger' } });
    expect(v.stage).toEqual({ style: 'custom', scene: 'lake', look: 'auto', motion: 'plain', showKicker: false, numberSize: 'larger' });
  });

  it('unknown or wrongly typed values fall back to the default, one field at a time', () => {
    const v = mergeVisual({ stage: { style: 'neon', scene: 'desert', look: 'dark', motion: 7, showKicker: 'yes', numberSize: 'huge' } });
    expect(v.stage).toEqual({ ...DEFAULT_VISUAL_SETTINGS.stage, look: 'dark' });
  });

  it('survives junk', () => {
    expect(mergeVisual(null)).toEqual(DEFAULT_VISUAL_SETTINGS);
    expect(mergeVisual({ stage: 'scene' }).stage).toEqual(DEFAULT_VISUAL_SETTINGS.stage);
  });
});
