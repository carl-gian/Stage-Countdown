# Stage Countdown 1.0.5

A fix for the Meeting Media Manager (M³) hand-off, found from a real log. Installed copies update themselves: look for the blue
**Update ready** badge, then restart when you are not in the middle of a meeting.

## What's new

- **M³'s media display can no longer stay on top of the timer.** If M³ ignores the shortcut (it also ignores shortcuts while one of its own
  dialogs is open), the app now hides, and later shows, M³'s media display directly.
- **No more shortcut flood.** Before, a shortcut M³ did not react to was re-sent every few seconds for as long as the countdown ran. Now it
  tries twice, then uses the direct method, and the guard gives up with a clear message if nothing works.
- **New "Test the shortcut" button** in *Settings → Meeting Media Manager (M³)*. It presses the shortcut once, tells you whether M³ really
  reacted (green / amber / red, with what to check), and puts M³ back as it was.
- **M³'s own controller window is left completely alone.** The app no longer brings it forward (the shortcut is global). Shortcuts are
  also now sent like a real keyboard.
- **Better logs.** The log says exactly which shortcut was sent and which windows were found.

## Download

- **`StageCountdown-Setup-1.0.5.exe`**: the installer. Use this one: it updates itself.
- Windows may show a blue **SmartScreen** warning because the app is not code-signed: click **More info → Run anyway**.
- Don't delete `latest.yml` from this release: installed copies read it to find updates.

Everything else is as described in the [1.0.2 release notes](https://github.com/carl-gian/Stage-Countdown/releases/tag/v1.0.2).
