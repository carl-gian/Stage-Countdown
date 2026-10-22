import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimerState, TimerSettings } from '@/types';

const STORAGE_KEY = 'stagecountdown:visual';

export function useCountdownTimer() {
  const [state, setState] = useState<TimerState>('idle');
  const [settings, setSettings] = useState<TimerSettings>({ minutes: 5, seconds: 0 });
  const [totalMs, setTotalMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const rafRef = useRef<number | null>(null);
  const endRef = useRef<number>(0);
  const pausedRef = useRef<number>(0);

  const durationMs = settings.minutes * 60_000 + settings.seconds * 1000;

  const tick = useCallback(() => {
    const now = performance.now();
    const rem = endRef.current - now;
    if (rem <= 0) {
      setRemainingMs(0);
      setState('complete');
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    setRemainingMs(rem);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    const ms = settings.minutes * 60_000 + settings.seconds * 1000;
    if (ms <= 0) return;
    setTotalMs(ms);
    setRemainingMs(ms);
    endRef.current = performance.now() + ms;
    setState('running');
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [settings, tick]);

  const pause = useCallback(() => {
    if (state !== 'running') return;
    pausedRef.current = remainingMs;
    setState('paused');
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [state, remainingMs]);

  const resume = useCallback(() => {
    if (state !== 'paused') return;
    endRef.current = performance.now() + pausedRef.current;
    setState('running');
    rafRef.current = requestAnimationFrame(tick);
  }, [state, tick]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setState('idle');
    setRemainingMs(0);
    setTotalMs(0);
  }, []);

  const restart = useCallback(() => {
    stop();
    setTimeout(start, 50);
  }, [stop, start]);

  const complete = useCallback(() => {
    stop();
  }, [stop]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    state,
    settings,
    setSettings,
    totalMs,
    remainingMs,
    durationMs,
    progress: totalMs > 0 ? 1 - remainingMs / totalMs : 0,
    start,
    pause,
    resume,
    stop,
    restart,
    complete,
  };
}

export function loadVisualSettings<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return fallback;
}

export function saveVisualSettings(settings: unknown) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
