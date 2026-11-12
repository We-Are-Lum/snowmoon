/**
 * A challenge character's call name (owner, 2026-11-11, Lord Ephelion joins): the first word of the book's name ("Zei
 * Leimin" is Zei), except a titled name, which keeps its title, as the book calls him ("Lord Ephelion", never "Lord").
 * Plain, with no imports, so the rules' words (in scripts everyone is served) can use it too.
 */
const TITLED = /^(Lord|Lady) \S/;
export const callNameOf = (name: string): string => (TITLED.test(name) ? name : name.split(' ')[0]);
/** By slug, for code that has no book character to hand (the rules' list of names). */
export const CALL_NAMES: Readonly<Record<string, string>> = { ephelion: 'Lord Ephelion' };
export const callNameOfSlug = (slug: string): string => CALL_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
