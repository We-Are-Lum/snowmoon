/**
 * Each character's home, as the book states it (owner, 2026-11-11: "The home notes under each name must come from the
 * book, each with its block id; ... If a character's home isn't stated in the book, drop the note."). `quote` is the
 * book's words exactly and must be in that block (scripts/test-challenge-moments.ts checks it against content/snowmoon/
 * text); `place` is the part of the quote shown under the name. Bai, Seila and Mu: the book doesn't state where they are
 * from, so they have no note. Gladias: only "what we get in Veridia" (c19-b51), not a statement of his home, so he has
 * none (owner, 2026-11-12: "no home note; the book doesn't say where he's from").
 */
export interface Home { place: string; block: string; quote: string }

export const HOMES: Readonly<Record<string, Home>> = {
  zei: { place: 'Pafogai Du', block: 'c14-b31', quote: 'Zei Leimin from Pafogai Du' },
  deluin: { place: 'Redshire', block: 'c14-b31', quote: 'Deluin from Redshire' },
};

export const homeOf = (slug: string): Home | null => HOMES[slug] ?? null;
