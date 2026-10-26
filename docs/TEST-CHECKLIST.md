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

## Sequence timing (2026-10-27)
- [ ] Start: M³ hides; ~0.5 s later the stage display goes black; ~1 s later the timer fades in showing the full time; ~2 s later it starts counting.
- [ ] End: 00:00 stays 10 s ("Back to M³ now" skips it) -> fades to black -> M³'s media comes back ON TOP of the black screen -> no flash when our window closes behind it.
- [ ] With "Close StageCountdown after timer ends" on: the button counts "Closing in 5s…" and the app quits; clicking the button during the count cancels it.
- [ ] The stage display never takes keyboard focus and clicks on that display reach M³ while no countdown is running.
- [ ] Pause then Restart: restarts immediately without hiding/showing M³ again.
- [ ] Settings: colour / ring / glow / shadow / font-size changes show identically in the Settings preview, the controller and the stage.
- [ ] Settings > Startup & Schedule: change a schedule option after changing a colour, restart the app: both are kept.

## OBS scene switching (optional)
In OBS: Tools -> WebSocket Server Settings -> enable (note port and password). Make a Media Display scene (shows the stage display) and a Camera scene.
- [ ] Settings > OBS Scene Switching: turn it on with OBS closed: "OBS not detected". Open OBS: it turns to "Connected" by itself within a few seconds and the scenes appear.
- [ ] Wrong password: "OBS found, but the password is wrong". Correct it: connects. Close and reopen the app: the password is remembered (the box shows "saved", never the password).
- [ ] Choose the two scenes. Start a countdown: ~1 s after it starts counting OBS fades (1.2 s) to Media Display; Zoom sees the timer.
- [ ] When the timer ends OBS fades (2 s) back to the Camera scene while the room still sees 00:00.
- [ ] Stop mid-count: OBS returns to the Camera scene. Close the app mid-count: OBS returns to the Camera scene.
- [ ] Studio Mode ON in OBS: it still switches correctly. Your own transition type and Fade duration in OBS are unchanged afterwards.
- [ ] Quit OBS mid-countdown: the countdown carries on; the "OBS:" row shows it is looking again; nothing crashes.
