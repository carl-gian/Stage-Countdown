// What's new. Newest first. Add an entry here for EVERY release (a test fails if package.json's version has none).
// Shown once, the first time the app starts after an update, and always under Settings > About > What's new.

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  items: string[]; // short, plain-language, operator-facing
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.7',
    date: '2026-10-31',
    items: [
      'Fix: reading and saving some settings could fail silently (a leftover code error). Settings now load and save reliably.',
      'The README now has screenshots and demo animations.',
    ],
  },
  {
    version: '1.0.6',
    date: '2026-10-28',
    items: [
      'While OBS scene switching (and the OBS dock) is on, the app now starts hidden in the tray every time, so the dock and scenes are ready without a window popping up.',
      'It is an option: Settings > OBS Scene Switching > "Start hidden in the tray while OBS switching is on" (on by default). Turn it off to see the window at every start.',
      'After an update or on the very first run the window is still shown, so What\'s new and Help can open.',
    ],
  },
  {
    version: '1.0.5',
    date: '2026-10-28',
    items: [
      'M³ fix: if M³ ignores the shortcut, the app now hides (and later shows) M³\'s media display directly, so it can no longer stay on top of the timer.',
      'No more shortcut flood: before, a shortcut M³ did not react to was re-sent every few seconds. Now it tries twice, then uses the direct method, and the guard gives up with a clear message if nothing works.',
      'New "Test the shortcut" button in Settings > Meeting Media Manager (M³): it presses the shortcut once and tells you whether M³ really reacted.',
      'More reliable selection of M³\'s controller window before the shortcut is pressed (Windows often refuses to switch windows). It is only used to receive the key press: whether M³ is showing is read from "Media Player - M³" alone. Shortcuts are now sent like a real keyboard.',
      'The log now says exactly which shortcut it sent and which windows it found, which makes problems easy to diagnose.',
    ],
  },
  {
    version: '1.0.4',
    date: '2026-10-28',
    items: [
      'Fixed: the minutes and seconds boxes could be squashed or hidden behind the ring on the controller. The ring now measures the space that is left and fits it, and the window can no longer be made too short.',
      '"Close Stage Countdown after the timer ends" is now unavailable while the app is connected to OBS (it is switched off and shows a lock). OBS scene switching and the OBS dock need the app to keep running, so the two conflicted.',
    ],
  },
  {
    version: '1.0.3',
    date: '2026-10-28',
    items: [
      'Fixed: the glow around the progress ring was cut off in a square, on the controller, the stage display and the previews. It now fades out smoothly all the way around.',
      'The M³ badge now simply reads "M³ Media Display Shown" or "M³ Media Display Hidden", in the app and in the OBS dock.',
    ],
  },
  {
    version: '1.0.2',
    date: '2026-10-27',
    items: [
      'Smoother way back to M³. After the timer ends or you press Stop, the timer window fades to black and stays black for 3 seconds. Then M³\'s media display fades in on top of it, the timer window closes behind it, and OBS fades back one second later.',
      'OBS going back to the camera is now the very last step (before, it started first, so Zoom could show the camera while the stage was still changing).',
      'New OBS option: instead of the Camera scene, OBS can go back to the scene it was on before the countdown started. Choose it in Settings > OBS Scene Switching.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-27',
    items: [
      'First release. A full-screen stage countdown that works with or without Meeting Media Manager (M³).',
      'With M³: the countdown hides M³\'s media display, fades in on your stage display, and gives it back when it ends. The app checks whether the media display is really showing, verifies every shortcut, and hides it again if it comes back on top while the countdown runs.',
      'Optional OBS scene switching: Zoom participants see the timer (Media Display scene) and then the camera again, with smooth fades.',
      'Optional OBS dock: control the timer from inside OBS (set the time or a clock time, start, pause, stop).',
      'Lives in the tray: closing or minimizing the window keeps it running; it starts hidden with Windows when OBS switching is on.',
      'Automatic updates with a blue "Update ready" badge, and this What\'s new list after each update.',
      'Built-in Help (the ? button or F1) with tutorials for standalone use, M³, OBS and the dock.',
    ],
  },
];

const parse = (v: string) => v.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);

/** <0 if a is older than b, 0 if equal, >0 if newer. */
export function compareVersions(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Entries newer than `from` and not newer than `current` (newest first). */
export function entriesSince(from: string, current: string, log: ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  return log.filter((e) => compareVersions(e.version, from) > 0 && compareVersions(e.version, current) <= 0);
}
