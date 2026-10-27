import { createContext } from 'react';

/**
 * The ring size (px) the controller has room for. The controller measures the space left between its header,
 * the time inputs and the buttons and provides it here, so the ring always fits instead of being sized from the
 * whole window and squashing the rows around it. The stage display has no provider and sizes from its window.
 */
export const FitSizeContext = createContext<number | null>(null);

/** Largest ring that fits a box, leaving `margin` px all around for the glow. */
export function fitRing(width: number, height: number, margin = 40, min = 110, max = 520): number {
  return Math.round(Math.max(min, Math.min(max, Math.min(width, height) - margin)));
}
