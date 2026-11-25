/**
 * P6ae (branch episode1-opening, owner 2026-11-24): Episode 1 goes public (EPISODE.public) only once the legal texts
 * describe it and the owner has approved its drafted wording. Legal texts describe today: the lines are drafted in
 * docs/legal/episode-1-draft.md and go into src/lib/legal.ts in the release that turns the switch on, after the
 * owner's reread.
 */
type Doc = { n: number | string; body: (string | string[])[] }[];
const text = (doc: Doc, n: number | string) => (doc.find((s) => String(s.n) === String(n))?.body ?? []).flat().join(' ');

export function p6aeProblems(c: { on: boolean; wordingApproved: boolean; terms: Doc; privacy: Doc }): string[] {
  if (!c.on) return [];
  const out: string[] = [];
  if (!c.wordingApproved) out.push("EPISODE.public is on, but the owner hasn't approved Episode 1's drafted wording (EPISODE.wordingApproved)");
  if (!/Episode 1/.test(text(c.terms, '6f'))) out.push("EPISODE.public is on, but Terms §6f doesn't describe Episode 1: the opening");
  if (!/Episode 1/.test(text(c.privacy, 4)) || !/outline/i.test(text(c.privacy, 4))) out.push("EPISODE.public is on, but Privacy §4 doesn't describe the outlines you submit");
  if (!/outline/i.test(text(c.privacy, 7))) out.push("EPISODE.public is on, but Privacy §7 doesn't say Groq receives the words of an outline you ask to have commented on");
  return out;
}
