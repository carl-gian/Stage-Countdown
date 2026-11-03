import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { StageLook, VisualSettings } from '@/types';
import { FONT_OPTIONS } from '@/types';
import TimerDisplay, { DEFAULT_FONT_SIZE } from '@/components/TimerDisplay';
import FitBox from '@/components/FitBox';
import ScheduleSettings from '@/components/ScheduleSettings';
import ObsSettings from '@/components/ObsSettings';
import { Option, Seg, Switch } from '@/components/ui';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after the M³ on/off switch changes so the controller can refresh its status row. */
  onM3EnabledChange?: () => void;
  onOpenHelp?: (topic: string) => void;
  onShowWhatsNew?: () => void;
  visual: VisualSettings;
  onChange: (v: VisualSettings) => void;
}

interface DisplayInfo {
  id: number;
  index: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
}

// Mirrors the shape saved/read by main.cjs's config.txt for the M3
// hide/show shortcut. DOM KeyboardEvent.code values ("F3", "KeyA", ...)
// are layout-independent, which is why main.cjs's translation tables for
// both platforms key off of exactly this.
export interface ShortcutValue {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  code: string;
}

// Shift+Alt+F3 — the shortcut this app has always sent, kept as the
// fallback/reset target.
const DEFAULT_SHORTCUT: ShortcutValue = { ctrl: false, alt: true, shift: true, code: 'F3' };

const NAMED_CODES: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Space: 'Space', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab',
  Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
};

function formatCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return NAMED_CODES[code] || code;
}

function formatShortcut(s: ShortcutValue | null | undefined): string {
  if (!s || !s.code) return 'Not set';
  const parts: string[] = [];
  if (s.ctrl) parts.push('Ctrl');
  if (s.alt) parts.push('Alt');
  if (s.shift) parts.push('Shift');
  parts.push(formatCode(s.code));
  return parts.join(' + ');
}

const MODIFIER_CODES = new Set([
  'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight',
]);

function ShortcutRecorder({
  value,
  onChange,
}: {
  value: ShortcutValue;
  onChange: (v: ShortcutValue) => void;
}) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // A bare modifier press isn't a complete shortcut yet — wait for a
      // real key to land alongside it.
      if (MODIFIER_CODES.has(e.code)) return;

      onChange({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, code: e.code });
      setRecording(false);
    };

    // Capture phase + on window, so this grabs the keystroke before
    // anything else in the modal (or the input it's not focused in) can
    // react to it.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, onChange]);

  return (
    <div className="sc-field-row">
      <span className="sc-label">Shortcut</span>
      <button
        type="button"
        onClick={() => setRecording(true)}
        className={`st-btn ${recording ? 'st-btn--soft' : 'st-btn--secondary'} sc-grow sc-kbd`}
      >
        {recording ? 'Press a key combo…' : formatShortcut(value)}
      </button>
      {!recording && (
        <button type="button" className="st-btn st-btn--quiet" onClick={() => onChange(DEFAULT_SHORTCUT)} title="Reset to default (Shift+Alt+F3)">
          Reset
        </button>
      )}
    </div>
  );
}

