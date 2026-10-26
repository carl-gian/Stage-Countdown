// What's new. Newest first. Add an entry here for EVERY release (a test fails if package.json's version has none).
// Shown once, the first time the app starts after an update, and always under Settings > About > What's new.

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  items: string[]; // short, plain-language, operator-facing
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2026-10-27',
    items: [
      'First release. A full-screen stage countdown that works with or without Meeting Media Manager (M³).',
      'With M³: the countdown hides M³\'s media window, fades in on your stage display, and gives M³ back when it ends.',
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
