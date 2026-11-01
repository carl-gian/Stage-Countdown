import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import SceneArt from '@/components/stage/SceneArt';
import { formatCountdown } from '@/lib/time';
import { digitScale, ringFraction } from '@/lib/stageLook';
import type { StageLook } from '@/types';

interface GlassCountdownProps {
  /** Frozen remaining time, used when the countdown is not running. */
  remainingMs: number;
  totalMs: number;
  /** Epoch ms when a running countdown ends; 0 when not running. */
  endsAt: number;
  state: string;
  look: StageLook;
  mode: 'light' | 'dark';
  /** Previews: the scene stands still whatever the Motion setting. */
  still?: boolean;
  /** Play the reveal once when shown: the scene rises into place and the ring draws itself in (1 s). */
  arrive?: boolean;
  className?: string;
  style?: CSSProperties;
}

const R = 270;
const C = 2 * Math.PI * R;
const REVEAL_MS = 1000;
const ROLL_MS = 520;

/** The 60 tick marks around the ring; every fifth is longer. */
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * Math.PI * 2;
  const big = i % 5 === 0;
  const r1 = big ? 292 : 296;
  const r2 = big ? 312 : 305;
  const p = (r: number) => [800 + Math.sin(a) * r, 450 - Math.cos(a) * r].map((n) => Math.round(n * 100) / 100);
  const [x1, y1] = p(r1);
  const [x2, y2] = p(r2);
  return { x1, y1, x2, y2, w: big ? 5 : 2.5 };
});

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The stage countdown in the Steward look: a nature scene with the ring, ticks and digits on frosted glass.
 * Like the custom ring, it paints straight to the DOM from one requestAnimationFrame loop that reads the clock, so a
 * running countdown causes no React renders. The digit roll is plain class swaps; state classes (counting / last /
 * done / arriving) are set on the root here, never by React, so a re-render can't wipe them.
 */
