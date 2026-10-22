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
