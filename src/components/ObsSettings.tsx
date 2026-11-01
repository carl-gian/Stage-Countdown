import { useCallback, useEffect, useRef, useState } from 'react';
import CopyUrl from '@/components/CopyUrl';
import { Option, Switch } from '@/components/ui';

const DEFAULT_PORT = 4455;

const STATE_TEXT: Record<ObsStatus['state'], { label: string; color: string }> = {
  off: { label: 'Off', color: '' },
  searching: { label: 'OBS not detected — is OBS open with the WebSocket server on? Looking again every few seconds…', color: 'sc-status-warn' },
  connecting: { label: 'Connecting…', color: 'sc-status-warn' },
  connected: { label: 'Connected to OBS', color: 'sc-status-ok' },
  'auth-failed': { label: 'OBS found, but the password is wrong', color: 'sc-status-bad' },
  error: { label: 'Could not talk to OBS', color: 'sc-status-bad' },
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
    <div className="sc-field-row">
      <span className="sc-label">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="sc-select sc-grow" aria-label={label}>
        <option value="">— Choose a scene —</option>
        {missing && <option value={value}>{value} (not in OBS)</option>}
        {scenes.map((s) => (
          <option key={s} value={s}>{s}</option>
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
  const [returnMode, setReturnMode] = useState<'camera' | 'previous'>('camera');
  const [startHidden, setStartHidden] = useState(true);
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
      setReturnMode(s.returnMode ?? 'camera');
      setStartHidden(s.startHidden ?? true);
      loaded.current = true;
    });
    return api.onObsStatus?.(setStatus);
  }, [api]);

  const save = useCallback(
    (next: { enabled: boolean; port: string; password?: string; mediaScene: string; cameraScene: string; returnMode: 'camera' | 'previous'; startHidden: boolean }) => {
      const n = parseInt(next.port, 10);
      api?.obsSaveSettings({
        enabled: next.enabled,
        port: Number.isInteger(n) ? n : DEFAULT_PORT,
        mediaScene: next.mediaScene,
        cameraScene: next.cameraScene,
        returnMode: next.returnMode,
        startHidden: next.startHidden,
        ...(next.password !== undefined ? { password: next.password } : {}),
      });
    },
    [api]
  );

  // Port and password are saved once typing pauses; toggles and scene choices save immediately.
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(
      () => save({ enabled, port, mediaScene, cameraScene, returnMode, startHidden, ...(password || clearPassword ? { password } : {}) }),
      600
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, password, clearPassword]);

  const commit = (patch: Partial<{ enabled: boolean; mediaScene: string; cameraScene: string; returnMode: 'camera' | 'previous'; startHidden: boolean }>) => {
    const next = { enabled, mediaScene, cameraScene, returnMode, startHidden, ...patch };
    if (patch.enabled !== undefined) setEnabled(patch.enabled);
    if (patch.mediaScene !== undefined) setMediaScene(patch.mediaScene);
    if (patch.cameraScene !== undefined) setCameraScene(patch.cameraScene);
    if (patch.returnMode !== undefined) setReturnMode(patch.returnMode);
    if (patch.startHidden !== undefined) setStartHidden(patch.startHidden);
    save({ ...next, port, ...(password || clearPassword ? { password } : {}) });
  };

  if (!api?.obsGetStatus) {
    return <p className="sc-hint" style={{ marginTop: 0 }}>Available in the desktop app.</p>;
  }

  const connected = status?.state === 'connected';
  const info = status ? STATE_TEXT[status.state] : STATE_TEXT.off;
  const scenes = status?.scenes ?? [];

  return (
    <div className="sc-stack">
      <p className="sc-hint" style={{ marginTop: 0 }}>
        <b>Optional.</b> OBS is what Zoom participants see. When this is on, a moment after the
        countdown starts OBS fades to your <i>Media Display</i> scene (the one showing the timer on the stage display), and once the
        countdown has ended and the media display is back it fades back to your <i>Camera</i> scene, or to whatever scene OBS was on
        before. The hand-off is seamless, so everyone in Zoom sees the timer and nobody has to switch scenes by hand.
      </p>

      <Option title="Switch OBS scenes with the timer">
        <Switch label="Switch OBS scenes with the timer" checked={enabled} onChange={(v) => commit({ enabled: v })} />
      </Option>

      <div className={`sc-stack ${enabled ? '' : 'sc-disabled'}`}>
        <div className="sc-field-row">
          <span className="sc-label">WebSocket port</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="sc-input st-num"
            style={{ width: 96 }}
            aria-label="WebSocket port"
          />
          <span className="sc-hint" style={{ margin: 0 }}>localhost, default {DEFAULT_PORT}</span>
        </div>

        <div className="sc-field-row">
          <span className="sc-label">Password</span>
          <input
            type="password"
            autoComplete="off"
            value={password}
            placeholder={status?.hasPassword && !clearPassword ? '•••••••• (saved)' : 'None'}
            onChange={(e) => {
              setPassword(e.target.value);
              setClearPassword(false);
            }}
            className="sc-input sc-grow"
            aria-label="WebSocket password"
          />
          {status?.hasPassword && !password && !clearPassword && (
            <button type="button" className="st-btn st-btn--quiet" onClick={() => setClearPassword(true)} title="Forget the saved password">
              Clear
            </button>
          )}
        </div>

        <div className="sc-field-row">
          <span className={`sc-grow ${info.color}`} style={{ fontSize: 13 }} role="status">
            ● {info.label}
            {status?.state === 'error' && status.error ? ` (${status.error})` : ''}
            {connected && status?.version ? ` · obs-websocket ${status.version}` : ''}
          </span>
          <button type="button" className="st-btn st-btn--secondary" onClick={() => api.obsRefresh()} title="Look for OBS again and reload its scenes">
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
        <div role="radiogroup" aria-label="When the countdown ends or stops, OBS goes back to">
          <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 700 }}>When the countdown ends or stops, OBS goes back to:</span>
          {([
            ['camera', 'The Camera scene'],
            ['previous', 'The scene OBS was on before the countdown'],
          ] as const).map(([mode, label]) => (
            <label key={mode} className="sc-radio">
              <input type="radio" name="obs-return-mode" checked={returnMode === mode} onChange={() => commit({ returnMode: mode })} />
              {label}
            </label>
          ))}
        </div>
        <SceneSelect
          label={returnMode === 'camera' ? 'Camera scene' : 'Fallback scene'}
          value={cameraScene}
          scenes={scenes}
          disabled={!connected && scenes.length === 0 && !cameraScene}
          onChange={(v) => commit({ cameraScene: v })}
        />
        {returnMode === 'previous' && (
          <p className="sc-hint" style={{ marginTop: 0 }}>
            The app remembers the scene OBS is on when the countdown takes over{status?.previousScene ? ` (now: ${status.previousScene})` : ''} and returns to it.
            The fallback scene is only used if that scene no longer exists. If you move OBS to another scene yourself during the countdown, it is left alone.
          </p>
        )}
        <p className="sc-hint" style={{ marginTop: 0 }}>
          In OBS: Tools → WebSocket Server Settings → enable it, then use the same port and password here. Scenes appear once OBS is detected.
        </p>
      </div>

      {enabled && (
        <div className="sc-subcard">
          <h4>OBS dock</h4>
          <p className="sc-hint" style={{ marginTop: 0 }}>
            Control the timer from inside OBS: set the minutes and seconds (or a clock time to finish at), then start, pause and stop,
            exactly like this window. Add it once:
          </p>
          <ol className="sc-hint" style={{ paddingLeft: 20, listStyle: 'decimal', margin: '4px 0 8px' }}>
            <li>In OBS open <b>View → Docks → Custom Browser Docks</b>.</li>
            <li>Dock Name: <b>Stage Countdown</b>. URL: the address below.</li>
            <li>Click <b>Apply</b>, then drag the new dock wherever you like.</li>
          </ol>
          <CopyUrl url={status?.dock?.url ?? 'http://127.0.0.1:4578/dock'} />
          <p className={`sc-hint ${status?.dock?.running ? 'sc-status-ok' : 'sc-status-bad'}`}>
            {status?.dock?.running ? '● Dock is running (only while this app is running)' : `● Dock is not running${status?.dock?.error ? `: ${status.dock.error}` : ''}`}
          </p>
          <Option
            bold={false}
            title="Start hidden in the tray while OBS switching is on"
            hint="On by default, so the dock and scene switching are ready without a window popping up. Turn it off to see the window at every start. Turning OBS switching on also starts the app with Windows (see Startup & schedule)."
          >
            <Switch label="Start hidden in the tray while OBS switching is on" checked={startHidden} onChange={(v) => commit({ startHidden: v })} />
          </Option>
        </div>
      )}
    </div>
  );
}