# Test checklist (Windows, with Meeting Media Manager running)

Automated tests cannot cover the M³ hand-off, so run this on the real PC after any change to `electron/` or `App.tsx`.

- [ ] App opens; Settings shows the saved display and hide/show shortcut.
- [ ] Start: M³'s media hides, the stage window appears on the chosen display, the timer counts down.
- [ ] Stop mid-count: stage fades out and closes, M³'s media comes back, the app stays open.
- [ ] Let a short timer finish: pulse, fade, M³'s media returns; with "Close after timer ends" on, the app quits.
- [ ] Change the shortcut in Settings, restart the app: the new shortcut is used and remembered.
- [ ] Schedule on with a time 2 minutes ahead: the timer starts by itself once, then not again that minute.
- [ ] Start minimized / launch at startup behave as set.
- [ ] Start with the stage window closed (e.g. right after a previous run): it reopens on the saved display by itself.
- [ ] Stop M³ from being focusable (close M³) and press Start: an error shows in the "M³ media" row; the countdown still runs.
- [ ] Minimize the controller, schedule a start: the stage countdown keeps ticking and completes on time.
- [ ] Close the controller window while the countdown runs: M³'s media comes back before the app exits.
- [ ] "Countdown to Time": pick a time 3 min ahead, wait 1 min, press Start: it ends exactly at that time.
- [ ] Press Start during the end sequence: nothing happens (no double toggle). "Toggle" / "Fix label" fix a desynced M³.
- [ ] Timer end: two heartbeat pulses, fade to black, M³ back. Glow, track ring and text shadow settings show on the stage.
