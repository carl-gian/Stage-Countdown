import { useEffect, useState } from 'react';
import { Option, Switch } from '@/components/ui';

// Mirrors the shape saved/read by main.cjs's app-settings.json. Add this
// type to your types.ts if you'd rather import it than redeclare it.
export interface AppSettings {
  startMinimized: boolean;
  autoLaunch: boolean;
  schedule: {
    enabled: boolean;
    time1: string; // 'HH:MM', 24h
    time2: string; // 'HH:MM', 24h
    durationMinutes: number;
  };
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  startMinimized: false,
  autoLaunch: false,
  schedule: { enabled: false, time1: '', time2: '', durationMinutes: 5 },
};

/**
 * The "Startup & Schedule" section of SettingsModal. Owns its own load/save round-trip
 * (getAppSettings / setAppSettings, the same config file) and only ever writes its own keys.
 */
export default function ScheduleSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // OBS scene switching switches these two on for the user: reflect that without reopening Settings.
  useEffect(() => {
    return window.electronAPI?.onAppSettingsChanged?.((patch) => setSettings((prev) => ({ ...prev, ...patch })));
  }, []);

  useEffect(() => {
    (async () => {
      if (window.electronAPI?.getAppSettings) {
        const saved = await window.electronAPI.getAppSettings();
        // Keep only this panel's keys: the config file also holds colours etc. that other code owns.
        setSettings({
          startMinimized: saved?.startMinimized ?? DEFAULT_APP_SETTINGS.startMinimized,
          autoLaunch: saved?.autoLaunch ?? DEFAULT_APP_SETTINGS.autoLaunch,
          schedule: { ...DEFAULT_APP_SETTINGS.schedule, ...(saved?.schedule || {}) },
        });
      }
      setLoaded(true);
    })();
  }, []);

  // Persist on every change. This is a settings panel, not a form with a
  // Save button — the rest of the app (App.tsx, main.cjs) follows the same
  // "commit immediately" pattern for visual settings, so this stays
  // consistent with that.
  const commit = (next: AppSettings) => {
    setSettings(next);
    if (window.electronAPI?.setAppSettings) {
      const { startMinimized, autoLaunch, schedule } = next;
      window.electronAPI.setAppSettings({ startMinimized, autoLaunch, schedule });
    }
  };

  if (!loaded) return null;

  const schedule = (patch: Partial<AppSettings['schedule']>) => commit({ ...settings, schedule: { ...settings.schedule, ...patch } });

  return (
    <div>
      <Option
        title="Start hidden in the tray"
        hint="Open straight into the system tray instead of showing the window — applies to manual launches and Windows startup alike. Click the tray icon to show it."
      >
        <Switch label="Start hidden in the tray" checked={settings.startMinimized} onChange={(v) => commit({ ...settings, startMinimized: v })} />
      </Option>

      <Option
        title="Launch at Windows startup"
        hint="Registers Stage Countdown to start automatically when you log in — always hidden in the tray, regardless of the setting above."
      >
        <Switch label="Launch at Windows startup" checked={settings.autoLaunch} onChange={(v) => commit({ ...settings, autoLaunch: v })} />
      </Option>

      <Option
        title="Scheduled auto-timer"
        hint="Automatically runs the full Start sequence (hide display + countdown) at up to two times a day — even while minimized."
      >
        <Switch label="Scheduled auto-timer" checked={settings.schedule.enabled} onChange={(v) => schedule({ enabled: v })} />
      </Option>

      <div className={`grid grid-cols-2 gap-3 ${settings.schedule.enabled ? '' : 'sc-disabled'}`} style={{ paddingTop: 4 }}>
        <label className="grid gap-1" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>
          Time 1
          <input type="time" className="sc-input st-num" value={settings.schedule.time1} onChange={(e) => schedule({ time1: e.target.value })} />
        </label>
        <label className="grid gap-1" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>
          Time 2
          <input type="time" className="sc-input st-num" value={settings.schedule.time2} onChange={(e) => schedule({ time2: e.target.value })} />
        </label>
        <label className="col-span-2 grid gap-1" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>
          Duration (minutes)
          <input
            type="number"
            min={1}
            max={99}
            className="sc-input st-num"
            style={{ width: 96 }}
            value={settings.schedule.durationMinutes}
            onChange={(e) => schedule({ durationMinutes: Math.max(1, Math.min(99, parseInt(e.target.value) || 5)) })}
          />
        </label>
      </div>
    </div>
  );
}