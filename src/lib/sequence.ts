// Every timing of the M3 hand-off, in one place (owner-specified). Change values here, not in App.tsx.
//
// START  t=0 shortcut (hide M3's media display, verified) -> +500 stage window goes black -> black holds 1000
//        -> 1000 transition to the timer display (full time, not counting) -> 2000 -> countdown starts.
//        From the first shortcut until the hand-back, a GUARD re-sends the shortcut if M3's media display
//        ever comes back on top of the timer.
// END    00:00 holds 10000 -> hand-back (below). OBS (optional) fades to the Camera scene (2000) when the timer ends.
// STOP   Stop pressed -> hand-back (below). OBS (optional) fades to the Camera scene (500) at the same moment.
// HAND-BACK (end and stop): the timer window fades to black over 500 -> it is closed -> a moment later the shortcut
//        brings M3's media display back (verified). Auto-close quits 5000 after that shortcut, with a countdown on its button.
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
    closeAfterFadeMs: 0,
    shortcutAfterCloseMs: 100,
    quitAfterShortcutMs: 5000,
  },
  // Optional OBS scene switching (Settings > OBS Scene Switching) so Zoom participants see the timer.
  // Media: 1000 ms after the countdown starts, fade to the Media Display scene over 1200 ms.
  // Camera: the moment the countdown ends, fade back to the Camera scene over 2000 ms.
  obs: {
    mediaDelayAfterStartMs: 1000,
    mediaFadeMs: 1200,
    cameraDelayAfterEndMs: 0,
    cameraFadeMs: 2000,
    // Stop pressed: the timer window fades to black over 500, so OBS fades to the Camera scene over 500 too.
    cameraFadeOnStopMs: 500,
  },
  stop: {
    fadeToBlackMs: 500,
    closeAfterFadeMs: 0,
    shortcutAfterCloseMs: 100,
  },
} as const;

/** Time from pressing Start until the countdown actually begins (excluding the shortcut itself). */
export const START_LEAD_MS =
  SEQUENCE.start.blackAfterShortcutMs +
  SEQUENCE.start.blackHoldMs +
  SEQUENCE.start.revealMs +
  SEQUENCE.start.holdBeforeCountingMs;
