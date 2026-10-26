// Every timing of the M3 hand-off, in one place (owner-specified 2026-10-27). Change values here, not in App.tsx.
//
// START  t=0 shortcut (hide M3) -> +500 stage window goes black -> black holds 1000 (from when it came on)
//        -> 1000 transition black -> timer display (full time, not counting) -> 2000 -> countdown starts
// END    00:00 holds 10000 -> 500 fade to black -> shortcut (show M3; M3's media window opens ON TOP of
//        our black window) -> 500 -> stage window closed behind it -> app quits 5000 after the shortcut
//        if "Close StageCountdown after timer ends" is on (countdown shown on that button, click to cancel)
// STOP   same as END without the 00:00 hold, and never quits.
export const SEQUENCE = {
  start: {
    blackAfterShortcutMs: 500,
    blackFadeInMs: 300,
    blackHoldMs: 1000,
    revealMs: 1000,
    holdBeforeCountingMs: 2000,
  },
  end: {
    holdZeroMs: 10_000,
    fadeToBlackMs: 500,
    closeAfterShortcutMs: 500,
    quitAfterShortcutMs: 5000,
  },
  stop: {
    fadeToBlackMs: 500,
    closeAfterShortcutMs: 500,
  },
} as const;

/** Time from pressing Start until the countdown actually begins (excluding the shortcut itself). */
export const START_LEAD_MS =
  SEQUENCE.start.blackAfterShortcutMs +
  SEQUENCE.start.blackHoldMs +
  SEQUENCE.start.revealMs +
  SEQUENCE.start.holdBeforeCountingMs;
