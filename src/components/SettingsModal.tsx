import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Palette, Circle, Type, Clock, Keyboard, type LucideIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { VisualSettings } from '@/types';
import { FONT_OPTIONS } from '@/types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
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
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
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
      <span className="text-xs font-mono text-gray-300 w-12 text-right">{value}{unit}</span>
    </div>
  );
}

function MiniPreview({ visual }: { visual: VisualSettings }) {
  const size = 120;
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  const progress = 0.65;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className="flex items-center justify-center rounded-xl"
      style={{
        width: size + 24,
        height: size + 24,
        background: visual.background.mode === 'gradient'
          ? `linear-gradient(135deg, ${visual.background.color1}, ${visual.background.color2})`
          : visual.background.color1,
        opacity: visual.background.opacity,
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="preview-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={visual.progressRing.color1} />
            <stop offset="100%" stopColor={visual.progressRing.color2} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={visual.trackRing.color} strokeWidth={visual.trackRing.thickness / 2} opacity={0.5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={visual.progressRing.gradient ? 'url(#preview-grad)' : visual.progressRing.color1}
          strokeWidth={visual.progressRing.thickness / 2}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span
        className="absolute font-bold tabular-nums"
        style={{
          fontFamily: visual.text.fontFamily,
          color: visual.text.color,
          fontSize: '14px',
          textShadow: visual.text.shadowIntensity > 0 ? `0 0 ${visual.text.shadowIntensity / 2}px ${visual.text.color}80` : 'none',
        }}
      >
        03:15
      </span>
    </div>
  );
}

export default function SettingsModal({ open, onClose, visual, onChange }: SettingsModalProps) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>('');
  const [hideShortcut, setHideShortcut] = useState<ShortcutValue>(DEFAULT_SHORTCUT);

  useEffect(() => {
    if (!open) return;
    if (window.electronAPI?.getDisplays) {
      window.electronAPI.getDisplays().then(setDisplays).catch(() => setDisplays([]));
    }
    if (window.electronAPI?.getConfig) {
      window.electronAPI.getConfig().then((config: any) => {
        if (config?.lastDisplayId != null) setSelectedDisplayId(String(config.lastDisplayId));
        if (config?.hideShortcut) setHideShortcut({ ...DEFAULT_SHORTCUT, ...config.hideShortcut });
      }).catch(() => {});
    }
  }, [open]);

  const update = (patch: Partial<VisualSettings>) => onChange({ ...visual, ...patch });

  const moveToDisplay = (id: string) => {
    setSelectedDisplayId(id);
    if (window.electronAPI?.moveToDisplay) {
      window.electronAPI.moveToDisplay(id);
    }
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
                  Defaults to the first non-primary display on launch — pick a different one here if needed.
                </p>
              </div>

              {/* Hide/Show Shortcut */}
              <div>
                <SectionTitle icon={Keyboard} title="Hide/Show Shortcut" />
                <ShortcutRecorder value={hideShortcut} onChange={updateShortcut} />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Sent to the meeting media manager to hide/show its Yeartext window before and after each countdown.
                </p>
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
                  <SliderInput label="Font Size" value={visual.text.fontSize} min={20} max={96} unit="px" onChange={(v) => update({ text: { ...visual.text, fontSize: v } })} />
                  <SliderInput label="Shadow" value={visual.text.shadowIntensity} min={0} max={50} onChange={(v) => update({ text: { ...visual.text, shadowIntensity: v } })} />
                </div>
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
