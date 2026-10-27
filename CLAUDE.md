# CLAUDE.md — Stage Countdown

Project brief for Claude Code. Stage Countdown is an Electron + React (Vite, Tailwind) app that puts a full-screen
countdown on a stage display and hides/shows the **Meeting Media Manager (M³)** media window around it.

---

## 0. Working with the owner (read first)

- The owner (Gi) is **not a developer**. For anything involving a terminal, installs, or running code, give **step-by-step
  novice instructions**: what to click, what to type, what output to expect.
- Be candid. If a requested change would risk the live meeting flow, say so before doing it.
- Never change the start/stop/complete **sequences or their delays** (Section 2) without asking.
- Keep replies concise; put detail in code comments and docs, not chat.
- The app targets **Windows 10/11 x64** (it drives M³ through PowerShell + Win32). The owner develops on a Mac, so the
  Windows-only parts cannot be run here: say clearly what was and wasn't verified.
- `OTHER APP SOURCE CODE/` holds the M³ source for **reference only**. It is git-ignored; never edit or upload it.

---

## 1. How M³ is controlled (electron/m3.cjs, tested against a simulated M³ in tests/m3.test.ts)

M³ has TWO windows: the MEDIA window **"Media Player - M³"** (audience-facing, covers the stage: this is the one we detect;
`config.m3MediaWindowTitle` = `Media Player - M`) and its own controller **"Meeting media - M³"** (`m3WindowTitle`), which is never used to decide whether M³ is showing but IS selected
(brought to the front: `Focus` in the PS script attaches to the foreground and target threads, BringWindowToTop, SwitchToThisWindow, and
verifies) just before the shortcut is pressed, as the original PowerShell tool did. If it cannot be selected (log: `controller window: FAIL
focus|nowindow`) the shortcut is sent anyway. `m3.focusController = false` turns the selection off.

