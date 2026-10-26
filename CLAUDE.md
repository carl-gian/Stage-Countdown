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

## 1. How M³ is controlled

There is no data link to M³. The app:
1. Focuses M³'s window (title contains `m3WindowTitle`, default `Meeting media - M`) through a **resident PowerShell worker**
   (`PS_SCRIPT` in `electron/main.cjs`: compiled once at app start, commands are `id|focus|…` / `id|key|…` lines). Focus is
   **verified** (`GetForegroundWindow`, up to 3 tries); if it fails, no hotkey is sent and the UI shows the error.
2. Sends M³'s hide/show hotkey with `keybd_event` (default Shift+Alt+F3, set in Settings, stored as `hideShortcut`).

M³'s hotkey is a **toggle that cannot be read back**, so main tracks `m3Hidden`. Start only hides if it believes M³ is
shown; end/stop only restore if it believes M³ is hidden. The controller shows "M³ media: Shown/Hidden" with **Toggle** (send the
hotkey) and **Fix label** (correct the belief without sending anything). Closing the controller while M³ is hidden restores it first.

## 2. Sequences (src/App.tsx) — owner-specified timings, all in `src/lib/sequence.ts`

All run under one lock (`busyRef`), so two M³ toggles can never overlap. `tests/sequence.test.ts` pins the values:
if you change one on purpose (owner's request only), update the test too.

| Event | Steps |
|---|---|
| Start (manual / scheduled / Countdown to Time) | stage window opened invisibly → **shortcut** (hide M³) → +500 ms stage goes black (300 ms fade) → black for 1000 ms → 1000 ms transition to the timer showing the full time → 2000 ms → counting starts (4.5 s after the shortcut) |
| Complete | 00:00 held **10 s** (heartbeat at the start; "Back to M³ now" skips) → 500 ms fade to black → **shortcut** (show M³) → 500 ms → stage window closed (M³'s media window is already on top of it) |
| Auto-close | if "Close StageCountdown after Timer ends" is on: the app quits **5 s after the end shortcut**; the button shows "Closing in Ns · click to cancel" |
| Stop | timer fades out with 500 ms fade to black → **shortcut** → 500 ms → stage window closed (never quits) |
| Restart while paused | restarts in place (stage already up, M³ already hidden) — no sequence |

"Countdown to Time" is sized when counting actually begins, so it still ends exactly on the target.
Stacking: our stage window is always-on-top at the default "floating" level; M³'s fullscreen media window uses
"screen-saver", which is higher — that is why M³ appears over our black window at the end. The stage window is
non-focusable, ignores the mouse and is not in the taskbar.

The clock is wall-time (`endsAt = Date.now() + ms`) driven by timers, not rAF, and both windows have `backgroundThrottling:
false`, so it keeps running when minimized. The stage gets `{state, totalMs, remainingMs, endsAt, visual, blackout}` only when
something changes and paints its own ring/digits straight to the DOM (no React renders while running). A new stage window is
replayed the last state on load.

## 3. Code map

```
electron/main.cjs      windows, IPC handlers, PowerShell (focus + hotkey), config file, scheduler, login item
electron/logic.cjs     PURE helpers (deepMerge, shortcutToKeys, scheduleDueKey) — unit tested
electron/preload.cjs   the window.electronAPI bridge (typed in src/electron.d.ts)
src/App.tsx            sequences, controller/stage routing (?view=stage)
src/hooks/useCountdownTimer.ts   wall-clock countdown (endsAt)
src/lib/time.ts        formatCountdown, nextOccurrence (tested)
src/components/        Controller, TimerDisplay (stage), SettingsModal, ScheduleSettings
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
- Installed copies don't self-update (no `electron-updater`).

## 6. Pitfalls

1. Don't hold the event loop during the sequences; they are `await`ed in the renderer, not blocked in main.
2. The stage window is transparent + always-on-top + fullscreen: changing those flags can break the reveal/fade.
3. A scheduled start fires with no user present, so it must never show a blocking `confirm()`.
4. Config durations/settings come from the saved file and override code defaults — log resolved values when debugging.
5. `node_modules/`, `release/`, `dist/` are never committed (a 177 MB `electron.exe` once blocked the first push).

## 7. Releasing

See `docs/RELEASING.md`. Tag `vX.Y.Z` after bumping `package.json`; GitHub Actions builds the Windows installer.
