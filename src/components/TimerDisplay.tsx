import { useId, useLayoutEffect, useRef } from 'react';
import { type VisualSettings } from '@/types';
import { formatCountdown } from '@/lib/time';

interface TimerDisplayProps {
  /** Frozen remaining time, used when the countdown is not running. */
  remainingMs: number;
  totalMs: number;
  /** Epoch ms when a running countdown ends; 0 when not running. */
  endsAt: number;
  state: string;
  visual: VisualSettings;
  windowSize: { width: number; height: number };
  hideStatus?: boolean;
}

/** Ring size (px) on a 1080p display: 60% of 1080. */
const REFERENCE_RING_PX = 648;
/** The Font Size setting is relative to this (48 = 100%). */
export const DEFAULT_FONT_SIZE = 48;

export default function TimerDisplay({
  remainingMs,
  totalMs,
  endsAt,
  state,
  visual,
  windowSize,
  hideStatus = false,
}: TimerDisplayProps) {
  const size = Math.min(windowSize.width, windowSize.height) * 0.6;
  // Pixel settings are defined at the 1080p stage ring and scale with the ring, so the controller
  // preview, the Settings preview and the stage all look the same.
  const k = size / REFERENCE_RING_PX;
  const ringThickness = (visual?.progressRing?.thickness || 10) * k;
  const trackThickness = (visual?.trackRing?.thickness || 2) * k;
  const radius = (size - Math.max(ringThickness, trackThickness)) / 2;
  const circumference = radius * 2 * Math.PI;
  const gradientId = `ring-${useId().replace(/:/g, '')}`;
  const textScale = Math.min(1.25, Math.max(0.5, (visual?.text?.fontSize || DEFAULT_FONT_SIZE) / DEFAULT_FONT_SIZE));

  const textRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);

  // The digits and ring are painted straight to the DOM from one requestAnimationFrame loop that
  // reads the clock, so a running countdown causes no React renders at all. When it is not running
  // the frozen value is painted once.
  useLayoutEffect(() => {
    const paint = (ms: number) => {
      const left = Math.max(0, ms);
      if (textRef.current) textRef.current.textContent = formatCountdown(left);
      const elapsed = totalMs > 0 ? Math.min(1, Math.max(0, 1 - left / totalMs)) : 0;
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(circumference * (1 - elapsed));
    };

    if (state !== 'running' || !endsAt) {
      paint(remainingMs);
      return;
    }
    let raf = 0;
    const frame = () => {
      paint(endsAt - Date.now());
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [state, endsAt, totalMs, remainingMs, circumference]);

  const progress = visual?.progressRing;
  const track = visual?.trackRing;
  const textColor = visual?.text?.color || '#ffffff';
  const shadow = visual?.text?.shadowIntensity ?? 0;

  return (
    <div
      className={`relative flex flex-col items-center justify-center${state === 'complete' ? ' stage-heartbeat' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={track?.color || 'rgba(255,255,255,0.2)'}
          strokeWidth={trackThickness}
        />
        <circle
          ref={ringRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={progress?.gradient === false ? progress?.color1 || '#fff' : `url(#${gradientId})`}
          strokeWidth={ringThickness}
          strokeDasharray={circumference}
          strokeLinecap="round"
          style={{
            filter: progress?.glow
              ? `drop-shadow(0 0 ${(progress.glowIntensity ?? 20) * k}px ${progress.color1 || '#fff'})`
              : 'none',
          }}
        />
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={progress?.color1 || '#ffffff'} />
            <stop offset="100%" stopColor={progress?.color2 || '#ffffff'} />
          </linearGradient>
        </defs>
      </svg>

      <div
        className="absolute flex flex-col items-center justify-center text-center"
        style={{ color: textColor, fontFamily: visual?.text?.fontFamily || 'sans-serif' }}
      >
        {/* Tabular figures keep every digit the same width so the centred clock doesn't jitter. */}
        <span
          ref={textRef}
          style={{
            fontSize: size * 0.25 * textScale,
            fontWeight: 'bold',
            textShadow: shadow > 0 ? `0 0 ${shadow * k}px ${textColor}80` : 'none',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum" 1, "lnum" 1',
          }}
        />

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
