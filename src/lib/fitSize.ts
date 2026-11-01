import { createContext } from 'react';

/**
 * The free space (px) a preview has: the controller and Settings measure their preview area and provide it here, so
 * the preview always fits instead of being sized from the whole window. The stage window has no provider and fills
 * its (full-screen) window.
 */
export const FitBoxContext = createContext<{ width: number; height: number } | null>(null);

/** The largest 16:9 box (the stage screen's shape) that fits the free space. */
export function fitStageBox(width: number, height: number): { width: number; height: number } {
  const w = Math.max(0, Math.floor(Math.min(width, (height * 16) / 9)));
  return { width: w, height: Math.round((w * 9) / 16) };
}

/** Largest ring that fits a box, leaving `margin` px all around for the glow. */
export function fitRing(width: number, height: number, margin = 40, min = 110, max = 520): number {
  return Math.round(Math.max(min, Math.min(max, Math.min(width, height) - margin)));
}
