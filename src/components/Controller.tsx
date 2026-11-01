import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Square, RotateCcw, Pin, PinOff, SlidersHorizontal, HelpCircle, Plus, Minus, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import FitBox from '@/components/FitBox';
import { stateLabel } from '@/lib/stateLabel';
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
  onOpenHelp: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  visual: VisualSettings;
  /** The stage preview (a TimerDisplay; it fits the space it is given). */
  children: React.ReactNode;
  /** Status pills under the top bar (state, M³, OBS). */
  pills?: React.ReactNode;
  /** Update notice, shown above the preview. */
  banner?: React.ReactNode;
  /** The "Count down to a time" row, shown under the steppers while the time can be set. */
  targetTime?: React.ReactNode;
  /** Shown while counting (e.g. "M³ is hidden and guarded until the end"). */
  countingNote?: string;
  /** The M³ / OBS / auto-close rows (st-option rows). */
  options?: React.ReactNode;
  /** When true, freezes the minute/second steppers (e.g. a "countdown to
   * time" target is staged) even though the timer is otherwise idle/editable. */
  disableTimeInputs?: boolean;
  /** Shown under the locked steppers, e.g. "Counting down to 19:30". */
  lockedNote?: string;
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
    <div className="sc-phase" role="status">
      <i />
      <span>{text}</span>
      {phase.kind === 'ending' && onSkip && (
        <button className="st-btn st-btn--soft" onClick={onSkip}>
          <SkipForward />
          Back to M³ now
        </button>
      )}
    </div>
  );
}

function TimeInput({
  label,
  unit,
  value,
  max,
  onChange,
  disabled,
}: {
  label: string;
  unit: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  return (
    <div className="sc-field">
      <span>{label}</span>
      <div>
        <button className="st-btn st-btn--round st-btn--secondary" onClick={() => onChange(clamp(value - 1))} disabled={disabled} aria-label={`One ${unit} less`}>
          <Minus />
        </button>
        <input
          type="number"
          value={String(value).padStart(2, '0')}
          min={0}
          max={max}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(clamp(parseInt(e.target.value) || 0))}
        />
        <button className="st-btn st-btn--round st-btn--secondary" onClick={() => onChange(clamp(value + 1))} disabled={disabled} aria-label={`One ${unit} more`}>
          <Plus />
        </button>
      </div>
    </div>
  );
}

const swap = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.18 },
};

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
  onOpenHelp,
  pinned,
  onTogglePin,
  visual,
  children,
  pills,
  banner,
  targetTime,
  countingNote,
  options,
  disableTimeInputs = false,
  lockedNote,
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
  const timeLocked = !canEdit || disableTimeInputs || inSequence;
  const { label } = stateLabel(state, phase);

  return (
    <>
      <header className="st-topbar">
        <div className="st-topbar__title">
          <b>Stage Countdown</b>
          <small>{label}</small>
        </div>
        <time className="st-topbar__clock st-num">{clockTime}</time>
        <button
          className="st-btn st-btn--icon"
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label="Keep this window on top"
          title={pinned ? 'Kept on top: click to let other windows cover it' : 'Keep this window on top'}
        >
          {pinned ? <Pin /> : <PinOff />}
        </button>
        <button className="st-btn st-btn--icon" onClick={onOpenHelp} aria-label="Help" title="Help (F1)">
          <HelpCircle />
        </button>
        <button className="st-btn st-btn--icon" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <SlidersHorizontal />
        </button>
      </header>

      <div className="sc-body">
        {pills && <div className="sc-pills">{pills}</div>}
        {banner}

        <FitBox className="sc-preview">{children}</FitBox>

        <AnimatePresence initial={false}>
          {canEdit && !inSequence && (
            <motion.section key="time" className="st-card" {...swap}>
              <div className="sc-stepper">
                <TimeInput label="Minutes" unit="minute" value={minutes} max={99} onChange={onMinutesChange} disabled={timeLocked} />
                <span className="sc-sep">:</span>
                <TimeInput label="Seconds" unit="second" value={seconds} max={59} onChange={onSecondsChange} disabled={timeLocked} />
              </div>
              {disableTimeInputs && lockedNote && <p className="sc-locked">{lockedNote}</p>}
              {targetTime}
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {phase ? (
            <motion.div key={`phase-${phase.kind}`} {...swap}>
              <PhaseStatus phase={phase} onSkip={onSkipPhase} />
            </motion.div>
          ) : state === 'idle' ? (
            <motion.div key="idle" {...swap}>
              <button className="st-btn st-btn--primary st-btn--main st-btn--block" onClick={onStart}>
                <Play fill="currentColor" />
                Start
              </button>
            </motion.div>
          ) : state === 'running' ? (
            <motion.div key="running" className="sc-row2" {...swap}>
              <button className="st-btn st-btn--secondary st-btn--main" onClick={onPause}>
                <Pause fill="currentColor" />
                Pause
              </button>
              <button className="st-btn st-btn--danger st-btn--main" onClick={onStop}>
                <Square fill="currentColor" />
                Stop
              </button>
            </motion.div>
          ) : state === 'paused' ? (
            <motion.div key="paused" className="sc-row3" {...swap}>
              <button className="st-btn st-btn--primary st-btn--main" onClick={onResume}>
                <Play fill="currentColor" />
                Resume
              </button>
              <button className="st-btn st-btn--secondary st-btn--main" onClick={onRestart}>
                <RotateCcw />
                Restart
              </button>
              <button className="st-btn st-btn--secondary st-btn--main" onClick={onSetNewTime}>
                <Square />
                Set new time
              </button>
            </motion.div>
          ) : (
            <motion.div key="complete" className="sc-row2" {...swap}>
              <button className="st-btn st-btn--primary st-btn--main" onClick={onRestart}>
                <RotateCcw />
                Restart
              </button>
              <button className="st-btn st-btn--secondary st-btn--main" onClick={onSetNewTime}>
                <Square />
                Set new time
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!inSequence && (state === 'running' || state === 'paused') && countingNote && (
          <div className="sc-phase sc-phase--quiet" role="status">
            <i />
            <span>{countingNote}</span>
          </div>
        )}

        {options && <section className="st-card">{options}</section>}
      </div>
    </>
  );
}
