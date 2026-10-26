import { useEffect, useState } from 'react';

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

  return (
    <div className="flex flex-col gap-5">
      {/* Start minimized */}
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <div>
          <div className="text-sm font-semibold text-gray-200">Start hidden in the tray</div>
          <div className="text-xs text-gray-500">
            Open straight into the system tray instead of showing the window — applies to manual launches and Windows startup alike. Click the tray icon to show it.
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.startMinimized}
          onChange={(e) => commit({ ...settings, startMinimized: e.target.checked })}
          className="w-5 h-5 accent-emerald-500 shrink-0"
        />
      </label>

      {/* Launch at boot */}
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <div>
          <div className="text-sm font-semibold text-gray-200">Launch at Windows startup</div>
          <div className="text-xs text-gray-500">
            Registers Stage Countdown to start automatically when you log in — always hidden in the tray, regardless of the setting above.
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.autoLaunch}
          onChange={(e) => commit({ ...settings, autoLaunch: e.target.checked })}
          className="w-5 h-5 accent-emerald-500 shrink-0"
        />
      </label>

      <div className="h-px bg-white/10" />

      {/* Scheduled auto-timer */}
      <div className="flex flex-col gap-3">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-sm font-semibold text-gray-200">Scheduled auto-timer</div>
            <div className="text-xs text-gray-500">
              Automatically runs the full Start sequence (hide display + countdown) at up to two times a day — even while minimized.
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.schedule.enabled}
            onChange={(e) => commit({ ...settings, schedule: { ...settings.schedule, enabled: e.target.checked } })}
            className="w-5 h-5 accent-emerald-500 shrink-0"
          />
        </label>

        <div className={`grid grid-cols-2 gap-3 transition-opacity ${settings.schedule.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Time 1</span>
            <input
              type="time"
              value={settings.schedule.time1}
              onChange={(e) => commit({ ...settings, schedule: { ...settings.schedule, time1: e.target.value } })}
              className="bg-gray-800 text-white rounded px-2 py-1.5 outline-none text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Time 2</span>
            <input
              type="time"
              value={settings.schedule.time2}
              onChange={(e) => commit({ ...settings, schedule: { ...settings.schedule, time2: e.target.value } })}
              className="bg-gray-800 text-white rounded px-2 py-1.5 outline-none text-sm"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Duration (minutes)</span>
            <input
              type="number"
              min={1}
              max={99}
              value={settings.schedule.durationMinutes}
              onChange={(e) =>
                commit({
                  ...settings,
                  schedule: { ...settings.schedule, durationMinutes: Math.max(1, Math.min(99, parseInt(e.target.value) || 5)) },
                })
              }
              className="w-24 bg-gray-800 text-white rounded px-2 py-1.5 outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
