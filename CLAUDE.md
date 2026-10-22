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
1. Focuses M³'s window (title matches `*Meeting media - M*`) via PowerShell/`EnumWindows`.
2. Sends M³'s hide/show hotkey with `keybd_event` (default Shift+Alt+F3, set in Settings, stored as `hideShortcut`).
It cannot tell whether M³'s media is currently shown or hidden: it assumes it starts shown and toggles.

## 2. Sequences (src/App.tsx) — timing was tuned on a live rig

| Event | Steps |
|---|---|
| Start (manual or scheduled) | focus M³ + hotkey (500 ms holds in main) → wait 500 ms → timer starts |
| Complete | pulse 1400 ms → fade stage to black 500 ms → close stage window → focus M³ + hotkey → optional quit |
| Stop | stop timer → fade 500 ms → close stage window → focus M³ + hotkey (never quits) |

## 3. Code map

```
electron/main.cjs      windows, IPC handlers, PowerShell (focus + hotkey), config file, scheduler, login item
electron/logic.cjs     PURE helpers (deepMerge, shortcutToKeys, scheduleDueKey) — unit tested
electron/preload.cjs   the window.electronAPI bridge (typed in src/electron.d.ts)
src/App.tsx            sequences, controller/stage routing (?view=stage)
src/hooks/useCountdownTimer.ts   rAF countdown
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

## 5. Known issues (baseline when this workflow was set up)

- `typecheck`: 4 errors in `TimerDisplay.tsx` — code reads `visual.staticRing.*` and `visual.text.shadow`, which are not in
  `VisualSettings` (types.ts); `progressRing.glow` is a boolean in types but used as a px number.
- `lint`: 8 `no-explicit-any` errors (App.tsx, SettingsModal.tsx).
- `electron/main.cjs` was out of sync with the preload until build 1.0.0+setup; `get-config`, `set-config`,
  `select-and-signal-m3`, scheduler and login item were added then and are **untested on a real Windows rig**.
- macOS is unsupported (PowerShell). Screen-selection IDs from `get-displays` are numbers but the Settings UI stores strings.

## 6. Pitfalls

1. Don't hold the event loop during the sequences; they are `await`ed in the renderer, not blocked in main.
2. The stage window is transparent + always-on-top + fullscreen: changing those flags can break the reveal/fade.
3. A scheduled start fires with no user present, so it must never show a blocking `confirm()`.
4. Config durations/settings come from the saved file and override code defaults — log resolved values when debugging.
5. `node_modules/`, `release/`, `dist/` are never committed (a 177 MB `electron.exe` once blocked the first push).

## 7. Releasing

See `docs/RELEASING.md`. Tag `vX.Y.Z` after bumping `package.json`; GitHub Actions builds the Windows installer.
