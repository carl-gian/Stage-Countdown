export type TimerState = 'idle' | 'running' | 'paused' | 'complete';

export interface TimerSettings {
  minutes: number;
  seconds: number;
}

export interface VisualSettings {
  background: {
    mode: 'solid' | 'gradient';
    color1: string;
    color2: string;
    opacity: number;
  };
  trackRing: {
    color: string;
    thickness: number;
  };
  progressRing: {
    color1: string;
    color2: string;
    gradient: boolean;
    glow: boolean;
    glowIntensity: number;
    thickness: number;
  };
  text: {
    fontFamily: string;
    color: string;
    fontSize: number;
    shadowIntensity: number;
  };
  clock24h: boolean;
}

export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  background: {
    mode: 'gradient',
    color1: '#0a0a0f',
    color2: '#1a1a2e',
    opacity: 0.95,
  },
  trackRing: {
    color: '#1e1e2d',
    thickness: 12,
  },
  progressRing: {
    color1: '#00d4aa',
    color2: '#0099ff',
    gradient: true,
    glow: true,
    glowIntensity: 20,
    thickness: 12,
  },
  text: {
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    color: '#ffffff',
    fontSize: 48,
    shadowIntensity: 15,
  },
  clock24h: true,
};

export const FONT_OPTIONS = [
  "'Inter', 'Segoe UI', sans-serif",
  "'Courier New', monospace",
  "'Georgia', serif",
  "'Arial', sans-serif",
  "'Impact', sans-serif",
  "'Trebuchet MS', sans-serif",
  "'Verdana', sans-serif",
];

/** Merges a saved (possibly partial or older) visual config over the defaults, section by section. */
export function mergeVisual(saved: unknown): VisualSettings {
  const src = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(DEFAULT_VISUAL_SETTINGS)) {
    const val = src[key];
    if (def && typeof def === 'object') {
      out[key] = { ...def, ...(val && typeof val === 'object' ? val : {}) };
    } else {
      out[key] = typeof val === typeof def ? val : def;
    }
  }
  return out as unknown as VisualSettings;
}

/** What the controller sends to the stage window. Times are absolute (Date.now) so the stage keeps its own clock. */
export interface StageState {
  /** Whether the timer (and its background) is on screen at all. */
  show: boolean;
  state: TimerState;
  totalMs: number;
  /** Frozen remaining time (paused / idle / complete). */
  remainingMs: number;
  /** Epoch ms when a running countdown ends; 0 when not running. */
  endsAt: number;
  visual: VisualSettings;
  /** Black curtain over everything, and how long its fade takes. */
  blackout: boolean;
  curtainMs: number;
}
