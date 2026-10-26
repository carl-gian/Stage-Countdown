import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_PORT = 4455;

const STATE_TEXT: Record<ObsStatus['state'], { label: string; color: string }> = {
  off: { label: 'Off', color: 'text-gray-500' },
  searching: { label: 'OBS not detected — is OBS open with the WebSocket server on? Looking again every few seconds…', color: 'text-amber-400' },
  connecting: { label: 'Connecting…', color: 'text-amber-400' },
  connected: { label: 'Connected to OBS', color: 'text-emerald-400' },
  'auth-failed': { label: 'OBS found, but the password is wrong', color: 'text-red-400' },
  error: { label: 'Could not talk to OBS', color: 'text-red-400' },
};

function SceneSelect({
  label,
  value,
  scenes,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  scenes: string[];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  // A scene that was chosen earlier but is not in OBS right now stays visible (marked) instead of vanishing.
  const missing = value && !scenes.includes(value);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-28 shrink-0">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-white/5 text-gray-200 text-xs rounded-lg px-2 py-1.5 border border-white/10 outline-none disabled:opacity-40"
      >
        <option value="" className="bg-[#12121a]">— Choose a scene —</option>
        {missing && (
          <option value={value} className="bg-[#12121a]">{value} (not in OBS)</option>
        )}
        {scenes.map((s) => (
          <option key={s} value={s} className="bg-[#12121a]">{s}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * The "OBS Scene Switching" section of SettingsModal. Owns its own load/save round-trip
 * (obsGetStatus / obsSaveSettings) and never receives the saved password, only whether one exists.
 */
export default function ObsSettings() {
  const api = window.electronAPI;
  const [status, setStatus] = useState<ObsStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [password, setPassword] = useState('');
  const [mediaScene, setMediaScene] = useState('');
  const [cameraScene, setCameraScene] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!api?.obsGetStatus) return;
    api.obsGetStatus().then((s) => {
      setStatus(s);
      setEnabled(s.enabled);
      setPort(String(s.port));
      setMediaScene(s.mediaScene);
      setCameraScene(s.cameraScene);
      loaded.current = true;
    });
    return api.onObsStatus?.(setStatus);
  }, [api]);

  const save = useCallback(
    (next: { enabled: boolean; port: string; password?: string; mediaScene: string; cameraScene: string }) => {
      const n = parseInt(next.port, 10);
      api?.obsSaveSettings({
        enabled: next.enabled,
        port: Number.isInteger(n) ? n : DEFAULT_PORT,
        mediaScene: next.mediaScene,
        cameraScene: next.cameraScene,
        ...(next.password !== undefined ? { password: next.password } : {}),
      });
    },
    [api]
  );

  // Port and password are saved once typing pauses; toggles and scene choices save immediately.
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(
      () => save({ enabled, port, mediaScene, cameraScene, ...(password || clearPassword ? { password } : {}) }),
      600
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, password, clearPassword]);

  const commit = (patch: Partial<{ enabled: boolean; mediaScene: string; cameraScene: string }>) => {
    const next = { enabled, mediaScene, cameraScene, ...patch };
    if (patch.enabled !== undefined) setEnabled(patch.enabled);
    if (patch.mediaScene !== undefined) setMediaScene(patch.mediaScene);
    if (patch.cameraScene !== undefined) setCameraScene(patch.cameraScene);
    save({ ...next, port, ...(password || clearPassword ? { password } : {}) });
  };

  if (!api?.obsGetStatus) {
    return <div className="px-3 py-2 text-xs text-gray-500 rounded-lg bg-white/5">Available in the desktop app</div>;
  }

  const connected = status?.state === 'connected';
  const info = status ? STATE_TEXT[status.state] : STATE_TEXT.off;
  const scenes = status?.scenes ?? [];

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-gray-400">
        <b className="text-gray-300">Optional.</b> OBS is what Zoom participants see. When this is on, a moment after the
        countdown starts OBS fades to your <i>Media Display</i> scene (the one showing the timer on the stage display), and when the
        countdown ends it fades back to your <i>Camera</i> scene. The hand-off is seamless, so everyone in Zoom sees the timer
        and nobody has to switch scenes by hand.
      </p>

      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm font-semibold text-gray-200">Switch OBS scenes with the timer</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => commit({ enabled: e.target.checked })}
          className="w-5 h-5 accent-emerald-500 shrink-0"
        />
      </label>

      <div className={`space-y-3 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-28 shrink-0">WebSocket port</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="w-24 bg-gray-800 text-white rounded px-2 py-1.5 outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-[11px] text-gray-500">localhost, default {DEFAULT_PORT}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-28 shrink-0">Password</span>
          <input
            type="password"
            autoComplete="off"
            value={password}
            placeholder={status?.hasPassword && !clearPassword ? '•••••••• (saved)' : 'None'}
            onChange={(e) => {
              setPassword(e.target.value);
              setClearPassword(false);
            }}
            className="flex-1 min-w-0 bg-gray-800 text-white rounded px-2 py-1.5 outline-none text-sm"
          />
          {status?.hasPassword && !password && !clearPassword && (
            <button
              onClick={() => setClearPassword(true)}
              className="text-xs text-gray-500 hover:text-gray-300 shrink-0"
              title="Forget the saved password"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-start gap-2">
          <span className={`text-xs flex-1 ${info.color}`}>
            ● {info.label}
            {status?.state === 'error' && status.error ? ` (${status.error})` : ''}
            {connected && status?.version ? ` · obs-websocket ${status.version}` : ''}
          </span>
          <button
            onClick={() => api.obsRefresh()}
            className="px-2 py-1 rounded text-xs font-semibold bg-white/10 text-white hover:bg-white/20 shrink-0"
            title="Look for OBS again and reload its scenes"
          >
            Refresh
          </button>
        </div>

        <SceneSelect
          label="Media Display scene"
          value={mediaScene}
          scenes={scenes}
          disabled={!connected && scenes.length === 0 && !mediaScene}
          onChange={(v) => commit({ mediaScene: v })}
        />
        <SceneSelect
          label="Camera scene"
          value={cameraScene}
          scenes={scenes}
          disabled={!connected && scenes.length === 0 && !cameraScene}
          onChange={(v) => commit({ cameraScene: v })}
        />
        <p className="text-[11px] text-gray-500">
          In OBS: Tools → WebSocket Server Settings → enable it, then use the same port and password here. Scenes appear once OBS is detected.
        </p>
      </div>
    </div>
  );
}
