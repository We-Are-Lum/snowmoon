import { CHALLENGE } from '../config';

/**
 * One character per picture for now (owner, 2026-11-09): when the change words name another challenge character (by
 * call name, as a whole word, any case: "bai" counts; "music", "Bailey" and "embai" don't), the remix screen's POST
 * refuses before any model or check runs, so the attempt uses none of today's pictures. Only the change box is read
 * (the owner: "named in the box"); a "Write your own" style's text is not. No server-only imports: the words are the
 * owner's, exactly.
 */
const callName = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);

export const ONE_CHARACTER = (other: string, name: string) => `One character per picture for now, so leave ${other} out: this picture is of ${name}.`;

/** The first other challenge character the words name (by where it appears), as capitalised in the list; null if none. */
export function otherCharacterIn(words: string, character: string): string | null {
  let first: { at: number; name: string } | null = null;
  for (const slug of CHALLENGE.characters) {
    if (slug === character) continue;
    // A whole word: no letter, digit or combining mark either side (any script).
    const m = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])${slug}(?![\\p{L}\\p{N}\\p{M}])`, 'iu').exec(words);
    if (m && (!first || m.index < first.at)) first = { at: m.index, name: callName(slug) };
  }
  return first?.name ?? null;
}

/** The refusal's words for these change words, or null when they name no other challenge character. */
export function oneCharacterProblem(words: string, character: string): string | null {
  const other = otherCharacterIn(words, character);
  return other ? ONE_CHARACTER(other, callName(character)) : null;
}
