import type { Phase } from '@/components/Controller';
import type { TimerState } from '@/types';

const PHASE_BADGE: Record<NonNullable<Phase>['kind'], string> = {
  starting: 'Starting…',
  ending: "Time's up",
  returning: 'Showing M³…',
  stopping: 'Stopping…',
};

const STATE_PILL: Record<TimerState, { label: string; tone: string }> = {
  idle: { label: 'Ready', tone: '' },
  running: { label: 'Counting down', tone: 'st-pill--ok' },
  paused: { label: 'Paused', tone: 'st-pill--warn' },
  complete: { label: 'Finished', tone: 'st-pill--brand' },
};

/** The timer's state in words (+ its st-pill tone), with a sequence in progress taking over so it never sits frozen. */
export function stateLabel(state: TimerState, phase?: Phase) {
  return phase ? { label: PHASE_BADGE[phase.kind], tone: 'st-pill--brand' } : STATE_PILL[state];
}
