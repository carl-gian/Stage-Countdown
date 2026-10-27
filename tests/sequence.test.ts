import { describe, expect, it } from 'vitest';
import { SEQUENCE, START_LEAD_MS } from '../src/lib/sequence';

// These are the owner's specified timings (2026-10-27). If you change one on purpose, change it here too.
describe('M3 hand-off timings', () => {
  it('start: shortcut, +500 black, black 1000, 1000 reveal, 2000 hold, then counting', () => {
    expect(SEQUENCE.start).toMatchObject({
      blackAfterShortcutMs: 500,
      blackHoldMs: 1000,
      revealMs: 1000,
      holdBeforeCountingMs: 2000,
    });
    expect(START_LEAD_MS).toBe(4500);
  });

  it('end: 00:00 held 10 s, then the hand-back; quit 5 s after the shortcut', () => {
    expect(SEQUENCE.end).toEqual({ holdZeroMs: 10_000, quitAfterShortcutMs: 5000 });
  });

  it('hand-back: fade to black 500, plain black 3000, shortcut, close 700 after it, OBS return 1000 after it (last)', () => {
    expect(SEQUENCE.handBack).toEqual({
      fadeToBlackMs: 500,
      blackHoldMs: 3000,
      closeAfterShortcutMs: 700,
      obsAfterShortcutMs: 1000,
    });
  });

  it('the black window outlives M3\'s fade-in, and OBS returning to the camera is the very last step', () => {
    const h = SEQUENCE.handBack;
    expect(h.closeAfterShortcutMs).toBeGreaterThanOrEqual(500); // M3 fades in over ~300 ms
    expect(h.obsAfterShortcutMs).toBeGreaterThan(h.closeAfterShortcutMs);
  });

  it('OBS: media 1000 ms after counting starts with a 1200 ms fade; the way back fades over 2000 ms', () => {
    expect(SEQUENCE.obs).toEqual({ mediaDelayAfterStartMs: 1000, mediaFadeMs: 1200, returnFadeMs: 2000 });
  });
});
