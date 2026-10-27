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

## Release features (tray, startup, dock, updates, help, standalone)
- [ ] Close (X) and minimize both hide the window to the tray and remove it from the taskbar. Clicking the tray icon shows/hides it. Tray > Quit asks first.
- [ ] Start the app twice: the second start just shows the running window.
- [ ] Turn OBS scene switching on: "Launch at Windows startup" and "Start hidden in the tray" are switched on in Startup & Schedule. Restart Windows: the app is in the tray, not on screen, and the dock/OBS switching work.
- [ ] Settings > M³ > switch "Control M³'s media window" off: the "M³ media" row disappears; Start runs the same fade sequence and M³ is never touched; Stop/finish never sends a shortcut.
- [ ] OBS dock: add it in OBS (View > Docks > Custom Browser Docks, http://127.0.0.1:4578/dock). Set the time, Start, Pause, Resume, Stop, "Start at time", Restart: each behaves exactly like the main window (including the M³ and OBS hand-offs). "Open app" shows the window.
- [ ] Dock shows the countdown, the clock, M³/OBS badges, and the blue update badge. Quit the app: the dock says "App not responding".
- [ ] Help: ? button and F1 open the guide; every tab reads correctly; first-ever start opens it by itself.
- [ ] Updates: install an older version, publish a newer one: within a few seconds of the next start the blue "Update ready" badge appears in the app AND the dock, with a Windows notification; clicking it asks first; after restart "What's new" shows once. The portable build says it cannot update itself.

## M³ media display detection and the new hand-back order
- [ ] With M³'s media window open and showing, the badge says **M³ Media Display Shown**; hide M³'s media window by hand: within ~2 s it says **M³ Media Display Hidden** (closing it also says Hidden).
- [ ] Start: M³'s media display hides (row turns Hidden) and the timer appears on that screen. Nothing of M³ is visible on top.
- [ ] While the timer is RUNNING (and while paused): bring M³'s media display back by hand (or let M³ show media). Within ~1.5-3 s it is hidden again and the row says "M³ was showing on top of the timer — hid it again".
- [ ] Press **Stop** mid-count: the timer window fades to black over 0.5 s (OBS, if on, fades to the Camera scene over 0.5 s), the window closes, then M³'s media display comes back. No desktop flash that lasts more than a blink.
- [ ] Let a timer finish: 00:00 stays 10 s, then the same hand-back (fade to black, close, M³ comes back). With auto-close on, the app quits 5 s after M³ is back.
- [ ] Wrong shortcut in Stage Countdown (different from M³'s): the row shows a red "still showing after sending the shortcut" message and the countdown still runs.
- [ ] If M³'s media window was already hidden before Start, it stays hidden afterwards (the app only brings back what it hid).
- [ ] M³ controller ("Meeting media - M³") on the operator screen is not moved or hidden by the app (it may be brought forward when the shortcut is sent).

## 1.0.2: smoother hand-back and "previous scene"
- [ ] Press Stop mid-count (and let one finish): the timer fades to black, the screen stays plain black ~3 s, M³'s media display fades IN over the black (no desktop, no cut), the timer window disappears underneath, and ~1 s after M³ is back OBS fades to the camera. Nothing about it feels abrupt.
- [ ] If M³'s fade is on (M³ Settings > Enable Media Window Fade Transitions) it is smoother still. Note any step that still looks abrupt and which one.
- [ ] Zoom (via OBS) keeps showing the timer/black until M³ is back; the camera comes back last.
- [ ] OBS "previous scene" mode: put OBS on any scene (not the camera), Start: OBS fades to Media Display and the controller's OBS row names the remembered scene. After the countdown OBS returns to THAT scene, not the Camera scene.
- [ ] Previous-scene mode: switch OBS by hand to another scene mid-countdown: at the end OBS stays where you put it. Press Stop within the first second: OBS never moved and stays where it was.
- [ ] Camera-scene mode (default) still returns to the Camera scene.

## 1.0.4: controller layout and auto-close vs OBS
- [ ] Open the app at its default size (and drag the window shorter, down to its minimum) with the update badge, the M³ row and the OBS row all showing: the minutes and seconds boxes (with + and -) stay fully visible, the ring shrinks to fit, and Start is always in view.
- [ ] OBS scene switching on and OBS connected: the "Close after timer ends" button shows a lock and cannot be clicked; if it was on, it turns itself off when OBS connects.
- [ ] OBS closed or scene switching off: the button works again and the app still quits after a countdown when it is on.

## 1.0.5: M3 shortcut test and fallback
- [ ] Settings > M³ > **Test the shortcut** with M³'s media window open and showing: green "It works" (M³ briefly hides and is put back). Then with a wrong shortcut typed in Stage Countdown: amber "M³ ignored ... direct method works".
- [ ] With the shortcut deliberately different from M³'s: Start still hides M³'s media display (a "hidden directly" note appears), the timer is never covered, and at the end M³'s media display comes back.
- [ ] While counting, bring M³'s media display back by hand: it is hidden again within a few seconds, and the log shows only a few presses (not one every few seconds forever).
- [ ] Open the log (tray > Open logs folder): each M³ action shows "sending the shortcut Alt + Shift + F3 (virtual key 114)" and, on failures, the list of windows found. No "FAIL focus" / "nowindow" lines any more.
- [ ] M³'s own controller window ("Meeting media - M³") is never brought forward or moved by the app.
