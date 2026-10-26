import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Clock,
  Pin,
  PinOff,
  Settings,
  Plus,
  Minus,
  SkipForward,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TimerState, VisualSettings } from '@/types';

interface ControllerProps {
  state: TimerState;
  minutes: number;
  seconds: number;
  onMinutesChange: (m: number) => void;
  onSecondsChange: (s: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRestart: () => void;
  onSetNewTime: () => void;
  onOpenSettings: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  visual: VisualSettings;
  children: React.ReactNode;
  /** When true, freezes the minute/second steppers (e.g. a "countdown to
   * time" target is staged) even though the timer is otherwise idle/editable. */
  disableTimeInputs?: boolean;
  /** A start/end/stop sequence in progress (controls are replaced by its status). */
  phase?: Phase;
  /** Ends the current hold early (only offered while 00:00 is held after a countdown). */
  onSkipPhase?: () => void;
}

export type Phase = {
  kind: 'starting' | 'ending' | 'returning' | 'stopping';
  /** Epoch ms the phase ends, for a live "in Ns" countdown. */
  until?: number;
} | null;

const PHASE_BADGE: Record<NonNullable<Phase>['kind'], string> = {
  starting: 'Starting…',
  ending: "Time's up",
  returning: 'Showing M³…',
  stopping: 'Stopping…',
};

function useSecondsLeft(until?: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : null;
}

function PhaseStatus({ phase, onSkip }: { phase: NonNullable<Phase>; onSkip?: () => void }) {
  const secs = useSecondsLeft(phase.until);
  const text = {
    starting: secs !== null ? `Hiding M³ · counting starts in ${secs}s` : 'Hiding M³…',
    ending: secs !== null ? `Holding 00:00 · back to M³ in ${secs}s` : 'Holding 00:00…',
    returning: 'Bringing M³ back…',
    stopping: 'Stopping · bringing M³ back…',
  }[phase.kind];
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <motion.div
        animate={{ opacity: [1, 0.55, 1] }}
        transition={{ duration: 1.2, repeat: Infinity }}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-[#2a2a3d] text-gray-200 tabular-nums"
      >
        <Clock size={16} />
        {text}
      </motion.div>
      {phase.kind === 'ending' && onSkip && (
        <ControlButton icon={SkipForward} label="Back to M³ now" onClick={onSkip} variant="secondary" />
      )}
    </div>
  );
}

function StatusBadge({ state, phase }: { state: TimerState; phase?: Phase }) {
  const config: Record<TimerState, { label: string; color: string; bg: string }> = {
    idle: { label: 'Idle', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
    running: { label: 'Running', color: '#00d4aa', bg: 'rgba(0,212,170,0.15)' },
    paused: { label: 'Paused', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    complete: { label: 'Complete', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  };
  // A sequence in progress overrides the timer state so the badge never sits frozen.
  const { label, color, bg } = phase
    ? { label: PHASE_BADGE[phase.kind], color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' }
    : config[state];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ color, backgroundColor: bg }}
    >
      <motion.span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
        animate={{ opacity: state === 'running' || phase ? [1, 0.3, 1] : 1 }}
        transition={{ duration: phase ? 0.6 : 1.2, repeat: Infinity }}
      />
      {label}
    </motion.div>
  );
}

function TimeInput({
  label,
  value,
  max,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">{label}</span>
      <div className="flex flex-col items-center gap-0.5">
        <button
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          onClick={() => onChange(clamp(value + 1))}
          disabled={disabled}
        >
          <Plus size={14} />
        </button>
        <input
          type="number"
          value={value}
          min={0}
          max={max}
          disabled={disabled}
          onChange={(e) => onChange(clamp(parseInt(e.target.value) || 0))}
          className="w-14 text-center text-2xl font-bold bg-transparent text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          onClick={() => onChange(clamp(value - 1))}
          disabled={disabled}
        >
          <Minus size={14} />
        </button>
      </div>
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  onClick,
  variant = 'primary',
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const styles = {
    primary: { bg: '#00d4aa', hover: '#00b894', text: '#0a0a0f' },
    secondary: { bg: '#2a2a3d', hover: '#353550', text: '#e5e7eb' },
    danger: { bg: '#ef4444', hover: '#dc2626', text: '#ffffff' },
  };
  const s = styles[variant];
  return (
    <motion.button
      whileHover={{ scale: 1.04, backgroundColor: s.hover }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <Icon size={16} />
      {label}
    </motion.button>
  );
}

export default function Controller({
  state,
  minutes,
  seconds,
  onMinutesChange,
  onSecondsChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onRestart,
  onSetNewTime,
  onOpenSettings,
  pinned,
  onTogglePin,
  visual,
  children,
  disableTimeInputs = false,
  phase = null,
  onSkipPhase,
}: ControllerProps) {
  const inSequence = phase !== null;
  const [clockTime, setClockTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      if (visual.clock24h) {
        setClockTime(
          `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        );
      } else {
        const h12 = h % 12 || 12;
        const ampm = h >= 12 ? 'PM' : 'AM';
        setClockTime(
          `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm}`
        );
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [visual.clock24h]);

  const canEdit = state === 'idle' || state === 'complete';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gray-400" />
          <span className="text-sm font-mono font-semibold text-gray-200 tabular-nums">
            {clockTime}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge state={state} phase={phase} />
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onTogglePin}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title={pinned ? 'Unpin from top' : 'Pin on top'}
          >
            {pinned ? (
              <Pin size={16} className="text-emerald-400" />
            ) : (
              <PinOff size={16} className="text-gray-500" />
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title="Settings"
          >
            <Settings size={16} className="text-gray-400 hover:text-white transition-colors" />
          </motion.button>
        </div>
      </div>

      {/* Time input row */}
      <AnimatePresence>
        {canEdit && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col items-center gap-1.5 px-5 py-3 border-b border-white/5 overflow-hidden"
          >
            <div
              className={`flex items-center justify-center gap-6 transition-opacity ${
                disableTimeInputs || inSequence ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <TimeInput
                label="Minutes"
                value={minutes}
                max={99}
                onChange={onMinutesChange}
                disabled={!canEdit || disableTimeInputs || inSequence}
              />
              <span className="text-3xl font-bold text-gray-600 -mt-4">:</span>
              <TimeInput
                label="Seconds"
                value={seconds}
                max={59}
                onChange={onSecondsChange}
                disabled={!canEdit || disableTimeInputs || inSequence}
              />
            </div>
            {!inSequence && (
              disableTimeInputs && (
                <span className="text-[10px] uppercase tracking-widest text-emerald-500/80 font-semibold">
                  Locked — target time set
                </span>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timer display area */}
      <div className="flex-1 flex items-center justify-center">
        {children}
      </div>

      {/* Control buttons */}
      <div className="px-5 py-4 border-t border-white/5">
        <AnimatePresence mode="wait">
          {phase ? (
            <motion.div
              key={`phase-${phase.kind}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <PhaseStatus phase={phase} onSkip={onSkipPhase} />
            </motion.div>
          ) : state === 'idle' && (
            <motion.div
              key="idle-controls"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex justify-center"
            >
              <ControlButton icon={Play} label="Start" onClick={onStart} variant="primary" />
            </motion.div>
          )}

          {!inSequence && state === 'running' && (
            <motion.div
              key="running-controls"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex justify-center gap-3"
            >
              <ControlButton icon={Pause} label="Pause" onClick={onPause} variant="secondary" />
              <ControlButton icon={Square} label="Stop" onClick={onStop} variant="danger" />
            </motion.div>
          )}

          {!inSequence && state === 'paused' && (
            <motion.div
              key="paused-controls"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex justify-center gap-2 flex-wrap"
            >
              <ControlButton icon={Play} label="Resume" onClick={onResume} variant="primary" />
              <ControlButton icon={RotateCcw} label="Restart" onClick={onRestart} variant="secondary" />
              <ControlButton icon={Square} label="Set New Time" onClick={onSetNewTime} variant="secondary" />
            </motion.div>
          )}

          {!inSequence && state === 'complete' && (
            <motion.div
              key="complete-controls"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex justify-center gap-2 flex-wrap"
            >
              <ControlButton icon={RotateCcw} label="Restart" onClick={onRestart} variant="primary" />
              <ControlButton icon={Square} label="Set New Time" onClick={onSetNewTime} variant="secondary" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
