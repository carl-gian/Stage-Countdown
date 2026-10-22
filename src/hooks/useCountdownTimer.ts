import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimerState, TimerSettings } from '@/types';

const STORAGE_KEY = 'stagecountdown:visual';

/**
 * Wall-clock countdown. It stores an absolute end time and recomputes from Date.now(), driven by a
 * timer (not requestAnimationFrame), so it keeps going when the window is minimized or covered.
 * React state only changes once per displayed second; smooth visuals are drawn by TimerDisplay.
 */
export function useCountdownTimer() {
  const [state, setState] = useState<TimerState>('idle');
  const [settings, setSettings] = useState<TimerSettings>({ minutes: 5, seconds: 0 });
  const [totalMs, setTotalMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [endsAt, setEndsAt] = useState(0);

  const endRef = useRef(0);
  const pausedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const durationMs = settings.minutes * 60_000 + settings.seconds * 1000;

  const clearTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (endTimeoutRef.current) clearTimeout(endTimeoutRef.current);
    intervalRef.current = null;
    endTimeoutRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const rem = endRef.current - Date.now();
    if (rem <= 0) {
      clearTimers();
      setRemainingMs(0);
      setEndsAt(0);
      setState('complete');
      return;
    }
    // Same displayed second -> same value -> React skips the render.
    setRemainingMs((prev) => (Math.ceil(prev / 1000) === Math.ceil(rem / 1000) ? prev : rem));
  }, [clearTimers]);

  const run = useCallback(
    (ms: number) => {
      clearTimers();
      endRef.current = Date.now() + ms;
      setEndsAt(endRef.current);
      setRemainingMs(ms);
      setState('running');
      intervalRef.current = setInterval(tick, 200);
      endTimeoutRef.current = setTimeout(tick, ms + 5); // finish on time, not up to 200ms late
    },
    [clearTimers, tick]
  );

  /** Starts a fresh countdown. `overrideMs` is used by "Countdown to Time". */
  const start = useCallback(
    (overrideMs?: number) => {
      const ms = overrideMs ?? settings.minutes * 60_000 + settings.seconds * 1000;
      if (ms <= 0) return;
      setTotalMs(ms);
      run(ms);
    },
    [settings, run]
  );

  const pause = useCallback(() => {
    if (state !== 'running') return;
    pausedRef.current = Math.max(0, endRef.current - Date.now());
    clearTimers();
    setRemainingMs(pausedRef.current);
    setEndsAt(0);
    setState('paused');
  }, [state, clearTimers]);

  const resume = useCallback(() => {
    if (state !== 'paused') return;
    run(pausedRef.current);
  }, [state, run]);

  const stop = useCallback(() => {
    clearTimers();
    setState('idle');
    setRemainingMs(0);
    setTotalMs(0);
    setEndsAt(0);
  }, [clearTimers]);

  const restart = useCallback(() => start(), [start]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    state,
    settings,
    setSettings,
    totalMs,
    remainingMs,
    endsAt,
    durationMs,
    start,
    pause,
    resume,
    stop,
    restart,
  };
}

export function saveVisualSettings(settings: unknown) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
