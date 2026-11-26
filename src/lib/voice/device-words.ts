/**
 * A person's own edit of a speech's words (the four-step recorder, Nate 2026-11-26: "Edited text is kept on the device
 * across reloads"): in this browser's localStorage, under the signed-in person and the speech, until they go back to
 * the speech as written or the browser clears it. Never sent to the site: no request carries it (the word check compares
 * the converted take with the speech as written, so a take of edited words is labelled improvised). Browser only.
 */
const key = (fid: number, speechId: string) => `snowmoon.ephelion.words.${fid}.${speechId}`;

export function loadWords(fid: number, speechId: string): string | null {
  try {
    const v = localStorage.getItem(key(fid, speechId));
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function saveWords(fid: number, speechId: string, words: string): void {
  try {
    localStorage.setItem(key(fid, speechId), words.slice(0, 20_000));
  } catch {
    /* not kept: this browser's storage is full or blocked */
  }
}

export function removeWords(fid: number, speechId: string): void {
  try {
    localStorage.removeItem(key(fid, speechId));
  } catch {
    /* nothing to remove */
  }
}

/** Edited words as the script's sentences: split after . ! ? (and line breaks), for the highlight only. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((p) => p.match(/[^.!?]+[.!?]+["'”’)]*|[^.!?]+$/g) ?? [])
    .map((x) => x.trim())
    .filter(Boolean);
}
