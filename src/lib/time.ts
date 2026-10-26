/** mm:ss for a countdown. Rounds UP so "05:00" holds for a full second before "04:59". */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** The next wall-clock moment "HH:MM" occurs, strictly after `now` (rolls to tomorrow if it has passed). */
export function nextOccurrence(hhmm: string, now: Date): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target;
}
