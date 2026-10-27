# Stage Countdown 1.0.4

A small update to 1.0.3. Installed copies update themselves: look for the blue **Update ready** badge, then restart when you are not in
the middle of a meeting.

## What's new

- **Fixed: the minutes and seconds boxes could be squashed or hidden.** With the update badge, the M³ row and the OBS row showing, the
  controller ran out of room and the time boxes were crushed behind the ring. The ring now measures the space that is left and fits it,
  and the window can no longer be made too short.
- **"Close Stage Countdown after the timer ends" is unavailable while connected to OBS.** OBS scene switching and the OBS dock need the app
  to keep running, so the two options conflicted. While the app is connected to OBS the button shows a lock and the option is switched off.
  It works as before when OBS isn't connected.

## Download

- **`StageCountdown-Setup-1.0.4.exe`**: the installer. Use this one: it updates itself.
- Windows may show a blue **SmartScreen** warning because the app is not code-signed: click **More info → Run anyway**.
- Don't delete `latest.yml` from this release: installed copies read it to find updates.

Everything else is as described in the [1.0.2 release notes](https://github.com/carl-gian/Stage-Countdown/releases/tag/v1.0.2).