export default function GlassCountdown({ remainingMs, totalMs, endsAt, state, look, mode, still = false, arrive = false, className, style }: GlassCountdownProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringWrapRef = useRef<SVGGElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const headRef = useRef<SVGCircleElement>(null);
  const ticksRef = useRef<SVGGElement>(null);
  const digitsRef = useRef<HTMLDivElement>(null);
  // When the reveal started (0 = no reveal). Fixed at mount, so a state change mid-reveal doesn't restart it.
  const revealAt = useRef(arrive ? performance.now() : 0);

  // The reveal classes: on for the first second only.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !revealAt.current) return;
    const left = REVEAL_MS - (performance.now() - revealAt.current);
    if (left <= 0) return;
    root.classList.add('arriving');
    const id = setTimeout(() => root.classList.remove('arriving'), left);
    return () => clearTimeout(id);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const digits = digitsRef.current;
    if (!root || !digits) return;
    const ticks = Array.from(ticksRef.current?.children ?? []) as SVGLineElement[];
    const roll = !reducedMotion();
    const beat = !still && !reducedMotion();
    let lastText = digits.dataset.text ?? '';
    let lastSec = -1;
    let lastLit = -1;

    // Each character has its own clipped window. On change the old digit rolls down and out while the new one rolls
    // in from above. The leaving digit must lose its "in" class, or its arrive animation keeps it over the new one.
    const setDigits = (text: string, animate: boolean) => {
      if (digits.children.length !== text.length) {
        digits.replaceChildren(...[...text].map((ch) => {
          const slot = document.createElement('span');
          slot.className = 'cd-slot' + (ch === ':' ? ' colon' : '');
          return slot;
        }));
      }
      [...text].forEach((ch, i) => {
        const slot = digits.children[i] as HTMLSpanElement;
        if (slot.dataset.v === ch) return;
        slot.dataset.v = ch;
        const rollThis = animate && roll && ch !== ':';
        const old = slot.querySelector('.cd-d:not(.out)');
        slot.querySelectorAll('.cd-d.out').forEach((o) => o.remove());
        if (old && rollThis) {
          old.classList.remove('in');
          old.classList.add('out');
          setTimeout(() => old.remove(), ROLL_MS);
        } else old?.remove();
        const d = document.createElement('span');
        d.className = 'cd-d' + (rollThis ? ' in' : '');
        d.textContent = ch;
        slot.append(d);
      });
      digits.dataset.text = text;
    };

    const setRing = (frac: number) => {
      const a = frac * Math.PI * 2;
      if (arcRef.current) arcRef.current.style.strokeDashoffset = String(C * (1 - frac));
      if (headRef.current) {
        headRef.current.setAttribute('cx', String(800 + Math.sin(a) * R));
        headRef.current.setAttribute('cy', String(450 - Math.cos(a) * R));
        headRef.current.style.opacity = frac > 0.002 ? '1' : '0';
      }
      const lit = Math.round(frac * 60);
      if (lit !== lastLit) {
        lastLit = lit;
        ticks.forEach((t, i) => t.setAttribute('opacity', i < lit ? '0.55' : '0.15'));
      }
    };

    const running = state === 'running' && endsAt > 0;
    root.classList.toggle('counting', running);
    root.classList.toggle('done', state === 'complete');
    if (!running) root.classList.remove('last');

    const paint = (now: number) => {
      const left = running ? endsAt - Date.now() : remainingMs;
      const p = revealAt.current ? Math.min(1, (now - revealAt.current) / REVEAL_MS) : 1;
      setRing(ringFraction(left, totalMs) * (1 - Math.pow(1 - p, 3)));
      const text = formatCountdown(left);
      if (text !== lastText) {
        setDigits(text, lastText !== '');
        lastText = text;
      }
      if (running) {
        const sec = Math.ceil(left / 1000);
        if (sec !== lastSec) {
          lastSec = sec;
          const last = sec <= 10 && sec > 0;
          root.classList.toggle('last', last);
          // Last 10 seconds: a small beat each second
          if (last && beat) ringWrapRef.current?.animate([{ transform: 'scale(1.012)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' });
        }
      }
      return running || p < 1;
    };

    let raf = 0;
    const frame = (now: number) => {
      if (paint(now)) raf = requestAnimationFrame(frame);
    };
    frame(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [state, endsAt, totalMs, remainingMs, still]);

  const motion = still || look.motion === 'plain' ? 'plain' : 'calm';

  return (
    <div
      ref={rootRef}
      className={`cd-stage${className ? ` ${className}` : ''}`}
      data-scene={look.scene}
      data-mode={mode}
      data-motion={motion}
      style={{ ...style, ['--digit-scale' as string]: digitScale(look.numberSize) }}
      aria-hidden="true"
    >
      <SceneArt scene={look.scene} />
      <div className="cd-wash" />
      <div className="cd-disc" />
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <g className="cd-ring-wrap" ref={ringWrapRef}>
          <g ref={ticksRef}>
            {TICKS.map((t, i) => (
              <line key={i} className="cd-tick" x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.w} strokeLinecap="round" opacity={0.5} />
            ))}
          </g>
          <circle className="cd-track" cx="800" cy="450" r={R} fill="none" strokeWidth="10" />
          <circle
            ref={arcRef}
            className="cd-arc"
            cx="800"
            cy="450"
            r={R}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            transform="rotate(-90 800 450)"
          />
          <circle ref={headRef} className="cd-head" cx="800" cy="180" r="10" />
        </g>
        <circle className="cd-ripple" cx="800" cy="450" r={R} />
        <circle className="cd-ripple r2" cx="800" cy="450" r={R} />
      </svg>
      <div className="cd-readout">
        {look.showKicker && <p className="cd-kicker">The meeting starts in</p>}
        <div className="cd-digits" ref={digitsRef} />
      </div>
      <div className="cd-grain" />
    </div>
  );
}