How M³ handles the shortcut (from M³'s source): `shortcutMediaWindow` → `toggleMediaWindowVisibility()` flips M³'s INTERNAL
`mediaWindowVisible` flag, and `executeShortcut` ignores it while any M³ dialog is open. So a press can silently do nothing.

M³'s "Media Window" shortcut is a TOGGLE, so we never trust a remembered state:
- The resident PowerShell worker (`PS_SCRIPT` in `main.cjs`) answers `state|<title>` with `shown | hidden | none` by reading the real
  window (visible, not minimized, not faded to ~0 opacity; hidden windows still count as existing).
- `hide()`: if showing, send the shortcut, wait for it to actually hide, retry once; if M³ still ignores it, **hide the window directly**
  (Win32 `ShowWindow`, `m3.directFallback`, default on; PS commands `hide|` / `show|`, `windows|` lists matches for the log) and remember
  `hiddenVia='window'` so `show()` shows it directly too (M³ never knew). `show()`: only if WE hid it (`needsRestore`), verified.
  `toggle()` flips whatever is on screen. `test()` (Settings button) presses once and reports shortcut-ok / direct-only / nothing-works.
  All serialized in one queue. Every press is logged with the shortcut in words (`describeShortcut`).
- Keys are injected with scan codes and gentle timing (`Send-Key` in the PS script).
- **Guard:** `m3-guard` on = every 1.5 s re-read the state and, if the media display is showing, hide it again (note shown in the row).
  After a failed cycle it backs off (5 s × failures) and gives up after 3 failed cycles with a clear note, so it never floods the
  keyboard. On from the first hide until the hand-back begins (App.tsx).
- A 2 s background refresh keeps the "M³ Media Display Shown / Hidden" badge truthful (also after changes made by hand). The wording lives in `src/lib/m3label.ts` (tested); "not open" counts as Hidden.
- Only if the state cannot be read (non-Windows, worker down) does it fall back to the old remembered toggle ("(assumed)").
- Closing the controller while we hold M³ hidden restores it first. `m3.enabled = false` = standalone: nothing is read or sent.

## 2. Sequences (src/App.tsx) — owner-specified timings, all in `src/lib/sequence.ts`

All run under one lock (`busyRef`), so two M³ toggles can never overlap. `tests/sequence.test.ts` pins the values:
if you change one on purpose (owner's request only), update the test too.

| Event | Steps |
|---|---|
| Start (manual / scheduled / Countdown to Time) | stage window opened invisibly → **shortcut** (hide M³, verified; guard on) → +500 ms stage goes black (300 ms fade) → black for 1000 ms → 1000 ms transition to the timer showing the full time → 2000 ms → counting starts (4.5 s after the shortcut) |
| Complete | 00:00 held **10 s** (heartbeat at the start; "Back to M³ now" skips) → HAND-BACK |
| Stop | stop timer → HAND-BACK straight away |
| HAND-BACK (end and stop) | guard off → timer window fades to black (500 ms) → **plain black 3000 ms** (skipped if M³ control is off) → **shortcut** (M³'s media display fades in OVER our black window, verified) → our window closed 700 ms after the shortcut → OBS (optional) fades back 1000 ms after the shortcut (2000 ms fade): the LAST step |
| Auto-close | if "Close StageCountdown after Timer ends" is on: the app quits **5 s after that shortcut**; the button shows "Closing in Ns · click to cancel". **Unavailable while connected to OBS** (`src/lib/autoClose.ts`): the button is locked and forced off, and main's `close-app` refuses too. |
| Restart while paused | restarts in place (stage already up, M³ already hidden) — no sequence |

"Countdown to Time" is sized when counting actually begins, so it still ends exactly on the target.
Stacking: our stage window is always-on-top at the default "floating" level; M³'s fullscreen media window uses
"screen-saver", which is higher — so if M³'s media display is showing it covers the timer (that is what the guard prevents).
The stage window is non-focusable, ignores the mouse and is not in the taskbar.

The clock is wall-time (`endsAt = Date.now() + ms`) driven by timers, not rAF, and both windows have `backgroundThrottling:
false`, so it keeps running when minimized. The stage gets `{state, totalMs, remainingMs, endsAt, visual, blackout}` only when
something changes and paints its own ring/digits straight to the DOM (no React renders while running). A new stage window is
replayed the last state on load.

## 2b. OBS scene switching (optional, off by default)

`electron/obs.cjs` talks obs-websocket v5 on `ws://127.0.0.1:<port>` (JSON protocol, `obs-websocket-js/json`). Purpose: OBS feeds
Zoom, so participants see the timer (Media Display scene) and then the camera again, with no manual switching.
- Settings > OBS Scene Switching: enable, port (4455), password, pick the two scenes. The app retries every 4 s while OBS isn't
  running ("detects" the server); a wrong password stops retrying until settings change.
- The password is sealed with Electron `safeStorage` in `config.txt` (`obsPasswordEnc`) and is never sent to the renderer
  (`get-config` strips it; `set-config` ignores it; only `obs-save-settings` writes it).
- Switching uses the "Fade" transition with the requested duration, handles Studio Mode (preview + Transition), skips if OBS is
  already on that scene, then restores the operator's own transition AND the Fade's own duration (OBS keeps one duration per
  transition). Calls are queued so two switches never interleave. Closing the app while on the media scene sends OBS back to Camera.
- `obs.returnMode`: `'camera'` (default) or `'previous'`. In `'previous'` mode `obs.cjs` remembers OBS's program scene when it switches to the media scene (`previousScene`, shown in status) and returns to it; it skips (leaves OBS alone) if nothing was remembered or the operator moved OBS elsewhere, and falls back to the Camera scene only if the remembered scene was deleted. The renderer calls `obsSwitch('return', ms)`.
- OBS problems never stop a countdown: they show in the "OBS:" row of the controller. Timings: `SEQUENCE.obs` (pinned by tests).
- `tests/obs.test.ts` runs the module against a fake OBS server; run real-OBS checks from `docs/TEST-CHECKLIST.md`.

## 2c. Release features (tray, dock, updates, help)

- **Tray:** the controller window hides on close AND minimize (`quitting` flag in `main.cjs`); only tray **Quit** (confirmed) or the
  auto-close countdown (`close-app`) really quits. Single-instance lock; second launch shows the window. Tray icon is
  `resources/icon.ico` when packaged (electron-builder `extraResources`) and `build/icon.ico` in dev.
- **Start hidden / autostart:** `startMinimized` now means "start hidden in the tray". Turning OBS scene switching ON also sets
  `autoLaunch` + `startMinimized` (once, on the off→on change; the user can turn them off afterwards).
- **First run / update:** `launchKind(lastSeenVersion, version)` (logic.cjs). First run opens Help; after an update the window is
  shown even if "start hidden" is on and the What's new dialog opens; `ack-version` records it. `src/lib/changelog.ts` needs an entry for
  every `package.json` version (a test enforces it).
- **Auto-update:** `electron/updater.cjs` (electron-updater, GitHub Releases). Checks 8 s after every start and every 6 h; downloads
  quietly; NEVER installs on its own (badge in the app + dock, Windows notification, tray item; or on quit). Disabled in dev and in
  the portable build. If the repo is renamed/moved, change `build.publish` in package.json. The repo must be public.
- **OBS dock:** `electron/dock.cjs` + `dock-page.cjs`, `http://127.0.0.1:4578/dock`, started only while OBS switching is on. It is a
  remote control: commands (`start/startAt/setTime/pause/resume/stop/restart/skip`) are validated (`parseCommand`) and forwarded to
  the controller window (`dock-command`), which runs the same handlers as its buttons. The controller pushes its state
  (`dock-state`) on every change; the page computes the countdown locally from `endsAt`. POSTs need `X-Stage-Dock: 1`; Host is checked.
- **M³ optional:** `config.m3.enabled` (default true). When off, `setM3Hidden` is a no-op and the controller hides the M³ row.
- **Help:** content is data in `src/lib/help.ts`, rendered by `HelpModal` (F1 / ? button / tray → Help).
- Logs: `userData/logs/stagecountdown.log` (rotated at 1 MB).

## 3. Code map

```
electron/main.cjs      windows, IPC handlers, PowerShell (focus + hotkey), config file, scheduler, login item
electron/obs.cjs       optional OBS WebSocket scene switching (no Electron imports)
electron/dock.cjs      OBS custom-dock HTTP server (+ dock-page.cjs, the page)
electron/updater.cjs   electron-updater wrapper (never auto-installs)
electron/logic.cjs     PURE helpers (deepMerge, shortcutToKeys, scheduleDueKey) — unit tested
electron/preload.cjs   the window.electronAPI bridge (typed in src/electron.d.ts)
src/App.tsx            sequences, controller/stage routing (?view=stage)
src/hooks/useCountdownTimer.ts   wall-clock countdown (endsAt)
src/lib/time.ts        formatCountdown, nextOccurrence (tested)
src/components/        Controller, TimerDisplay (stage), SettingsModal, ScheduleSettings, ObsSettings, HelpModal, WhatsNewModal
src/lib/               sequence.ts (timings), help.ts (guide text), changelog.ts, time.ts
tests/                 vitest
```

Config lives in `Documents/Stage Countdown Settings/config.txt` (JSON, merged on every `set-config`).
When you add an IPC call, update **all three**: `main.cjs` handler, `preload.cjs`, `src/electron.d.ts`.

## 4. Commands

```
npm run electron:dev   build and launch the app (Windows)
npm run dev            Vite only, in a browser (no Electron features)
npm test               vitest
npm run typecheck      tsc
npm run lint           eslint
npm run build:win      local Windows installer (release/)
```

Always run `npm test` and `npm run typecheck` before committing.

## 5. Known issues

- Everything Windows-specific (PowerShell worker, focus verification, hotkey, always-on-top stage, controller-close restore,
  minimized timing) was written on a Mac and is **untested on a real Windows rig**: run `docs/TEST-CHECKLIST.md` before a live meeting.
- macOS is unsupported (PowerShell).

## 6. Pitfalls

1. Don't hold the event loop during the sequences; they are `await`ed in the renderer, not blocked in main.
2. The stage window is transparent + always-on-top + fullscreen: changing those flags can break the reveal/fade.
3. A scheduled start fires with no user present, so it must never show a blocking `confirm()`.
4. Config durations/settings come from the saved file and override code defaults — log resolved values when debugging.
5. `node_modules/`, `release/`, `dist/` are never committed (a 177 MB `electron.exe` once blocked the first push).

## 7. Releasing

See `docs/RELEASING.md`. Tag `vX.Y.Z` after bumping `package.json`; GitHub Actions builds the Windows installer.
