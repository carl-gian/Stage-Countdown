# Steward redesign: implementation plan

Approved by Caio on 2026-11-01. The approved look is `docs/mockups/redesign.html` (open it in a browser; it runs).
Branch: `redesign-steward`. Nothing is pushed or released without Caio saying so.

## Decisions (do not change without asking)

- **Light is the default.** Stage Countdown is a pre-meeting *presentation* countdown, not a talk timer, so Steward's
  "stage screens are always dark / art never moves" rules do not apply. Note this as its own case in
  `kingdom-project-design` (motion.md + stage notes) in a separate PR there.
- **Stage look:** Apple-style frosted glass disc (heavy blur, bright rim, sheen, soft shadow) holding the ring, the 60
  tick marks and the digits, over one of three original nature scenes. A soft wash keeps the art quiet.
  - Scenes: `mountains` (default), `meadow`, `lake`; each has light (day) and dark (night) palettes, exactly as in the mockup.
  - Look: `light` (default), `dark`, `auto` (follows Windows).
  - Motion: `calm` (default) or `plain` (scene stands still). Reduced motion behaves as `plain`.
- **Countdown animation:** each digit sits in its own clipped window (1.1em tall); on change the old digit rolls down and
  out while the new one rolls in from above, 0.5 s, `cubic-bezier(.45,0,.2,1)`. The leaving digit must lose its `in`
  class (that bug caused overlapping digits in round 4). Colon dims each second. Ring **shrinks** as time runs out.
  Last 10 s: ring amber + a 1.2 % beat each second. 00:00: two soft ripples (replaces the heartbeat).
- **Sequences and their timings are unchanged** (`src/lib/sequence.ts`, pinned by `tests/sequence.test.ts`). The stage
  window flags (transparent, always-on-top, fullscreen, non-focusable) are unchanged.
- **Advanced:** the old colour/ring/glow/text settings stay, behind "Advanced › Use my own colours". Saved values are kept.
- Controller follows Windows light/dark. Font: Noto Sans, bundled (no internet at the hall).

## Steps

1. **Foundation**
   - Add `@fontsource/noto-sans` (400/500/700/800); import in `src/main.tsx`.
   - `src/styles/steward.css`: copy `tokens.css` + the `st-` components used (button, card, pill, seg, switch, option,
     topbar) from `kingdom-project-design`; import in `src/index.css`. Replace the dark `body` background.
2. **Settings model** (`src/types.ts`)
   - `VisualSettings.stage = { style: 'scene' | 'custom', scene, look, motion, showKicker, numberSize }`, defaults
     `scene / mountains / light / calm / true / 'normal'`. `mergeVisual` already merges per section; add a test in
     `tests/visual.test.ts` (old saved configs get the new defaults; unknown values fall back).
3. **Stage components** (`src/components/stage/`)
   - `SceneArt.tsx`: the three scenes as static SVG JSX (port from the mockup's builder functions; seeded positions
     become fixed arrays). Palettes as CSS variables keyed by `data-scene` / `data-mode` in `src/styles/stage.css`.
   - `GlassCountdown.tsx`: disc + ring + ticks + digit windows. Keep painting from one rAF loop straight to the DOM
     (no React renders while running), as `TimerDisplay` does today; the digit roll is DOM class swaps.
   - `TimerDisplay.tsx`: render `GlassCountdown` when `style === 'scene'`, the current ring when `'custom'`.
4. **Stage window** (`StageView` in `src/App.tsx`): scene as the background (opaque) when `style === 'scene'`;
   keep the black curtain and the show/hide fade. Resolve `auto` with `matchMedia('(prefers-color-scheme: dark)')`.
5. **Controller** (`Controller.tsx` + the rows in `App.tsx`): Steward top bar (clock, pin, help, settings), status
   pills (state, M³, OBS), stage preview (scene standing still), minute/second steppers, "Count down to a time" row,
   Start / Pause / Stop / Restart as `st-btn`, the M³ / OBS / auto-close rows as an `st-card` of `st-option` rows,
   update badge as an `st-banner`, Confirm dialog restyled. Same handlers, same wording rules (guidelines/voice.md).
6. **Settings modal**: new first section "Stage look" (Scene, Look, Motion, show "The meeting starts in", Number
   size, Advanced). Restyle every section with Steward. Same for `ObsSettings`, `ScheduleSettings`, `HelpModal`,
   `WhatsNewModal`.
7. **OBS dock** (`electron/dock-page.cjs`): Steward dark, as in the mockup. Keep the command API and `parseCommand`.
8. **Help + changelog**: update `src/lib/help.ts` (appearance topic); changelog entry for the next version when released.
9. **Check**: `npm test`, `npm run typecheck`, `npm run lint`; headless Edge screenshots of the controller (light,
   dark, narrow) via `npm run dev`; add a dev-only `?view=stage&demo=1` that feeds a fake running state so the stage can
   be screenshotted in a browser. Then `docs/TEST-CHECKLIST.md` on a real Windows PC, **including CPU/GPU use**: the
   blur over a moving scene is the heaviest part; if a hall PC struggles, `plain` motion is the fallback.

## Risks

- Backdrop blur + moving SVG on an old hall PC: measure in step 9 before any release.
- Electron transparent always-on-top window with `backdrop-filter`: blur only sees our own page (the scene), which is
  what we want; verify on Windows.
- A bright stage over Zoom/OBS: the "dark" look stays one click away.
