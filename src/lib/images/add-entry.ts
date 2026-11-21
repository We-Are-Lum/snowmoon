/**
 * Where "add an image" goes from the reader (owner, 2026-11-20: "The 'make an image' when highlighting text isn't
 * using the new system"): an admin gets the edition's own "Add a picture here" sheet (#196: a private draft, Keep goes
 * live), with the passage set and the picture placed after its last block; anyone else gets the readers' composer,
 * exactly as before. Pure, so test:add-from-selection proves both sides and a planted fault.
 */
export type AddEntry =
  | { kind: 'admin'; chapter: number; start: number; end: number; after: number }
  | { kind: 'composer'; chapter: number; start: number; end: number };

export function addEntry(admin: boolean, chapter: number, start: number, end: number): AddEntry {
  const s = Math.min(start, end), e = Math.max(start, end);
  return admin ? { kind: 'admin', chapter, start: s, end: e, after: e } : { kind: 'composer', chapter, start, end };
}

/** The button's words: the admins' sheet is named for what it does (owner, 2026-11-20); readers keep theirs. DRAFT. */
export const ADMIN_ADD_LABEL = 'Add a picture here';

/**
 * What must hold of a decision like addEntry (test:add-from-selection, and its planted faults): a non-admin always gets
 * the composer with exactly the passage asked; an admin always gets the sheet with the passage in order and the picture
 * after its last block.
 */
export function addEntryProblems(decide: typeof addEntry): string[] {
  const p: string[] = [];
  for (const [s, e] of [[5, 5], [12, 18], [18, 12]] as const) {
    const r = decide(false, 3, s, e);
    if (r.kind !== 'composer' || r.start !== s || r.end !== e || r.chapter !== 3) p.push(`a non-admin's ${s}–${e} doesn't open the composer as before (${JSON.stringify(r)})`);
    const a = decide(true, 3, s, e);
    const lo = Math.min(s, e), hi = Math.max(s, e);
    if (a.kind !== 'admin' || a.start !== lo || a.end !== hi || a.after !== hi || a.chapter !== 3) p.push(`an admin's ${s}–${e} doesn't open the sheet for ${lo}–${hi}, after ${hi} (${JSON.stringify(a)})`);
  }
  return p;
}