function M3TestMessage({ result }: { result: M3TestResult }) {
  const r = result;
  const [cls, text] =
    r.result === 'api-ok'
      ? ['sc-status-ok', `✓ It works: M³ (TLC Edition) changed its media display from ${r.before} to ${r.after} through its own connection (no keyboard shortcut needed), and it was put back.`]
      : r.result === 'shortcut-ok'
      ? ['sc-status-ok', `✓ It works: ${r.shortcut} made M³'s media display change from ${r.before} to ${r.after}, and it was put back.`]
      : r.result === 'direct-only'
        ? ['sc-status-warn', `⚠ M³ ignored ${r.shortcut}, but hiding its window directly worked, so the app will use that automatically. To fix the shortcut: it must match M³'s "Media Window" shortcut (M³ Settings → Interface & Shortcuts), keyboard shortcuts must be on in M³, and no M³ dialog may be open.`]
        : r.result === 'nothing-works'
          ? ['sc-status-bad', `✗ Neither the shortcut (${r.shortcut}) nor hiding the window directly changed M³'s media display. ${r.error ?? ''}`]
          : r.result === 'no-window'
            ? ['sc-status-warn', `M³'s media window ("${r.title}") was not found. Open M³ and its media window, then test again.`]
            : r.result === 'cannot-read'
              ? ['sc-status-warn', "The app could not read M³'s window state (this only works on Windows)."]
              : ['', 'Control of M³ is switched off.'];
  return <p className={`sc-hint ${cls}`} role="status">{text}</p>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sc-section">
      <h3>{title}</h3>
      <div className="st-card">{children}</div>
    </section>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="sc-field-row">
      <span className="sc-label">{label}</span>
      <input type="color" className="sc-color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <span className="sc-kbd" style={{ color: 'var(--text-dim)', fontSize: 13 }}>{value}</span>
    </div>
  );
}

function SliderInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="sc-field-row">
      <span className="sc-label">{label}</span>
      <input type="range" className="sc-range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="st-num" style={{ width: 44, textAlign: 'right', fontSize: 13, color: 'var(--text-dim)' }}>{format ? format(value) : `${value}${unit}`}</span>
    </div>
  );
}

/** The old colour, ring, glow and text settings, used by the "own colours" style. */
function OwnColours({ visual, update }: { visual: VisualSettings; update: (patch: Partial<VisualSettings>) => void }) {
  const onOff = (on: boolean): 'on' | 'off' => (on ? 'on' : 'off');
  return (
    <div className="sc-stack" style={{ marginTop: 12 }}>
      <h4 style={{ margin: 0, fontSize: 13 }}>Background</h4>
      <div className="sc-field-row">
        <span className="sc-label">Mode</span>
        <Seg
          label="Background mode"
          value={visual.background.mode}
          options={[['solid', 'Solid'], ['gradient', 'Gradient']]}
          onChange={(mode) => update({ background: { ...visual.background, mode } })}
        />
      </div>
      <ColorInput label="Colour 1" value={visual.background.color1} onChange={(v) => update({ background: { ...visual.background, color1: v } })} />
      {visual.background.mode === 'gradient' && (
        <ColorInput label="Colour 2" value={visual.background.color2} onChange={(v) => update({ background: { ...visual.background, color2: v } })} />
      )}
      <SliderInput label="Opacity" value={visual.background.opacity} min={0.3} max={1} step={0.05} onChange={(v) => update({ background: { ...visual.background, opacity: v } })} />

      <h4 style={{ margin: '8px 0 0', fontSize: 13 }}>Track ring</h4>
      <ColorInput label="Colour" value={visual.trackRing.color} onChange={(v) => update({ trackRing: { ...visual.trackRing, color: v } })} />
      <SliderInput label="Thickness" value={visual.trackRing.thickness} min={2} max={30} unit="px" onChange={(v) => update({ trackRing: { ...visual.trackRing, thickness: v } })} />

      <h4 style={{ margin: '8px 0 0', fontSize: 13 }}>Progress ring</h4>
      <ColorInput label="Colour 1" value={visual.progressRing.color1} onChange={(v) => update({ progressRing: { ...visual.progressRing, color1: v } })} />
      <div className="sc-field-row">
        <span className="sc-label">Gradient</span>
        <Seg
          label="Progress ring gradient"
          value={onOff(visual.progressRing.gradient)}
          options={[['on', 'On'], ['off', 'Off']]}
          onChange={(v) => update({ progressRing: { ...visual.progressRing, gradient: v === 'on' } })}
        />
      </div>
      {visual.progressRing.gradient && (
        <ColorInput label="Colour 2" value={visual.progressRing.color2} onChange={(v) => update({ progressRing: { ...visual.progressRing, color2: v } })} />
      )}
      <SliderInput label="Thickness" value={visual.progressRing.thickness} min={2} max={30} unit="px" onChange={(v) => update({ progressRing: { ...visual.progressRing, thickness: v } })} />
      <div className="sc-field-row">
        <span className="sc-label">Glow</span>
        <Seg
          label="Progress ring glow"
          value={onOff(visual.progressRing.glow)}
          options={[['on', 'On'], ['off', 'Off']]}
          onChange={(v) => update({ progressRing: { ...visual.progressRing, glow: v === 'on' } })}
        />
      </div>
      {visual.progressRing.glow && (
        <SliderInput label="Glow strength" value={visual.progressRing.glowIntensity} min={0} max={50} onChange={(v) => update({ progressRing: { ...visual.progressRing, glowIntensity: v } })} />
      )}

      <h4 style={{ margin: '8px 0 0', fontSize: 13 }}>Numbers</h4>
      <div className="sc-field-row">
        <span className="sc-label">Font</span>
        <select
          className="sc-select sc-grow"
          value={visual.text.fontFamily}
          onChange={(e) => update({ text: { ...visual.text, fontFamily: e.target.value } })}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>{f.split(',')[0].replace(/'/g, '')}</option>
          ))}
        </select>
      </div>
      <ColorInput label="Colour" value={visual.text.color} onChange={(v) => update({ text: { ...visual.text, color: v } })} />
      <SliderInput label="Size" value={visual.text.fontSize} min={24} max={60} format={(v) => `${Math.round((v / DEFAULT_FONT_SIZE) * 100)}%`} onChange={(v) => update({ text: { ...visual.text, fontSize: v } })} />
      <SliderInput label="Shadow" value={visual.text.shadowIntensity} min={0} max={50} onChange={(v) => update({ text: { ...visual.text, shadowIntensity: v } })} />
    </div>
  );
}

