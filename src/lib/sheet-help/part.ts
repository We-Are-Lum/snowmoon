/**
 * "Ask for help" (docs/proposals/sheet-help.md): what one proposed change to a sheet's prompt may be, and how it is
 * applied. Pure, with no server code, so the page, the route and the tests share it.
 *
 * The owner's rule (2026-10-31): one part of the prompt at a time; it never drafts the whole prompt. A prompt's parts
 * are the pieces between commas, semicolons, line ends and full stops ("eighteen, short black hair, a grey coat" has
 * three). A proposal names the exact words it changes (`before`, inside one part) and the words that replace them
 * (`after`, one part: no comma, semicolon, full stop or line end), or adds one part (`before` empty). Refused:
 * - adding to an empty prompt (the person writes first), and replacing a one-part prompt whole (both would be the
 *   model drafting the whole prompt);
 * - `before` that isn't in the draft exactly once, or that crosses into another part;
 * - `after` longer than one part (SHEET_HELP.partMaxChars, partMaxWords), or more than one part;
 * - a result longer than the sheet's text may be.
 * Nothing changes the prompt without the person's tap: applyProposal is called only by Accept.
 */
export interface Proposal {
  /** The exact words of the draft that change; empty when the proposal adds one part at the end. */
  before: string;
  /** The words that replace them: one part. */
  after: string;
}

export type PartRefusal = 'empty-draft' | 'whole-prompt' | 'not-found' | 'ambiguous' | 'crosses-parts' | 'more-than-one-part' | 'too-long' | 'unchanged' | 'result-too-long';

export interface PartLimits {
  partMaxChars: number;
  partMaxWords: number;
  textMaxChars: number;
}

/** Where one part ends and the next begins. A full stop counts only before a space or the end (so "3.5" stays one). */
const SEPARATOR = /[,;\n]|\.(?=\s|$)/;
const SEPARATORS = new RegExp(SEPARATOR.source, 'g');

/** The draft's parts, trimmed, empty ones left out. */
export function promptParts(draft: string): string[] {
  return draft.split(SEPARATORS).map((s) => s.trim()).filter(Boolean);
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function occurrences(hay: string, needle: string): number {
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) n++;
  return n;
}

/** Why this proposal can't be offered, or null when it changes exactly one part of this draft. */
export function refuseProposal(draft: string, p: Proposal, lim: PartLimits): PartRefusal | null {
  const before = p.before.trim();
  const after = p.after.trim();
  const parts = promptParts(draft);
  if (!parts.length) return 'empty-draft';
  if (!after || SEPARATOR.test(after) || /[.]$/.test(after)) return after ? 'more-than-one-part' : 'unchanged';
  if (after.length > lim.partMaxChars || words(after) > lim.partMaxWords) return 'too-long';
  if (before) {
    if (SEPARATOR.test(before)) return 'crosses-parts';
    const n = occurrences(draft, before);
    if (n === 0) return 'not-found';
    if (n > 1) return 'ambiguous';
    if (before === after) return 'unchanged';
    if (parts.length === 1 && parts[0] === before) return 'whole-prompt';
  }
  const result = apply(draft, before, after);
  if (result.length > lim.textMaxChars) return 'result-too-long';
  return null;
}

function apply(draft: string, before: string, after: string): string {
  if (before) {
    const i = draft.indexOf(before);
    return draft.slice(0, i) + after + draft.slice(i + before.length);
  }
  const base = draft.replace(/\s+$/, '');
  return /[,;.]$/.test(base) ? `${base} ${after}` : `${base}, ${after}`;
}

/**
 * Accept: the draft with the one part changed, or null when the draft no longer holds the words exactly once (the
 * person edited it since the proposal; ask again). Reject never calls this, so the draft stays as it was.
 */
export function applyProposal(draft: string, p: Proposal, lim: PartLimits): string | null {
  if (refuseProposal(draft, p, lim)) return null;
  return apply(draft, p.before.trim(), p.after.trim());
}

/** The parts that differ between two drafts (for the tests' "one part at a time"): how many of the old are gone and of the new are new. */
export function partsChanged(a: string, b: string): { removed: string[]; added: string[] } {
  const pa = promptParts(a);
  const pb = promptParts(b);
  const left = [...pb];
  const removed: string[] = [];
  for (const x of pa) {
    const i = left.indexOf(x);
    if (i === -1) removed.push(x);
    else left.splice(i, 1);
  }
  return { removed, added: left };
}
