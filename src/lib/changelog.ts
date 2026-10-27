// What's new. Newest first. Add an entry here for EVERY release (a test fails if package.json's version has none).
// Shown once, the first time the app starts after an update, and always under Settings > About > What's new.

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  items: string[]; // short, plain-language, operator-facing
}

export const CHANGELOG: ChangelogEntry[] = [
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
