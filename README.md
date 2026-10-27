# Stage Countdown

A full-screen countdown for live meetings. It runs on its own, or together with **Meeting Media Manager (M³)** and **OBS Studio**
so that the people watching on Zoom see the timer too, with smooth fades and nobody switching scenes by hand.

> **Windows 10/11 (x64).** The optional M³ hand-off drives Windows windows, so the app is built and tested for Windows only.

> **Made with AI.** This program was written with the help of AI (Claude, by Anthropic), working from my own specification.
> Please test it on your own setup before relying on it in a live meeting (see [Testing before a meeting](#testing-before-a-meeting)).

---

## Contents

1. [What it does](#what-it-does)
2. [Download and install](#download-and-install)
3. [Quick start (no other software needed)](#quick-start-no-other-software-needed)
4. [With Meeting Media Manager (M³)](#with-meeting-media-manager-m)
5. [With OBS and Zoom](#with-obs-and-zoom)
6. [The OBS dock](#the-obs-dock)
7. [Exactly what happens, and when](#exactly-what-happens-and-when)
8. [Tray, startup and schedule](#tray-startup-and-schedule)
9. [Updates](#updates)
10. [Settings reference](#settings-reference)
11. [Troubleshooting](#troubleshooting)
12. [Security and privacy](#security-and-privacy)
13. [For developers](#for-developers)

---

## What it does

- **A big, good-looking countdown** on the display you choose (ring, digits, colours, glow, font size: all adjustable, all live).
- **Count down a length of time** (minutes and seconds) **or to a clock time** ("finish exactly at 18:30").
- **Works with or without M³.** With M³ it hides M³'s media window while the timer is up and gives it back afterwards. Without M³ it is a plain countdown.
- **Optional OBS scene switching.** OBS feeds Zoom, so a moment after the countdown starts OBS fades to your *Media Display* scene
  (which shows the timer) and once it has ended and M³'s media display is back fades back to your *Camera* scene (or to the scene OBS was on before). Participants see the timer; the hand-off is seamless.
- **Optional OBS dock.** A small control panel inside OBS: set the time or a clock time, start, pause, stop, restart.
- **Lives in the tray.** Closing or minimizing hides it to the system tray so schedules, OBS switching and the dock keep working.
- **Automatic updates** with a blue "Update ready" badge. It never restarts by itself in the middle of a meeting.
- **Built-in Help** (the **?** button or **F1**) with tutorials for every mode.
- **Schedule** up to two automatic countdowns a day.

---

## Download and install

1. Open the [**Releases** page](../../releases/latest) and download **`StageCountdown-Setup-x.y.z.exe`**.
2. Run it. Windows may show a blue **SmartScreen** warning because the app is not code-signed: click **More info → Run anyway**.
3. Start **Stage Countdown** from the Start menu. The first time, the Help guide opens by itself.

There is also a **portable** `.exe` (no install). It works the same but **cannot update itself**; use the installer for automatic updates.

---

## Quick start (no other software needed)

1. Open **Settings** (gear icon) → **Display** and choose the screen the countdown should appear on.
   *Automatic* picks a screen other than the one the controller is on.
2. Set the minutes and seconds, or use **Countdown to Time** to finish at a clock time.
3. Press **Start**. The stage screen goes black, the timer fades in showing the full time, and a few seconds later it starts counting.
4. **Pause / Resume / Stop** whenever you like. When the time is up, `00:00` stays for 10 seconds, then the screen fades out.

To use it as a plain countdown, open **Settings → Meeting Media Manager (M³)** and switch **"Control M³'s media window"** off.
Nothing is then hidden and no keyboard shortcut is ever sent.

---

## With Meeting Media Manager (M³)

M³ shows media on a second screen. The countdown uses that same screen, so Stage Countdown hides M³'s media window, shows the timer
there, and gives the screen back to M³ when the timer ends. M³ has no remote interface, so the app sends it the same keyboard
shortcut you would press: M³'s **Media Window** shortcut (open/close the media window).

**One-time setup**

1. In **M³**: *Settings → Interface & Shortcuts* → turn on **Enable Keyboard Shortcuts** and set the **Media Window** shortcut to a
   combination you don't use for anything else (for example **Shift + Alt + F3**). Make it a *global* shortcut.
2. In **Stage Countdown**: *Settings → Meeting Media Manager (M³)* → make sure the switch is on, then click the **Shortcut** box and press the same combination.
3. Open M³ and its media window on the display you chose, then press **Start**.

M³ has two windows. The app watches **"Media Player - M³"**, the media display the audience sees, and ignores M³'s own controller
window ("Meeting media - M³"). The controller (and the OBS dock) show **M³ Media Display Shown** or **M³ Media Display Hidden**, read for real every couple of seconds.

- **Verified:** before and after every shortcut the app checks whether the media display is actually showing and retries once if the
  shortcut didn't work. If M³ still ignores it (M³ also ignores shortcuts while one of its own dialogs is open), the app hides, and later
  shows, M³'s media display directly, so it can never stay on top of the timer. It only brings M³ back if it was the one that hid it.
- **Test the shortcut:** *Settings → Meeting Media Manager (M³) → Test the shortcut* presses it once and tells you whether M³ really reacted
  (green: works; amber: M³ ignored it but the direct method works; red: neither worked), then puts M³ back as it was.
- M³'s own controller window ("Meeting media - M³") is never touched or brought forward.
- **Guard while a countdown runs:** if M³'s media display ever comes back on top of the timer, the app hides it again
  ("M³ was showing on top of the timer — hid it again"). If nothing can hide it, the guard stops after a few tries with a clear message instead
  of hammering the keyboard. To really show M³ mid-countdown, press **Stop** first.
- **Toggle** sends the shortcut right now (shows it if hidden, hides it if showing).
- If M³ can't be reached the countdown still runs. Closing the app while it has M³ hidden brings M³ back first.

---

## With OBS and Zoom

OBS is what Zoom participants see. With **OBS Scene Switching** on, the app changes OBS scenes for you.

**In OBS**

1. *Tools → WebSocket Server Settings* → tick **Enable WebSocket server**. Note the port (default **4455**) and set a password if you like.
2. Make a **Media Display** scene that shows the countdown screen (for example a *Display Capture* of that screen).
3. Keep your normal camera scene as the **Camera** scene.

**In Stage Countdown**

1. *Settings → OBS Scene Switching* → switch it on and enter the same port and password.
2. When OBS is detected the status turns green (**Connected to OBS**) and your scenes appear in the drop-downs. Choose the *Media Display* and *Camera* scenes. Or choose **"The scene OBS was on before the countdown"** as where OBS goes back to: the app remembers the scene OBS was on when the countdown took over and returns to it (the Camera scene is then only a fallback).
3. Press **Start**.

| When | What OBS does |
|---|---|
| 1 second after the timer starts counting | Fades to the **Media Display** scene (1.2 s fade) |
| The countdown ends (after the `00:00` hold) or you press **Stop** | Nothing yet: the timer window fades to black and M³'s media display comes back first |
| 1 second after M³'s media display is back | Fades back (2 s fade) to the **Camera** scene, or the scene OBS was on before. **This is always the last step.** |
| You press **Stop** within a second of the count starting | The Media Display switch is cancelled; in "previous scene" mode OBS is left exactly where it was |
| You close the app mid-countdown | OBS is sent back first |
| You move OBS to another scene yourself during the countdown | "Previous scene" mode leaves your choice alone |

Good to know:

- The app looks for OBS every few seconds, so OBS can be opened before or after the app. A wrong password is reported clearly.
- OBS **Studio Mode** works. Your own transition type and Fade duration are put back afterwards.
- OBS problems never stop a countdown; the **OBS:** row on the controller shows what's wrong.
- Turning this on also switches on **Launch at Windows startup** and **Start hidden in the tray**, so scene switching and the dock are ready without anyone opening the app. You can turn those off again in *Settings → Startup & Schedule*.

---

## The OBS dock

When OBS scene switching is on, the app also serves a small control panel for OBS. It does exactly what the main window does: set the
minutes and seconds (or a clock time to finish at), then Start / Pause / Resume / Restart / Stop. It also shows the countdown, the
clock, and the M³, OBS and update status.

**Add it to OBS (once)**

1. In OBS: **View → Docks → Custom Browser Docks**.
2. **Dock Name:** `Stage Countdown`. **URL:** `http://127.0.0.1:4578/dock` (Settings → OBS Scene Switching has a **Copy** button).
3. Click **Apply**, then drag the dock wherever you like.

The dock only works while Stage Countdown is running (it can be hidden in the tray). It listens only on this PC (`127.0.0.1`).

---

## Exactly what happens, and when

All timings live in one file, [`src/lib/sequence.ts`](src/lib/sequence.ts), and are locked by tests.

**Start**

| Time | What happens |
|---|---|
| 0 s | M³'s shortcut is sent (hides M³'s media display, verified; from now on the guard keeps it hidden) |
| +0.5 s | The stage screen fades to black |
| +1.5 s | Black has been held for 1 s |
| +1.5 s → +2.5 s | 1 s transition to the timer display, showing the full time (not counting) |
| +4.5 s | The countdown starts counting |
| +5.5 s | *(OBS on)* OBS fades to the Media Display scene |

**End**

| Time | What happens |
|---|---|
| 0 s | `00:00`, a heartbeat pulse, held for 10 s |
| +10 s | *(or press **Back to M³ now**)* the timer window fades to black (0.5 s) |
| +10.5 s → +13.5 s | Plain black for 3 s |
| +13.5 s | M³'s shortcut is sent: M³'s media display fades in **on top of** the black window; the app checks it really came back |
| +14.2 s | The (now hidden) timer window closes underneath M³ |
| +14.5 s | *(OBS on)* OBS fades (2 s) back to the Camera scene or the previous scene: **the last step** |
| +18.5 s | If **Close Stage Countdown after timer ends** is on, the app quits (5 s after the shortcut; the button counts down, click it to cancel). **This option is unavailable (locked off) while the app is connected to OBS**, because OBS scene switching and the dock need the app running. |

**Stop** is the same hand-back, starting straight away with no 10-second hold, and it never quits the app. With M³ control switched off the 3-second black hold is skipped.

---

## Tray, startup and schedule

- **Closing (✕) or minimizing hides the window to the tray.** Click the tray icon to show/hide it. Right-click it for Help, update, logs and **Quit**.
- Only **Quit** (tray menu) really closes the app, and it asks first.
- Only one copy runs; starting it again just shows the running window.
- *Settings → Startup & Schedule*: start with Windows, start hidden in the tray, and up to two automatic countdowns per day (they run the full start sequence, even while the window is hidden).

---

## Updates

- The app **checks GitHub Releases every time it starts** (and every few hours while it stays open) and downloads a new version quietly.
- When it's ready you get a blue **"Update ready"** badge at the top of the app (and in the OBS dock), a Windows notification, and a **Restart to update** item in the tray menu.
- It is **never installed in the middle of a meeting on its own**. Choose when, or it installs the next time you quit.
- After an update the app opens once and shows **What's new**.
- The portable `.exe` can't update itself.

---

## Settings reference

| Section | What it does |
|---|---|
| **Live preview** | The real stage display, so colours/size look exactly like the stage |
| **Display** | Which screen the countdown uses (*Automatic*, or pick one) |
| **Meeting Media Manager (M³)** | On/off switch for the M³ hand-off and the shortcut to send |
| **OBS Scene Switching** | Enable, WebSocket port and password, Media Display and Camera scenes, where OBS goes back to (Camera scene or the previous scene), the dock address and instructions |
| **Startup & Schedule** | Start with Windows, start hidden in the tray, scheduled countdowns |
| **Background / Track ring / Progress ring / Digital text** | Colours, gradient, thickness, glow, font, size, shadow |
| **Clock format** | 12 h / 24 h for the controller clock |
| **About & updates** | Version, check for updates, What's new, Help, open logs folder |

Settings are saved in `Documents\Stage Countdown Settings\config.txt`. Logs are in `%APPDATA%\stagecountdown\logs`
(tray menu → **Open logs folder**).

---

## Troubleshooting

| Problem | What to check |
|---|---|
| Nothing on the stage screen | *Settings → Display*. If you only have one screen, pick it explicitly. |
| M³ doesn't hide/show, or is on top of the timer | The shortcut must be identical in both apps; M³ must be open with keyboard shortcuts enabled. The **M³ Media Display** badge shows what M³ is really doing and a red message names the problem. During a countdown the app hides M³ again by itself. |
| "OBS not detected" | OBS must be open with *Tools → WebSocket Server Settings → Enable* on, same port and password. Press **Refresh** in Settings. |
| "Wrong password" | Re-enter the OBS WebSocket password in Settings. |
| The dock says "App not responding" | Stage Countdown isn't running, or OBS WebSocket/dock port 4578 is blocked; check *Settings → OBS Scene Switching → Dock is running*. |
| No update badge | The portable build never updates. The installed app checks at start; use *Settings → About & updates → Check for updates*. |
| Anything else | Tray menu → **Open logs folder** and look at `stagecountdown.log`. |

### Testing before a meeting

The Windows-specific parts (M³ hand-off, window layering, OBS, dock, tray, updates) can't be fully covered by automatic tests. Run
[`docs/TEST-CHECKLIST.md`](docs/TEST-CHECKLIST.md) on the real PC before relying on it live.

---

## Security and privacy

- The OBS password is stored **encrypted on your PC** (Windows data protection) and is never shown or sent back to the UI.
- The OBS connection and the dock are **local only** (`127.0.0.1`). The dock refuses requests addressed to other host names and
  refuses commands that don't carry its own header, so other websites in a browser can't press its buttons.
- The app makes one outbound connection: the update check to GitHub Releases.
- No analytics or telemetry.

---

## For developers

Electron + React + Vite + Tailwind. The main-process code is plain CommonJS in [`electron/`](electron/); the UI is in [`src/`](src/).
[`CLAUDE.md`](CLAUDE.md) is the detailed project brief (architecture, timing rules, pitfalls).

```
npm install
npm run electron:dev   # build and launch (Windows)
npm run dev            # UI only, in a browser (no Electron features)
npm test               # vitest
npm run typecheck
npm run lint
npm run build:win      # installer + portable .exe in release/
```

Every push to any branch builds a Windows test copy in GitHub Actions (see [`docs/RELEASING.md`](docs/RELEASING.md)).
Releasing: add a `src/lib/changelog.ts` entry, bump `version` in `package.json`, tag `vX.Y.Z`.
