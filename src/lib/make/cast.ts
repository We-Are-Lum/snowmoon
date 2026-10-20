/**
 * The cast's pronouns, as the book uses them, for the "Make your own" coach (owner, 2026-10-19: "Coach faults: fix
 * now": the coach mixed up he and she for Zei and Bai). One entry per committed character sheet
 * (content/snowmoon/designs/characters/*.json). Each pronoun comes from a block of the book where it plainly refers
 * to that character; `source` is the block and the words that show it, and the test checks both against
 * content/snowmoon/text. The source is a pronoun, or for Min a word that the owner accepted in its place ("mother",
 * 2026-10-19). Where the book gives neither for a character, `pronoun` is null and the coach uses the name or "they";
 * it doesn't guess.
 */
export type Pronoun = 'he' | 'she';

export interface CastMember {
  /** The name as the coach and the book use it. */
  name: string;
  /** The sheet's slug. */
  slug: string;
  /** The chapter the character first appears in (the sheet's first_appearance). */
  first: number;
  pronoun: Pronoun | null;
  /** The block that shows the pronoun, and the words in it. Null when the book gives none. */
  source: { id: string; words: string } | null;
}

export const CAST: CastMember[] = [
  { name: 'Zei', slug: 'zei', first: 2, pronoun: 'he', source: { id: 'c2-b8', words: 'Zei thought to himself' } },
  { name: 'Bai', slug: 'bai', first: 4, pronoun: 'she', source: { id: 'c4-b73', words: "Bai walked up closer, and put her hand on Zei's shoulder" } },
  { name: 'Gladias', slug: 'gladias', first: 1, pronoun: 'he', source: { id: 'c1-b4', words: 'Gladias instinctively checked his watch' } },
  { name: 'Seila', slug: 'seila', first: 1, pronoun: 'she', source: { id: 'c1-b108', words: 'Seila took out her hand device' } },
  { name: 'Deluin', slug: 'deluin', first: 12, pronoun: 'he', source: { id: 'c12-b71', words: '"Hi, I\'m Deluin" , he said.' } },
  { name: 'Delwart', slug: 'delwart', first: 3, pronoun: 'he', source: { id: 'c6-b28', words: 'when Delwart left the meeting, I followed him' } },
  { name: 'Den', slug: 'den', first: 9, pronoun: 'he', source: { id: 'c9-b126', words: 'Den put his watch' } },
  { name: 'Ephelion', slug: 'ephelion', first: 3, pronoun: 'he', source: { id: 'c11-b109', words: 'Lord Ephelion giving his sermons' } },
  { name: 'Febric', slug: 'febric', first: 1, pronoun: 'he', source: { id: 'c1-b111', words: 'The older teenage boy, Febric, walked down more slowly, carrying his hand device' } },
  { name: 'Fin', slug: 'fin', first: 2, pronoun: 'he', source: { id: 'c4-b27', words: 'Fin took a small paper booklet out of his backpack' } },
  { name: 'Daia', slug: 'daia', first: 1, pronoun: 'she', source: { id: 'c11-b3', words: 'Daia caught sight of Gladias approaching. She waved at him.' } },
  { name: 'Hreda', slug: 'hreda', first: 1, pronoun: 'she', source: { id: 'c1-b116', words: 'Hreda will be back from after-school number theory in a longhour. Come on, you know she always gets the number nine.' } },
  { name: 'Jahn', slug: 'jahn', first: 1, pronoun: 'he', source: { id: 'c10-b2', words: 'where he worked as a researcher, and he got out of the car' } },
  { name: 'Lektor', slug: 'lektor', first: 28, pronoun: 'he', source: { id: 'c28-b14', words: '"I\'m Lektor" , he exclaimed.' } },
  { name: 'Lily', slug: 'lily', first: 1, pronoun: 'she', source: { id: 'c1-b117', words: 'Lily slowly walked out, her eyes looking to the ground' } },
  // The book uses no pronoun for Min; it calls her Zei's mother, which the owner took as enough (2026-10-19).
  { name: 'Min', slug: 'min', first: 5, pronoun: 'she', source: { id: 'c5-b4', words: "Zei's mother, Min, hurried forward" } },
  { name: 'Mov', slug: 'mov', first: 3, pronoun: 'he', source: { id: 'c3-b29', words: 'Mov then opened up his privacy robe' } },
  { name: 'Mu', slug: 'mu', first: 4, pronoun: 'she', source: { id: 'c4-b118', words: 'Mu sighed. She knew Zei and Bai did not get along' } },
  { name: 'Tafindel', slug: 'tafindel', first: 15, pronoun: 'he', source: { id: 'c26-b110', words: 'Someone had grabbed Tafindel, and pulled him back inside.' } },
  { name: 'Verdow', slug: 'verdow', first: 8, pronoun: 'he', source: { id: 'c32-b31', words: 'Verdow sighed, and then continued giving his cautionary note.' } },
  { name: 'Vil', slug: 'vil', first: 1, pronoun: 'he', source: { id: 'c17-b107', words: 'Vil said that he will take her in the summer' } },
  { name: 'Zven', slug: 'zven', first: 1, pronoun: 'he', source: { id: 'c11-b38', words: 'Zven aimed his copter to fly higher' } },
];

