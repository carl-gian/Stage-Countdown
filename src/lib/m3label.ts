/** The wording of the M³ badge: "M³ Media Display Shown" or "M³ Media Display Hidden" (nothing else). */
export interface M3LabelInput {
  media?: 'shown' | 'hidden' | 'none' | 'unknown';
  /** Best guess when the real state cannot be read. */
  hidden?: boolean;
}

export const M3_BADGE_PREFIX = 'M³ Media Display';

export function m3Label(status: M3LabelInput): { word: 'Shown' | 'Hidden'; text: string; guessed: boolean } {
  const guessed = status.media === undefined || status.media === 'unknown';
  // "Not open" (no media window at all) is, for the audience, the same as hidden: nothing is being displayed.
  const shown = guessed ? status.hidden === false : status.media === 'shown';
  const word = shown ? 'Shown' : 'Hidden';
  return { word, text: `${M3_BADGE_PREFIX} ${word}`, guessed };
}
