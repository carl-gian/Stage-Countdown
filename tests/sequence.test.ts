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

  it('end: hold 00:00 10s, then fade to black 500, close the timer window, then the shortcut; quit 5s after it', () => {
    expect(SEQUENCE.end).toEqual({
      holdZeroMs: 10_000,
      fadeToBlackMs: 500,
      closeAfterFadeMs: 0,
      shortcutAfterCloseMs: 100,
      quitAfterShortcutMs: 5000,
    });
  });

  it('OBS: media 1000 ms after counting starts with a 1200 ms fade; camera at the end with a 2000 ms fade', () => {
    expect(SEQUENCE.obs).toEqual({
      mediaDelayAfterStartMs: 1000,
      mediaFadeMs: 1200,
      cameraDelayAfterEndMs: 0,
      cameraFadeMs: 2000,
      cameraFadeOnStopMs: 500,
    });
  });

  it('stop: timer window fades to black over 500 (OBS fades to camera over 500), closes, then the shortcut', () => {
    expect(SEQUENCE.stop).toEqual({ fadeToBlackMs: 500, closeAfterFadeMs: 0, shortcutAfterCloseMs: 100 });
    expect(SEQUENCE.obs.cameraFadeOnStopMs).toBe(SEQUENCE.stop.fadeToBlackMs);
  });

  it('stop and end hand back to M³ the same way (only the 00:00 hold differs)', () => {
    expect(SEQUENCE.stop.fadeToBlackMs).toBe(SEQUENCE.end.fadeToBlackMs);
    expect(SEQUENCE.stop.closeAfterFadeMs).toBe(SEQUENCE.end.closeAfterFadeMs);
    expect(SEQUENCE.stop.shortcutAfterCloseMs).toBe(SEQUENCE.end.shortcutAfterCloseMs);
  });
});
