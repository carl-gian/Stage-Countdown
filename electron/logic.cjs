// Pure helpers used by main.cjs, kept free of Electron so they can be unit tested.

const DEFAULT_SHORTCUT = { ctrl: false, alt: true, shift: true, code: 'F3' };

const DEFAULT_CONFIG = {
  lastDisplayId: null,
  m3WindowTitle: 'Meeting media - M',
  hideShortcut: DEFAULT_SHORTCUT,
  visual: null,
  startMinimized: false,
  autoLaunch: false,
  schedule: { enabled: false, time1: '', time2: '', durationMinutes: 5 },
  // Optional OBS scene switching. The WebSocket password is NOT here: see obsPasswordEnc.
  obs: { enabled: false, port: 4455, mediaScene: '', cameraScene: '' },
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

module.exports = {
  chooseFadeTransition,
  sealSecret,
  openSecret, DEFAULT_SHORTCUT, DEFAULT_CONFIG, deepMerge, shortcutToKeys, scheduleDueKey };
