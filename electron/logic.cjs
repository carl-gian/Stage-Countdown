// Pure helpers used by main.cjs, kept free of Electron so they can be unit tested.

const DEFAULT_SHORTCUT = { ctrl: false, alt: true, shift: true, code: 'F3' };

const DEFAULT_CONFIG = {
  lastDisplayId: null,
  // M3 has two windows: its own controller ("Meeting media - M3", only brought forward so the shortcut reaches it)
  // and the MEDIA window ("Media Player - M3") that covers the stage, which is the one we detect.
  m3WindowTitle: 'Meeting media - M',
  m3MediaWindowTitle: 'Media Player - M',
  hideShortcut: DEFAULT_SHORTCUT,
  visual: null,
  startMinimized: false,
  autoLaunch: false,
  schedule: { enabled: false, time1: '', time2: '', durationMinutes: 5 },
  // Optional OBS scene switching. The WebSocket password is NOT here: see obsPasswordEnc.
  obs: { enabled: false, port: 4455, mediaScene: '', cameraScene: '', returnMode: 'camera' },
  // Meeting Media Manager hand-off. Off = a standalone countdown (nothing is hidden/shown, no shortcut is sent).
  // directFallback: if M3 ignores the shortcut, hide/show its media window directly (Win32) so it can never stay on top.
  m3: { enabled: true, directFallback: true },
  lastSeenVersion: '',
  obsPasswordEnc: '',
};

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Recursively merges `patch` into `base` without mutating either. */
function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

/** DOM KeyboardEvent.code ("F3", "KeyA", "Digit5") + modifiers -> Windows virtual-key data. */
function shortcutToKeys(shortcut) {
  const s = { ...DEFAULT_SHORTCUT, ...(shortcut || {}) };
  let vkCode = 0x72; // F3
  const code = String(s.code || '');
  if (code.startsWith('Key')) vkCode = code.charCodeAt(3);
  else if (code.startsWith('Digit')) vkCode = code.charCodeAt(5);
  else if (/^F([1-9]|1[0-2])$/.test(code)) vkCode = 0x70 + Number(code.slice(1)) - 1;
  return { vkCode, hasAlt: !!s.alt, hasShift: !!s.shift, hasCtrl: !!s.ctrl };
}

/**
 * Returns a once-per-minute key (e.g. "Wed Oct 21 2026 18:30") when the schedule is
 * enabled and `now` is at time1 or time2 ("HH:MM", 24h); otherwise null.
 */
function scheduleDueKey(schedule, now) {
  if (!schedule?.enabled) return null;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm !== schedule.time1 && hhmm !== schedule.time2) return null;
  return `${now.toDateString()} ${hhmm}`;
}

/** Picks the transition to use for our fades: "Fade", else any fade kind, else the first non-cut one. */
function chooseFadeTransition(transitions) {
  const list = Array.isArray(transitions) ? transitions : [];
  return (
    list.find((t) => String(t.transitionName).toLowerCase() === 'fade') ||
    list.find((t) => t.transitionKind === 'fade_transition') ||
    list.find((t) => !t.transitionFixed) ||
    null
  );
}

/** Obscures/unobscures a secret for the config file. `encrypt` is Electron's safeStorage (or null). */
function sealSecret(value, encrypt) {
  if (!value) return '';
  if (encrypt) return `enc:${encrypt.encryptString(value).toString('base64')}`;
  return `raw:${Buffer.from(value, 'utf8').toString('base64')}`;
}

function openSecret(sealed, decrypt) {
  if (!sealed) return '';
  try {
    if (sealed.startsWith('enc:')) return decrypt ? decrypt.decryptString(Buffer.from(sealed.slice(4), 'base64')) : '';
    if (sealed.startsWith('raw:')) return Buffer.from(sealed.slice(4), 'base64').toString('utf8');
  } catch {
    // unreadable (e.g. config copied to another PC): treat as no password
  }
  return '';
}

const parseVersion = (v) => String(v).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);

/** <0 if a is older than b, 0 if equal, >0 if newer. */
function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** What to do at start-up, from the version last acknowledged on this PC. */
function launchKind(lastSeen, current) {
  if (!lastSeen) return 'first-run';
  return compareVersions(current, lastSeen) > 0 ? 'updated' : 'normal';
}

/** "Shift + Alt + F3": the shortcut in words, for logs and messages. */
function describeShortcut(shortcut) {
  const s = { ctrl: false, alt: true, shift: true, code: 'F3', ...(shortcut || {}) };
  const code = String(s.code || '');
  const key = code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code;
  return [s.ctrl && 'Ctrl', s.alt && 'Alt', s.shift && 'Shift', key].filter(Boolean).join(' + ');
}

module.exports = {
  describeShortcut,
  compareVersions,
  launchKind,
  chooseFadeTransition,
  sealSecret,
  openSecret, DEFAULT_SHORTCUT, DEFAULT_CONFIG, deepMerge, shortcutToKeys, scheduleDueKey };