/**
 * For the coach's system prompt ({{CAST}} in config/prompts/make-coach.md): only characters who have appeared by the
 * person's last chapter, so the list names no one from later on. The pronoun check still knows everyone.
 */
export function castText(limit: number): string {
  const cast = CAST.filter((c) => c.first <= limit);
  const known = cast.filter((c) => c.pronoun).map((c) => `${c.name}: ${c.pronoun}`);
  const none = cast.filter((c) => !c.pronoun).map((c) => c.name);
  return `${known.join('; ')}.${none.length ? ` The book gives no pronoun for ${none.join(', ')}: use the name or "they".` : ''} For anyone not listed, use their name.`;
}

const WORDS: Record<Pronoun, RegExp> = { he: /\b(he|him|his|himself)\b/gi, she: /\b(she|her|hers|herself)\b/gi };
/** Words that bring another person into the sentence, so a pronoun there may not be about the named character. */
const OTHER_PERSON =
  /\b(mother|father|mom|dad|mum|sister|brother|wife|husband|son|daughter|aunt|uncle|woman|women|man|men|girl|boy|lady|gentleman|priest|priestess|president|senator|general|commander|friend|rival|opponent|player|teammate|stranger|guard|everyone|someone|somebody|anyone|people|audience|viewer|reader|narrator|author|actor|actress)\b/i;

export interface PronounSlip {
  name: string;
  /** What the book uses. */
  pronoun: Pronoun;
  /** What the reply used. */
  wrote: string;
  sentence: string;
}

/**
 * Pronouns in a reply that contradict the book. Deliberately narrow, so it doesn't flag a right reply: a sentence
 * counts only when it names exactly one character (who has a pronoun in CAST), names no one else (no other cast
 * name, no other capitalised name, no word like "mother" or "rival"), has no pronoun before the name, and uses only
 * the other pronoun. "The close-up on Bai could signal his judgment" is a slip; "Bai thinks Zei has gone soft, and
 * she walks off" is not checked. A pronoun about someone named in an earlier sentence can still be flagged when it
 * comes after the name (the live check, 2026-10-19: one such flag in 11 replies), which costs a retry.
 */
export function pronounSlips(text: string): PronounSlip[] {
  const slips: PronounSlip[] = [];
  const plain = text.replace(/\[[^\]]*\]/g, ' ');
  for (const sentence of plain.split(/(?<=[.!?…])\s+|\n+/)) {
    const named = CAST.filter((c) => new RegExp(`\\b${c.name}\\b`).test(sentence));
    if (named.length !== 1 || !named[0].pronoun || OTHER_PERSON.test(sentence)) continue;
    // Another capitalised name (not the first word of the sentence, not "I") brings in someone the cast doesn't list.
    const caps = [...sentence.matchAll(/(?<!^|[“"'(]\s*)\b[A-Z][a-z]+\b/g)].map((m) => m[0]).filter((w) => w !== named[0].name && !/^(I|I'm|I'd|I'll|I've)$/.test(w));
    if (caps.length) continue;
    const c = named[0];
    // A pronoun before the name is about someone from an earlier sentence ("What would she risk if Zei…").
    const before = sentence.slice(0, sentence.search(new RegExp(`\\b${c.name}\\b`)));
    if (new RegExp(WORDS.he.source + '|' + WORDS.she.source, 'i').test(before)) continue;
    const right = sentence.match(WORDS[c.pronoun!]);
    const wrong = sentence.match(WORDS[c.pronoun === 'he' ? 'she' : 'he']);
    if (wrong && !right) slips.push({ name: c.name, pronoun: c.pronoun!, wrote: wrong[0].toLowerCase(), sentence: sentence.trim() });
  }
  return slips;
}
