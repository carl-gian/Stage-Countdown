import { useLayoutEffect, useRef, useState } from 'react';
import { FitBoxContext } from '@/lib/fitSize';

/**
 * Measures the space it is given and passes it to the preview inside (see FitBoxContext). The content is centred
 * and positioned absolutely, so it can never push the box bigger than the space it measured. The box is also a CSS
 * size container, so a preview can size itself with container units (cqw / cqh) and never lag a resize.
 */
export default function FitBox({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = Math.floor(el.clientWidth);
      const height = Math.floor(el.clientHeight);
      setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} style={{ position: 'relative', containerType: 'size' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {box && <FitBoxContext.Provider value={box}>{children}</FitBoxContext.Provider>}
      </div>
    </div>
  );
}
