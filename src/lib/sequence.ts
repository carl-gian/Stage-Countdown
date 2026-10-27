// Every timing of the M3 / OBS hand-off, in one place (owner-specified). Change values here, not in App.tsx.
//
// START  t=0 shortcut (hide M3's media display, verified) -> +500 stage window goes black -> black holds 1000
//        -> 1000 transition to the timer display (full time, not counting) -> 2000 -> countdown starts.
//        From the first shortcut until the hand-back, a GUARD re-sends the shortcut if M3's media display
//        ever comes back on top of the timer. (OBS, optional: 1000 after counting starts it fades to the Media scene.)
// END    00:00 holds 10000 -> HAND-BACK.        STOP   Stop pressed -> HAND-BACK straight away.
//
// HAND-BACK (end and stop) - built so the way back is SMOOTH and OBS's return to the camera is the LAST thing:
//   t=0     the timer window fades to black (500)
//   +3500   after 3000 of plain black, the shortcut brings M3's media display back (M3 fades in over our black window)
//   +4200   700 after the shortcut (M3 is fully in) our black window is closed, underneath M3
//   +4500   1000 after the shortcut, OBS (optional) fades back to the Camera scene or the scene it was on before (2000)
//   +8500   if "Close StageCountdown after timer ends" is on, the app quits 5000 after the shortcut
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
    quitAfterShortcutMs: 5000,
  },
  handBack: {
    fadeToBlackMs: 500,
    /** Plain black after the fade, before M3's media display is brought back (skipped when M3 control is off). */
    blackHoldMs: 3000,
    /** Our black window stays up until M3 has fully faded in on top of it. */
    closeAfterShortcutMs: 700,
    /** OBS goes back to Camera / the previous scene this long after the shortcut: the very last step. */
    obsAfterShortcutMs: 1000,
  },
  // Optional OBS scene switching (Settings > OBS Scene Switching) so Zoom participants see the timer.
  obs: {
    /** 1000 ms after the countdown starts counting, fade to the Media Display scene over 1200 ms. */
    mediaDelayAfterStartMs: 1000,
    mediaFadeMs: 1200,
    /** The way back (Camera scene, or the scene OBS was on before) fades over 2000 ms. */
    returnFadeMs: 2000,
  },
} as const;

/** Time from pressing Start until the countdown actually begins (excluding the shortcut itself). */
export const START_LEAD_MS =
  SEQUENCE.start.blackAfterShortcutMs +
  SEQUENCE.start.blackHoldMs +
  SEQUENCE.start.revealMs +
  SEQUENCE.start.holdBeforeCountingMs;
