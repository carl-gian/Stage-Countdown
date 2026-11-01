import { useEffect, useState } from 'react';
import type { StageLook } from '@/types';

/** 'auto' follows Windows' light/dark setting. */
export function resolveLook(look: StageLook['look'], systemDark: boolean): 'light' | 'dark' {
  if (look === 'auto') return systemDark ? 'dark' : 'light';
  return look;
}

const DIGIT_SCALE: Record<StageLook['numberSize'], number> = { smaller: 0.85, normal: 1, larger: 1.15 };

export function digitScale(size: StageLook['numberSize']): number {
  return DIGIT_SCALE[size] ?? 1;
}

/** How much of the ring is drawn: the share of time that is LEFT, so it shrinks as the countdown runs. */
export function ringFraction(remainingMs: number, totalMs: number): number {
  if (totalMs <= 0) return remainingMs > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, remainingMs / totalMs));
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The stage's light/dark look, live: 'auto' changes when Windows switches. */
export function useResolvedLook(look: StageLook['look']): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(() => typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches);
  useEffect(() => {
    if (look !== 'auto' || typeof matchMedia !== 'function') return;
    const mq = matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [look]);
  return resolveLook(look, systemDark);
}