export default function SettingsModal({ open, onClose, visual, onChange, onM3EnabledChange, onOpenHelp, onShowWhatsNew }: SettingsModalProps) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>('');
  const [hideShortcut, setHideShortcut] = useState<ShortcutValue>(DEFAULT_SHORTCUT);
  const [m3Enabled, setM3Enabled] = useState(true);
  const [m3Test, setM3Test] = useState<{ running: boolean; result?: M3TestResult }>({ running: false });
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAdvancedOpen(visual.stage.style === 'custom');
    if (window.electronAPI?.getDisplays) {
      window.electronAPI.getDisplays().then(setDisplays).catch(() => setDisplays([]));
    }
    if (window.electronAPI?.getConfig) {
      window.electronAPI.getConfig().then((config: { lastDisplayId?: number | string | null; hideShortcut?: Partial<ShortcutValue>; m3?: { enabled?: boolean } } | null) => {
        if (config?.lastDisplayId != null) setSelectedDisplayId(String(config.lastDisplayId));
        if (config?.hideShortcut) setHideShortcut({ ...DEFAULT_SHORTCUT, ...config.hideShortcut });
        setM3Enabled(config?.m3?.enabled !== false);
      }).catch(() => {});
    }
    window.electronAPI?.getAppInfo?.().then((i) => {
      setAppInfo(i);
      setUpdateInfo(i.update);
    });
    return window.electronAPI?.onUpdateStatus?.(setUpdateInfo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (patch: Partial<VisualSettings>) => onChange({ ...visual, ...patch });
  const setStage = (patch: Partial<StageLook>) => update({ stage: { ...visual.stage, ...patch } });
  const custom = visual.stage.style === 'custom';

  const moveToDisplay = (id: string) => {
    setSelectedDisplayId(id);
    if (window.electronAPI?.moveToDisplay) {
      window.electronAPI.moveToDisplay(id);
    }
  };

  const updateM3Enabled = (enabled: boolean) => {
    setM3Enabled(enabled);
    Promise.resolve(window.electronAPI?.setConfig?.({ m3: { enabled } })).then(() => onM3EnabledChange?.());
  };

  const updateShortcut = (shortcut: ShortcutValue) => {
    setHideShortcut(shortcut);
    if (window.electronAPI?.setConfig) {
      window.electronAPI.setConfig({ hideShortcut: shortcut });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="sc-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
        >
          <div className="sc-dialog__veil" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
            className="sc-dialog__panel sc-dialog__panel--wide"
          >
            <div className="sc-dialog__head">
              <h2>Settings</h2>
              <button className="st-btn st-btn--icon" onClick={onClose} aria-label="Close settings">
                <X />
              </button>
            </div>

            <div className="sc-dialog__body">
              <Section title="Stage look">
                <FitBox className="sc-settings-preview">
                  {/* The real stage component, frozen at 3:15 of 5:00, so the preview always matches the stage. */}
                  <TimerDisplay remainingMs={195_000} totalMs={300_000} endsAt={0} state="idle" visual={visual} windowSize={{ width: 0, height: 0 }} />
                </FitBox>
                <div style={{ marginTop: 16 }}>
                  <Option title="Scene" hint={custom ? 'Not used with your own colours' : 'Behind the countdown'}>
                    <Seg label="Scene" value={visual.stage.scene} disabled={custom} options={[['mountains', 'Mountains'], ['meadow', 'Meadow'], ['lake', 'Lake']]} onChange={(scene) => setStage({ scene })} />
                  </Option>
                  <Option title="Look" hint="Day or night. Auto follows Windows">
                    <Seg label="Look" value={visual.stage.look} disabled={custom} options={[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']]} onChange={(look) => setStage({ look })} />
                  </Option>
                  <Option title="Motion" hint="Plain: the scene stands still. Also when Windows asks for less motion">
                    <Seg label="Motion" value={visual.stage.motion} disabled={custom} options={[['calm', 'Calm'], ['plain', 'Plain']]} onChange={(motion) => setStage({ motion })} />
                  </Option>
                  <Option title="Show “The meeting starts in”" hint="Above the numbers">
                    <Switch label="Show the line above the numbers" checked={visual.stage.showKicker} disabled={custom} onChange={(showKicker) => setStage({ showKicker })} />
                  </Option>
                  <Option title="Number size">
                    <Seg label="Number size" value={visual.stage.numberSize} disabled={custom} options={[['smaller', 'Smaller'], ['normal', 'Normal'], ['larger', 'Larger']]} onChange={(numberSize) => setStage({ numberSize })} />
                  </Option>
                  <Option title="Advanced" hint="Your own colours, glow and shadow">
                    <button type="button" className="st-btn st-btn--quiet" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)}>
                      {advancedOpen ? 'Close' : 'Open'}
                    </button>
                  </Option>
                </div>
                {advancedOpen && (
                  <div className="sc-subcard">
                    <Option title="Use my own colours" hint="Replaces the scene with a plain ring in the colours below">
                      <Switch label="Use my own colours" checked={custom} onChange={(on) => setStage({ style: on ? 'custom' : 'scene' })} />
                    </Option>
                    <div className={custom ? undefined : 'sc-disabled'} aria-disabled={!custom}>
                      <OwnColours visual={visual} update={update} />
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Display">
                {displays.length > 0 ? (
                  <select className="sc-select" style={{ width: '100%' }} value={selectedDisplayId} onChange={(e) => moveToDisplay(e.target.value)} aria-label="Display">
                    <option value="">Automatic (first display that isn't this one)</option>
                    {displays.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.label}{d.primary ? ' (Primary)' : ''} — {d.bounds.width}×{d.bounds.height}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="sc-hint" style={{ marginTop: 0 }}>The display list is available in the desktop app.</p>
                )}
                <p className="sc-hint">Where the countdown appears. Automatic picks a display other than the one this controller is on.</p>
              </Section>

              <Section title="Meeting Media Manager (M³)">
                <p className="sc-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                  If you use M³, the countdown hides its media window while it runs and gives it back afterwards, by sending M³'s
                  "Media Window" shortcut. Turn this off to use Stage Countdown on its own: nothing is hidden and no shortcut is sent.
                </p>
                <Option title="Control M³'s media window">
                  <Switch label="Control M³'s media window" checked={m3Enabled} onChange={updateM3Enabled} />
                </Option>
                <div className={`sc-stack ${m3Enabled ? '' : 'sc-disabled'}`} style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                  <ShortcutRecorder value={hideShortcut} onChange={updateShortcut} />
                  <div>
                    <button
                      type="button"
                      className="st-btn st-btn--secondary"
                      disabled={m3Test.running}
                      onClick={() => {
                        setM3Test({ running: true });
                        window.electronAPI?.m3Test?.().then((result) => setM3Test({ running: false, result }));
                      }}
                      title="Presses the shortcut once and checks that M³'s media display really reacted, then puts it back"
                    >
                      {m3Test.running ? 'Testing…' : 'Test the shortcut'}
                    </button>
                    {m3Test.result && <M3TestMessage result={m3Test.result} />}
                  </div>
                  <p className="sc-hint" style={{ marginTop: 0 }}>
                    Must be the same as the "Media Window" shortcut in M³ (M³ Settings → Interface &amp; Shortcuts → turn on keyboard shortcuts).{' '}
                    <button type="button" className="sc-link" onClick={() => onOpenHelp?.('m3')}>How to set it up</button>
                  </p>
                </div>
              </Section>

              <Section title="OBS scene switching">
                <ObsSettings />
              </Section>

              <Section title="Startup & schedule">
                <ScheduleSettings />
              </Section>

              <Section title="Clock">
                <Option title="Clock format" hint="The clock in the top bar and the OBS dock">
                  <Seg
                    label="Clock format"
                    value={visual.clock24h ? '24h' : '12h'}
                    options={[['24h', '24 hour'], ['12h', '12 hour']]}
                    onChange={(v) => update({ clock24h: v === '24h' })}
                  />
                </Option>
              </Section>

              <Section title="About & updates">
                <div className="sc-field-row" style={{ justifyContent: 'space-between' }}>
                  <b>Stage Countdown {appInfo ? appInfo.version : ''}</b>
                  <span style={{ fontSize: 13, color: updateInfo?.status === 'ready' ? 'var(--brand-strong)' : 'var(--text-dim)' }}>
                    {updateInfo?.status === 'ready' ? `Update ${updateInfo.version} ready`
                      : updateInfo?.status === 'downloading' ? `Downloading update ${updateInfo.version} (${updateInfo.percent}%)`
                      : updateInfo?.status === 'checking' ? 'Checking…'
                      : updateInfo?.status === 'up-to-date' ? 'Up to date'
                      : updateInfo?.status === 'error' ? 'Could not check'
                      : updateInfo?.status === 'disabled' ? (updateInfo.reason === 'portable' ? 'Portable: no auto-update' : 'Updates off (dev run)')
                      : ''}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className={`st-btn ${updateInfo?.status === 'ready' ? 'st-btn--primary' : 'st-btn--secondary'}`}
                    onClick={() => (updateInfo?.status === 'ready' ? window.electronAPI?.updateInstall?.() : window.electronAPI?.updateCheck?.())}
                  >
                    {updateInfo?.status === 'ready' ? 'Restart and update…' : 'Check for updates'}
                  </button>
                  <button type="button" className="st-btn st-btn--secondary" onClick={onShowWhatsNew}>What's new</button>
                  <button type="button" className="st-btn st-btn--secondary" onClick={() => onOpenHelp?.('start')}>Help</button>
                  <button type="button" className="st-btn st-btn--secondary" onClick={() => window.electronAPI?.openLogs?.()}>Open logs folder</button>
                </div>
                <p className="sc-hint">
                  The app checks for a new version every time it starts and downloads it quietly. It is never installed in the middle of a meeting
                  without you choosing it (the "Update ready" notice, the tray menu) — or it installs when you quit.
                </p>
              </Section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
