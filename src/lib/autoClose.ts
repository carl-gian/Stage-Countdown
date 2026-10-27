/**
 * "Close Stage Countdown after the timer ends" conflicts with OBS scene switching and the OBS dock: both need the app to
 * stay running (it lives in the tray), and quitting mid-hand-back would cut OBS's return to the camera short.
 * So the option is unavailable (and forced off) whenever the app is connected to OBS.
 */
export function autoCloseBlockedByObs(status?: { enabled: boolean; state: string } | null): boolean {
  return !!status && status.enabled && status.state === 'connected';
}

export const AUTO_CLOSE_BLOCKED_TEXT = 'Close after timer ends is off while connected to OBS';
export const AUTO_CLOSE_BLOCKED_HINT =
  'OBS scene switching and the OBS dock need Stage Countdown to keep running (it stays in the tray), so closing the app after the timer is unavailable while it is connected to OBS.';
