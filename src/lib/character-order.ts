import data from '../../content/snowmoon/characters-by-mentions.json';

/**
 * The order of every character list on the site (owner, 2026-11-04): by how often the book names them, most first,
 * ties by name. From content/snowmoon/characters-by-mentions.json (npm run characters:mentions), which counts the
 * book's text and nothing else: never likes, sheets, picks, entrants or payments (principle 5). No fs, so client
 * components can use it too.
 */
export const BOOK_MENTIONS: readonly { slug: string; name: string; mentions: number; blocks: number }[] = data.characters;
const bySlug = new Map(BOOK_MENTIONS.map((c, i) => [c.slug, i]));
const byName = new Map(BOOK_MENTIONS.map((c, i) => [c.name, i]));

/** A character's place in the order, by slug or full name; characters the file doesn't know come last. */
export const mentionRank = (slugOrName: string): number => bySlug.get(slugOrName) ?? byName.get(slugOrName) ?? BOOK_MENTIONS.length;

/** A copy of the list in the book's order: most named first; unknown ones last, by name. */
export function inBookOrder<T>(list: readonly T[], key: (t: T) => string): T[] {
  return [...list].sort((a, b) => mentionRank(key(a)) - mentionRank(key(b)) || key(a).localeCompare(key(b), 'en'));
}
