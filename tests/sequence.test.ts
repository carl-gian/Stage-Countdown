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

  it('end: hold 00:00 10s, 500 to black, shortcut, close 500 later, quit 5s after the shortcut', () => {
    expect(SEQUENCE.end).toEqual({
      holdZeroMs: 10_000,
      fadeToBlackMs: 500,
      closeAfterShortcutMs: 500,
      quitAfterShortcutMs: 5000,
    });
  });

  it('OBS: media 1000 ms after counting starts with a 1200 ms fade; camera at the end with a 2000 ms fade', () => {
    expect(SEQUENCE.obs).toEqual({
      mediaDelayAfterStartMs: 1000,
      mediaFadeMs: 1200,
      cameraDelayAfterEndMs: 0,
      cameraFadeMs: 2000,
    });
  });

  it('stop mirrors the end without the hold', () => {
    expect(SEQUENCE.stop.fadeToBlackMs).toBe(SEQUENCE.end.fadeToBlackMs);
    expect(SEQUENCE.stop.closeAfterShortcutMs).toBe(SEQUENCE.end.closeAfterShortcutMs);
  });
});
