# Stage Countdown 1.2.0

A full-screen countdown for live meetings that runs on its own, or together with **Meeting Media Manager (M³)** and **OBS Studio**
so people watching on Zoom see the timer too. Windows 10/11 (x64) only. Made with AI (Claude): please test on your own setup before a
live meeting (`docs/TEST-CHECKLIST.md`).

## Download
- **`StageCountdown-Setup-1.2.0.exe`**: the installer (updates itself). Windows SmartScreen may warn because the app is unsigned: **More info → Run anyway**.
- Keep `latest.yml` on this release: installed copies read it to find updates.

## What's new since 1.0.0
- **New "Steward" look:** redesigned stage display, controller, settings, help and OBS dock.
- **Smoother hand-back to M³:** the timer fades to black and holds black for 3 s, M³'s media display fades in over it, the timer window closes behind it, and OBS fades back last.
- **OBS can return to the previous scene** (the one it was on before the countdown) instead of the Camera scene.
- **M³ reliability:** if M³ ignores the shortcut the app hides/shows its media display directly; no more shortcut flood; the guard gives up with a clear message; the controller window is selected before the key press; new **Test the shortcut** button; clearer logs.
- **Start hidden in the tray while OBS switching is on** (option in OBS settings); the window still shows after an update or on first run.
- **Close after the timer ends** is locked while connected to OBS (the dock and scene switching need the app running).
- **Fixes:** ring glow no longer cut off in a square; minutes/seconds boxes can't be squashed or hidden; settings load and save reliably; the M³ badge reads "M³ Media Display Shown/Hidden".
- README now has screenshots and demo animations.

## Features
- **Countdown:** customizable stage display (ring, digits, colours, glow, font), count a length of time or **to a clock time**, Start/Pause/Resume/Restart/Stop, 10 s hold at 00:00, choice of screen, accurate wall-clock timing even when minimized.
- **With or without M³:** reads the real state of M³'s media display, verifies every shortcut, keeps M³ hidden while counting (guard), and only restores it if it hid it. Standalone mode sends nothing.
- **OBS scene switching (optional):** fades to your Media Display scene and back, Studio Mode supported, password stored encrypted.
- **OBS dock (optional):** control the timer from inside OBS (`http://127.0.0.1:4578/dock`), local only.
- **Tray, startup and schedule:** lives in the tray, launch with Windows, up to two scheduled countdowns a day.
- **Updates and help:** automatic updates that never install mid-meeting, What's new window, built-in Help (? or F1).
- **Privacy:** no telemetry; the only outbound connection is the update check to GitHub Releases.

## Known limitations
- The Windows-specific parts were developed on a Mac and not fully covered by automatic tests: run the test checklist on the real PC first.
- Windows only. The portable `.exe` (test builds) cannot update itself.
