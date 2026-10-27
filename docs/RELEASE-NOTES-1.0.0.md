# Stage Countdown 1.0.0

The first release. A full-screen countdown for live meetings that runs on its own, or together with **Meeting Media Manager (M³)**
and **OBS Studio** so that people watching on Zoom see the timer too, with smooth fades and nobody switching scenes by hand.

> **Windows 10/11 (x64) only.** The M³ hand-off drives Windows windows.
> **Made with AI.** Written with the help of Claude (Anthropic) from my own specification. Please test on your own setup before a live
> meeting (checklist: `docs/TEST-CHECKLIST.md`).

## Download

- **`StageCountdown-Setup-1.0.0.exe`**: the installer. Use this one: it updates itself.
- Windows may show a blue **SmartScreen** warning because the app is not code-signed: click **More info → Run anyway**.
- Don't delete `latest.yml` from this release: installed copies read it to find updates.

## Features

### The countdown
- Big, good-looking stage display: progress ring, digits, background, colours, gradient, thickness, glow, font, size and shadow, all adjustable with a live preview.
- Count down a **length of time** (minutes and seconds) or **to a clock time** ("finish exactly at 18:30").
- Start, Pause, Resume, Restart and Stop. At 00:00 the display holds for 10 seconds (or press **Back to M³ now**), then fades out.
- Choose which screen the countdown appears on (Automatic, or pick one).
- Accurate wall-clock timing that keeps running when the window is minimized or hidden.
- Fixed, smooth start sequence: black, fade-in showing the full time, then counting begins.
- Optional **Close Stage Countdown after the timer ends**, with a visible "Closing in Ns, click to cancel" countdown.
- 12 h / 24 h clock format for the controller.

### Works with or without M³
- **Standalone mode:** switch M³ control off and it is a plain countdown. Nothing is hidden and no keyboard shortcut is sent.
- **With M³:** hides M³'s media display while the timer is up and gives it back afterwards, using M³'s own Media Window shortcut.
- **Reads the real state** of M³'s media display (Showing / Hidden / Not open), refreshed every couple of seconds, including after changes made by hand.
- **Every shortcut is verified**, retried once, and a clear red message appears if it still failed.
- **Guard while counting:** if M³'s media display comes back on top of the timer, the app hides it again automatically.
- Only brings M³ back if it was the one that hid it; closing the app while M³ is hidden restores it first.
- Toggle button to flip M³'s media display by hand.

### Optional OBS scene switching (for Zoom)
- Fades OBS to your **Media Display** scene when the countdown starts and back to your **Camera** scene when it ends or is stopped.
- Connects over OBS WebSocket (port and password configurable); finds OBS whether it is opened before or after the app.
- Supports OBS **Studio Mode**; restores your own transition and Fade duration afterwards.
- Password stored **encrypted** on your PC and never shown back in the UI.
- OBS problems never stop a countdown: they show in the "OBS:" row.
- Closing the app mid-countdown sends OBS back to the Camera scene first.

### Optional OBS dock
- A control panel inside OBS (View → Docks → Custom Browser Docks, `http://127.0.0.1:4578/dock`).
- Set the time or a clock time, Start, Pause, Resume, Restart, Stop; shows the countdown, clock, and M³, OBS and update status.
- Local only (`127.0.0.1`), and protected against other websites pressing its buttons.

### Tray, startup and schedule
- Closing or minimizing hides the window to the **system tray**; scheduling, OBS switching and the dock keep working.
- Tray menu: show/hide, Help, update, open logs folder, and a confirmed **Quit**.
- Only one copy runs; opening it again shows the running window.
- **Launch at Windows startup** and **Start hidden in the tray** (turned on automatically the first time you enable OBS switching; you can turn them off).
- **Schedule** up to two automatic countdowns per day, using the full start sequence even while the window is hidden.

### Updates and help
- **Automatic updates** from GitHub Releases: checked at every start and every few hours, downloaded quietly, and **never installed in the middle of a meeting**. A blue "Update ready" badge (app and OBS dock), a Windows notification and a tray item let you choose when; otherwise it installs on the next quit.
- **What's new** window after each update.
- **Built-in Help** (the **?** button or **F1**) with tutorials for standalone use, M³, OBS and the dock, plus troubleshooting. It opens by itself on first run.

### Reliability and privacy
- Log file with automatic rotation (tray → Open logs folder).
- Settings saved in `Documents\Stage Countdown Settings\config.txt`.
- No analytics or telemetry. The only outbound connection is the update check to GitHub Releases.
- Covered by automated tests for timings, M³ control (against a simulated M³), OBS (against a fake OBS server) and the changelog.

## Known limitations
- The Windows-specific parts (M³ hand-off, window layering, OBS, dock, tray, updates) were developed on a Mac and are not fully covered by automatic tests: run `docs/TEST-CHECKLIST.md` on the real PC first.
- Windows only. macOS is not supported.
- The portable `.exe` (test builds only) cannot update itself.
- Unsigned: Windows SmartScreen may warn on first run.
