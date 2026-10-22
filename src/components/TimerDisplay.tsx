import { useEffect, useRef, useState } from 'react';
import { type VisualSettings } from '@/types';

interface TimerDisplayProps {
  remainingMs: number;
  totalMs: number;
  progress: number;
  state: string;
  visual: VisualSettings;
  windowSize: { width: number; height: number };
  hideStatus?: boolean;
}

export default function TimerDisplay({
  remainingMs,
  totalMs,
  progress,
  state,
  visual,
  windowSize,
  hideStatus = false
}: TimerDisplayProps) {
  // --- Smoothing -------------------------------------------------------
  // remainingMs/progress only change whenever the parent's tick fires
  // (often just once a second). Animating the ring with a short
  // framer-motion tween on every tick looked choppy: each tick restarted
  // a brand-new 100ms tween, so the ring moved in little bursts and then
  // sat still until the next update, instead of gliding.
  //
  // Instead, we keep a small requestAnimationFrame loop that extrapolates
  // "where the ring should be right now" from real elapsed time since the
  // last tick. That runs at the display's actual refresh rate and is
  // completely decoupled from how coarse the upstream updates are.
  const snapshotRef = useRef({ ts: performance.now(), remainingMs, progress });
  const isElapsedStyleRef = useRef(false); // does `progress` grow or shrink as time passes?
  const rafRef = useRef<number | undefined>(undefined);
  const [renderedMs, setRenderedMs] = useState(remainingMs);
  const [renderedProgress, setRenderedProgress] = useState(progress);

  // Re-anchor every time a fresh value arrives from the timer, and figure
  // out (from ground truth remainingMs/totalMs) which direction `progress`
  // moves, so we can extrapolate it correctly without assuming its
  // convention up front.
  useEffect(() => {
    const total = totalMs > 0 ? totalMs : 1;
    const remainingFraction = Math.min(1, Math.max(0, remainingMs / total));
    const diffAsRemaining = Math.abs(progress - remainingFraction);
    const diffAsElapsed = Math.abs(progress - (1 - remainingFraction));
    isElapsedStyleRef.current = diffAsElapsed < diffAsRemaining;

    snapshotRef.current = { ts: performance.now(), remainingMs, progress };
    setRenderedMs(remainingMs);
    setRenderedProgress(progress);
  }, [remainingMs, totalMs, progress]);

  useEffect(() => {
    if (state !== 'running') {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      setRenderedMs(remainingMs);
      setRenderedProgress(progress);
      return;
    }

    const total = totalMs > 0 ? totalMs : 1;

    const tick = () => {
      const elapsed = performance.now() - snapshotRef.current.ts;
      const nextMs = Math.max(0, snapshotRef.current.remainingMs - elapsed);
      const remainingFraction = Math.min(1, Math.max(0, nextMs / total));
      const nextProgress = isElapsedStyleRef.current ? 1 - remainingFraction : remainingFraction;

      setRenderedMs(nextMs);
      setRenderedProgress(nextProgress);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, totalMs]);

  const minutes = Math.floor(renderedMs / 60000);
  const seconds = Math.floor((renderedMs % 60000) / 1000);
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const size = Math.min(windowSize.width, windowSize.height) * 0.6;
  const strokeWidth = visual?.progressRing?.thickness || 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - renderedProgress * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90 drop-shadow-2xl">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={visual?.staticRing?.color || 'rgba(255,255,255,0.2)'}
          strokeWidth={visual?.staticRing?.thickness || 2}
          opacity={visual?.staticRing?.opacity ?? 1}
        />
        {/* Driven directly by the rAF loop above every frame — no
            framer-motion tween competing with it, so there's nothing to
            restart or "catch up" on each tick. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="url(#gradient)"
          strokeWidth={visual?.progressRing?.thickness || 10}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 ${visual?.progressRing?.glow || 0}px ${visual?.progressRing?.color1 || '#fff'})` }}
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={visual?.progressRing?.color1 || '#ffffff'} />
            <stop offset="100%" stopColor={visual?.progressRing?.color2 || '#ffffff'} />
          </linearGradient>
        </defs>
      </svg>

      <div
        className="absolute flex flex-col items-center justify-center text-center"
        style={{ color: visual?.text?.color || '#ffffff', fontFamily: visual?.text?.fontFamily || 'sans-serif' }}
      >
        <span
          style={{
            fontSize: size * 0.25,
            fontWeight: 'bold',
            textShadow: `0px 4px ${visual?.text?.shadow || 0}px rgba(0,0,0,0.5)`,
            lineHeight: 1,
            // Most fonts' proportional digits are different widths (a '1'
            // is narrower than an '8'), so as the seconds tick over the
            // string's total width keeps changing — and since this span is
            // centered, that reads as the whole clock jittering side to
            // side every second instead of just the digits updating in
            // place. Tabular figures give every digit the same advance
            // width so the string length — and its centered position —
            // stays fixed.
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum" 1, "lnum" 1',
          }}
        >
          {timeFormatted}
        </span>

        {/* This completely removes the status text (e.g. "Running") when on the Stage View */}
        {!hideStatus && (
          <span
            className="uppercase tracking-widest mt-2 opacity-60 font-semibold"
            style={{ fontSize: size * 0.05 }}
          >
            {state}
          </span>
        )}
      </div>
    </div>
  );
}
