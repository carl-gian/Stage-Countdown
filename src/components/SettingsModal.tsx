import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Palette, Circle, Type, Clock, Keyboard, CalendarClock, Video, Info, type LucideIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { VisualSettings } from '@/types';
import { FONT_OPTIONS } from '@/types';
import TimerDisplay, { DEFAULT_FONT_SIZE } from '@/components/TimerDisplay';
import ScheduleSettings from '@/components/ScheduleSettings';
import ObsSettings from '@/components/ObsSettings';

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
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-20">Shortcut</span>
      <button
        onClick={() => setRecording(true)}
        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
          recording
            ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300 animate-pulse'
            : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'
        }`}
      >
        {recording ? 'Press a key combo…' : formatShortcut(value)}
      </button>
      {!recording && (
        <button
          onClick={() => onChange(DEFAULT_SHORTCUT)}
          title="Reset to default (Shift+Alt+F3)"
          className="text-xs text-gray-500 hover:text-gray-300 px-1.5 shrink-0"
        >
          Reset
        </button>
      )}
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} />
      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</span>
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-20">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/10"
      />
      <span className="text-xs font-mono text-gray-500">{value}</span>
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
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-24">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-emerald-400 h-1"
      />
      <span className="text-xs font-mono text-gray-300 w-12 text-right">{format ? format(value) : `${value}${unit}`}</span>
    </div>
  );
}

// The real stage component, frozen at 3:15 of 5:00, so the preview always matches the stage.
function MiniPreview({ visual }: { visual: VisualSettings }) {
  const box = 168;
  const bg = visual.background.mode === 'gradient'
    ? `linear-gradient(135deg, ${visual.background.color1}, ${visual.background.color2})`
    : visual.background.color1;
  return (
    <div className="relative flex items-center justify-center rounded-xl overflow-hidden border border-white/10" style={{ width: box, height: box }}>
      <div className="absolute inset-0" style={{ background: bg, opacity: visual.background.opacity }} />
      <TimerDisplay
        remainingMs={195_000}
        totalMs={300_000}
        endsAt={0}
        state="idle"
        visual={visual}
        windowSize={{ width: box / 0.6 * 0.9, height: box / 0.6 * 0.9 }}
        hideStatus
      />
    </div>
  );
}

export default function SettingsModal({ open, onClose, visual, onChange, onM3EnabledChange, onOpenHelp, onShowWhatsNew }: SettingsModalProps) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>('');
  const [hideShortcut, setHideShortcut] = useState<ShortcutValue>(DEFAULT_SHORTCUT);
  const [m3Enabled, setM3Enabled] = useState(true);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const update = (patch: Partial<VisualSettings>) => onChange({ ...visual, ...patch });

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
          className="absolute inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md max-h-[85%] overflow-y-auto rounded-2xl border border-white/10 bg-[#12121a] shadow-2xl mx-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 sticky top-0 bg-[#12121a] z-10">
              <h2 className="text-base font-bold text-white">Settings</h2>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Live Preview */}
              <div className="flex flex-col items-center gap-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Live Preview</span>
                <div className="relative">
                  <MiniPreview visual={visual} />
                </div>
              </div>

              {/* Display Selector */}
              <div>
                <SectionTitle icon={Monitor} title="Display" />
                {displays.length > 0 ? (
                  <select
                    value={selectedDisplayId}
                    onChange={(e) => moveToDisplay(e.target.value)}
                    className="w-full bg-white/5 text-gray-200 text-sm rounded-lg px-3 py-2 border border-white/10 outline-none"
                  >
                    <option value="" className="bg-[#12121a]">Automatic (first display that isn't this one)</option>
                    {displays.map((d) => (
                      <option key={d.id} value={String(d.id)} className="bg-[#12121a]">
                        {d.label}{d.primary ? ' (Primary)' : ''} — {d.bounds.width}×{d.bounds.height}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 text-xs text-gray-500 rounded-lg bg-white/5">
                    Display list available in Electron environment
                  </div>
                )}
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Where the countdown appears. Automatic picks a display other than the one this controller is on.
                </p>
              </div>

              {/* Meeting Media Manager */}
              <div>
                <SectionTitle icon={Keyboard} title="Meeting Media Manager (M³)" />
                <p className="text-[11px] leading-relaxed text-gray-400 mb-2.5">
                  If you use M³, the countdown hides its media window while it runs and gives it back afterwards, by sending M³'s
                  "Media Window" shortcut. Turn this off to use Stage Countdown on its own: nothing is hidden and no shortcut is sent.
                </p>
                <label className="flex items-center justify-between gap-4 cursor-pointer mb-3">
                  <span className="text-sm font-semibold text-gray-200">Control M³'s media window</span>
                  <input
                    type="checkbox"
                    checked={m3Enabled}
                    onChange={(e) => updateM3Enabled(e.target.checked)}
                    className="w-5 h-5 accent-emerald-500 shrink-0"
                  />
                </label>
                <div className={`transition-opacity ${m3Enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  <ShortcutRecorder value={hideShortcut} onChange={updateShortcut} />
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Must be the same as the "Media Window" shortcut in M³ (M³ Settings → Interface &amp; Shortcuts → turn on keyboard shortcuts).
                    <button onClick={() => onOpenHelp?.('m3')} className="ml-1 text-emerald-400 hover:underline">How to set it up</button>
                  </p>
                </div>
              </div>

              {/* Background */}
              <div>
                <SectionTitle icon={Palette} title="Background" />
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-20">Mode</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => update({ background: { ...visual.background, mode: 'solid' } })}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${visual.background.mode === 'solid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400'}`}
                      >
                        Solid
                      </button>
                      <button
                        onClick={() => update({ background: { ...visual.background, mode: 'gradient' } })}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${visual.background.mode === 'gradient' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400'}`}
                      >
                        Gradient
                      </button>
                    </div>
                  </div>
                  <ColorInput label="Color 1" value={visual.background.color1} onChange={(v) => update({ background: { ...visual.background, color1: v } })} />
                  {visual.background.mode === 'gradient' && (
                    <ColorInput label="Color 2" value={visual.background.color2} onChange={(v) => update({ background: { ...visual.background, color2: v } })} />
                  )}
                  <SliderInput label="Opacity" value={visual.background.opacity} min={0.3} max={1} step={0.05} onChange={(v) => update({ background: { ...visual.background, opacity: v } })} />
                </div>
              </div>

              {/* Track Ring */}
              <div>
                <SectionTitle icon={Circle} title="Track Ring" />
                <div className="space-y-2.5">
                  <ColorInput label="Color" value={visual.trackRing.color} onChange={(v) => update({ trackRing: { ...visual.trackRing, color: v } })} />
                  <SliderInput label="Thickness" value={visual.trackRing.thickness} min={2} max={30} unit="px" onChange={(v) => update({ trackRing: { ...visual.trackRing, thickness: v } })} />
                </div>
              </div>

              {/* Progress Ring */}
              <div>
                <SectionTitle icon={Circle} title="Progress Ring" />
                <div className="space-y-2.5">
                  <ColorInput label="Color 1" value={visual.progressRing.color1} onChange={(v) => update({ progressRing: { ...visual.progressRing, color1: v } })} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-20">Gradient</span>
                    <button
                      onClick={() => update({ progressRing: { ...visual.progressRing, gradient: !visual.progressRing.gradient } })}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${visual.progressRing.gradient ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400'}`}
                    >
                      {visual.progressRing.gradient ? 'On' : 'Off'}
                    </button>
                  </div>
                  {visual.progressRing.gradient && (
                    <ColorInput label="Color 2" value={visual.progressRing.color2} onChange={(v) => update({ progressRing: { ...visual.progressRing, color2: v } })} />
                  )}
                  <SliderInput label="Thickness" value={visual.progressRing.thickness} min={2} max={30} unit="px" onChange={(v) => update({ progressRing: { ...visual.progressRing, thickness: v } })} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-20">Glow</span>
                    <button
                      onClick={() => update({ progressRing: { ...visual.progressRing, glow: !visual.progressRing.glow } })}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${visual.progressRing.glow ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400'}`}
                    >
                      {visual.progressRing.glow ? 'On' : 'Off'}
                    </button>
                  </div>
                  {visual.progressRing.glow && (
                    <SliderInput label="Glow Intensity" value={visual.progressRing.glowIntensity} min={0} max={50} onChange={(v) => update({ progressRing: { ...visual.progressRing, glowIntensity: v } })} />
                  )}
                </div>
              </div>

              {/* Digital Text */}
              <div>
                <SectionTitle icon={Type} title="Digital Text" />
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-20">Font</span>
                    <select
                      value={visual.text.fontFamily}
                      onChange={(e) => update({ text: { ...visual.text, fontFamily: e.target.value } })}
                      className="flex-1 bg-white/5 text-gray-200 text-xs rounded-lg px-2 py-1.5 border border-white/10 outline-none"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f} value={f} className="bg-[#12121a]">{f.split(',')[0].replace(/'/g, '')}</option>
                      ))}
                    </select>
                  </div>
                  <ColorInput label="Text Color" value={visual.text.color} onChange={(v) => update({ text: { ...visual.text, color: v } })} />
                  <SliderInput label="Font Size" value={visual.text.fontSize} min={24} max={60} format={(v) => `${Math.round((v / DEFAULT_FONT_SIZE) * 100)}%`} onChange={(v) => update({ text: { ...visual.text, fontSize: v } })} />
                  <SliderInput label="Shadow" value={visual.text.shadowIntensity} min={0} max={50} onChange={(v) => update({ text: { ...visual.text, shadowIntensity: v } })} />
                </div>
              </div>

              {/* OBS Scene Switching */}
              <div>
                <SectionTitle icon={Video} title="OBS Scene Switching" />
                <ObsSettings />
              </div>

              {/* Startup & Schedule */}
              <div>
                <SectionTitle icon={CalendarClock} title="Startup & Schedule" />
                <ScheduleSettings />
              </div>

              {/* Clock Format */}
              <div>
                <SectionTitle icon={Clock} title="Clock Format" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-20">Format</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => update({ clock24h: true })}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${visual.clock24h ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400'}`}
                    >
                      24h
                    </button>
                    <button
                      onClick={() => update({ clock24h: false })}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${!visual.clock24h ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400'}`}
                    >
                      12h
                    </button>
                  </div>
                </div>
              </div>

              {/* About & updates */}
              <div>
                <SectionTitle icon={Info} title="About & updates" />
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-300">Stage Countdown {appInfo ? appInfo.version : ''}</span>
                    <span className={`text-xs ${updateInfo?.status === 'ready' ? 'text-blue-300' : 'text-gray-500'}`}>
                      {updateInfo?.status === 'ready' ? `Update ${updateInfo.version} ready`
                        : updateInfo?.status === 'downloading' ? `Downloading update ${updateInfo.version} (${updateInfo.percent}%)`
                        : updateInfo?.status === 'checking' ? 'Checking…'
                        : updateInfo?.status === 'up-to-date' ? 'Up to date'
                        : updateInfo?.status === 'error' ? 'Could not check'
                        : updateInfo?.status === 'disabled' ? (updateInfo.reason === 'portable' ? 'Portable: no auto-update' : 'Updates off (dev run)')
                        : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => (updateInfo?.status === 'ready' ? window.electronAPI?.updateInstall?.() : window.electronAPI?.updateCheck?.())}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20"
                    >
                      {updateInfo?.status === 'ready' ? 'Restart and update…' : 'Check for updates'}
                    </button>
                    <button onClick={onShowWhatsNew} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20">
                      What's new
                    </button>
                    <button onClick={() => onOpenHelp?.('start')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20">
                      Help
                    </button>
                    <button onClick={() => window.electronAPI?.openLogs?.()} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20">
                      Open logs folder
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    The app checks for a new version every time it starts and downloads it quietly. It is never installed in the middle of a meeting
                    without you choosing it (the blue "Update ready" badge, the tray menu) — or it installs when you quit.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
