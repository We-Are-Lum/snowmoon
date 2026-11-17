import aliases from '../../../config/aliases.json';
import summaries from '../../../content/snowmoon/chapter-summaries.json';
import glossary from '../../../content/snowmoon/glossary.json';
import { LEARN_MORE, type Segment } from '../challenge/learn-more';
import { blockIdOk } from './sanitize';

/**
 * Reviewed notes for the reading assistant (owner, 2026-11-17): texts a person has checked against the book, sent to the
 * model next to the passage search so it can sum them up, cited to their sources. The whole book is used for every
 * question (owner, 2026-11-17: "Spoilers no longer matter").
 *
 * - A chapter named in the question ("chapter 5", "ch 7", "chapters 3 to 4", "chapter five"): that chapter's summary
 *   sections (content/snowmoon/chapter-summaries.json), at most 3 chapters.
 * - One of the 7 Learn more characters named (through config/aliases.json): that character's whole Learn more text
 *   (src/lib/challenge/learn-more.ts), the later part included, and their glossary entry's sentences.
 * - "Where was I / recap / what's happened so far": the summaries of the reader's current chapter and the two before it.
 * - "What is the book about / summarize the whole book": the first section of every chapter's summary.
 *
 * The word patterns choose only the answer's length; the notes are added whenever a chapter or a character is named.
 */

export type NoteKind = 'summary' | 'learn-more';

export interface Note {
  /** What the model sees in front of the note, e.g. "summary c5 §2" or "learn-more bai later". */
  label: string;
  kind: NoteKind;
  /** The character's slug, for a Learn more note. */
  slug?: string;
  chapter?: number;
  /** The note as the model reads it: plain text, with block ids in square brackets where the note cites them. */
  text: string;
  /** Every block id the note rests on: the only ids an answer may cite for it. */
  sources: string[];
}

export type Shape = 'summary' | 'where' | 'book' | 'other';

export interface Routed {
  shape: Shape;
  /** Chapters whose summaries were added. */
  chapters: number[];
  /** Learn more characters named. */
  characters: string[];
  notes: Note[];
  /** Glossary blocks to add as passages (the named characters' entries). */
  blocks: string[];
  /** About how many words the answer may use. */
  words: number;
  /** "Where was I" with no reading position: ask which chapter instead of answering. */
  needsChapter: boolean;
  /** For "where was I" and the whole book: what the question means, added after it for the model and the checks. */
  framing: string;
}

type Section = { from_paragraph: number; text: string; sources: string[] };
const SUMMARIES = summaries.chapters as Record<string, Section[]>;

export const WORDS: Record<Shape, number> = { summary: 180, where: 180, book: 250, other: 120 };
/** At most this many chapters' summaries for one question (a range, or several chapters named). */
export const MAX_CHAPTERS = 3;

const NUMBER_WORDS = [
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];
const TENS: Record<string, number> = { twenty: 20, thirty: 30 };
function numberOf(s: string): number | null {
  const t = s.toLowerCase().replace(/\s+/g, '-');
  if (/^\d{1,2}$/.test(t)) return Number(t);
  const i = NUMBER_WORDS.indexOf(t);
  if (i >= 0) return i + 1;
  const m = /^(twenty|thirty)-(one|two|three|four|five|six|seven|eight|nine)$/.exec(t);
  return m ? TENS[m[1]] + NUMBER_WORDS.indexOf(m[2]) + 1 : null;
}
const NUM = `(\\d{1,2}|(?:twenty|thirty)[-\\s](?:one|two|three|four|five|six|seven|eight|nine)|${[...NUMBER_WORDS].reverse().join('|')}|thirty)`;
const CHAPTER_REF = new RegExp(`\\b(?:chapters?|chap\\.?|ch\\.?|chs\\.?)\\s*#?${NUM}(?:\\s*(?:-|–|—|to|through|and|&)\\s*(?:(?:chapter|ch\\.?)\\s*)?${NUM})?\\b`, 'giu');

/** The chapters a question names, in the order named; a range counts each chapter in it. At most MAX_CHAPTERS. */
export function chaptersNamed(question: string): number[] {
  const out: number[] = [];
  for (const m of question.matchAll(CHAPTER_REF)) {
    const a = numberOf(m[1]);
    const b = m[2] ? numberOf(m[2]) : null;
    if (a === null || a < 1 || a > 32) continue;
    const end = b !== null && b >= a && b <= 32 ? b : a;
    for (let n = a; n <= end; n++) if (!out.includes(n)) out.push(n);
  }
  return out.slice(0, MAX_CHAPTERS);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Each Learn more character's name forms: the name in any case ("mu", "BAI"), its other aliases.json forms as written. */
const word = (forms: string[], flags: string) => new RegExp(`(^|[^\\p{L}])(?:${forms.map(escape).join('|')})(?=$|[^\\p{L}])`, flags);
const CHARACTER_FORMS = Object.entries(LEARN_MORE).map(([slug, t]) => {
  const group = aliases.groups.find((g) => g.match.some((f) => f.toLowerCase() === t.name.toLowerCase()));
  const others = (group?.match ?? []).filter((f) => f.toLowerCase() !== t.name.toLowerCase());
  const name = word([t.name], 'iu');
  const asWritten = others.length ? word(others, 'u') : null;
  return { slug, test: (q: string) => name.test(q) || !!asWritten?.test(q) };
});

/** The Learn more characters a question names, in the book's order of LEARN_MORE. */
export function charactersNamed(question: string): string[] {
  return CHARACTER_FORMS.filter((c) => c.test(question)).map((c) => c.slug);
}

const WHERE = /\b(where (was|am|did) i( (up to|leave off|stop|at))?|where i (was|left off|stopped)|catch me up|re-?cap(?!\s+(of\s+)?(ch|chapter))|remind me what('s| has)? happened|what('s| has| have)? happened so far|so far)\b/i;
const BOOK = /\b(what('s| is) (the|this) (book|novel|story) about|what('s| is) snowmoon about|(summar\w*|sum up|recap|overview of|tell me about) (the |this )?(whole |entire )?(book|novel|story|snowmoon)\b|(whole|entire) (book|novel|story) (in brief|summar\w*)|the (book|story) in brief)\b/i;
const SUMMARY = /\b(summar\w*|sum (it )?up|recap|in brief|overview|what (happens|happened|goes on|went on)|what('s| is) (in )?(chapter|ch)\b.*\babout|about\s*\??\s*$|tell me about (chapter|ch))/i;

/** Which notes go with this question, and how long the answer may be. `position`: the reader's current chapter, if known. */
export function routeQuestion(question: string, position: number | null): Routed {
  const named = chaptersNamed(question);
  const characters = charactersNamed(question);
  let shape: Shape = 'other';
  let chapters = named;
  let needsChapter = false;
  if (BOOK.test(question) && !named.length) shape = 'book';
  else if (WHERE.test(question)) {
    // "Where was I, chapter 8": the chapter named is the position.
    shape = 'where';
    const at = named.length ? named[named.length - 1] : position;
    if (at === null) needsChapter = true;
    else chapters = [at - 2, at - 1, at].filter((n) => n >= 1);
  } else if (named.length && (SUMMARY.test(question) || bareChapter(question))) shape = 'summary';

  const notes: Note[] = [];
  if (shape === 'book') for (const n of Object.keys(SUMMARIES).map(Number).sort((a, b) => a - b)) notes.push(summaryNote(n, 0));
  else for (const n of chapters) (SUMMARIES[String(n)] ?? []).forEach((_, i) => notes.push(summaryNote(n, i)));
  for (const slug of characters) notes.push(...learnMoreNotes(slug));
  const blocks = characters.flatMap(glossaryBlocks);
  const framing =
    shape === 'where' && chapters.length
      ? ` (The reader is on chapter ${chapters[chapters.length - 1]} and wants a recap of ${chapters.length > 1 ? `chapters ${chapters[0]} to ${chapters[chapters.length - 1]}` : `chapter ${chapters[0]}`}: what happens, in story order, from the reviewed notes.)`
      : shape === 'book'
        ? ' (The reader wants the whole book in brief: its main story, in order, from the reviewed notes.)'
        : '';
  return { shape, chapters: shape === 'book' ? [] : chapters, characters, notes, blocks, words: WORDS[shape], needsChapter, framing };
}

/** "ch 7?", "chapter 5", "chapter 5 please": a chapter named with almost nothing else. */
function bareChapter(question: string): boolean {
  const rest = question.replace(CHAPTER_REF, ' ').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return rest.filter((w) => !/^(please|pls|the|of|in|and|so|ok|what|about|tell|me)$/i.test(w)).length === 0;
}

function summaryNote(n: number, i: number): Note {
  const s = SUMMARIES[String(n)][i];
  const sources = s.sources.filter(blockIdOk);
  return { label: `summary c${n} §${i + 1}`, kind: 'summary', chapter: n, text: `${s.text} (rests on ${sources.map((id) => `[${id}]`).join(' ')})`, sources };
}

/** "c5-b69–b70" is c5-b69 and c5-b70; "c4-b72" is itself. */
export function expandCite(cite: string): string[] {
  const m = /^c(\d+)-b(\d+)(?:[–-]b?(\d+))?$/.exec(cite);
  if (!m) return [];
  const [ch, a, b] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : Number(m[2])];
  const out: string[] = [];
  for (let k = a; k <= Math.max(a, b) && out.length < 40; k++) out.push(`c${ch}-b${k}`);
  return out;
}

function segmentsText(segs: readonly Segment[]): { text: string; sources: string[] } {
  const sources: string[] = [];
  const text = segs
    .map((s) => {
      if ('cite' in s) {
        const ids = expandCite(s.cite);
        sources.push(...ids);
        return ids.length ? ` [${ids.join('] [')}]` : '';
      }
      return 'term' in s ? s.term : s.text;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
  return { text, sources: [...new Set(sources)] };
}

const PARTS = ['who', 'start', 'later', 'drives'] as const;
function learnMoreNotes(slug: string): Note[] {
  const t = LEARN_MORE[slug];
  if (!t) return [];
  const notes: Note[] = [];
  for (const part of PARTS) {
    const { text, sources } = segmentsText(t[part]);
    if (text && sources.length) notes.push({ label: `learn-more ${slug} ${part}`, kind: 'learn-more', slug, text, sources });
  }
  // "Room to invent." says what the book leaves open, not what it says: not sent.
  return notes;
}

interface Entry { slug: string; term: string; aliases: string[]; first: string; explanations: { block: string }[] }
const ENTRIES = glossary.terms as unknown as Entry[];
/** The glossary entry for a character: its first sentence and its explanations, as block ids. */
function glossaryBlocks(slug: string): string[] {
  const name = LEARN_MORE[slug]?.name.toLowerCase();
  const e = ENTRIES.find((x) => x.slug === slug || x.term.toLowerCase() === name || x.term.toLowerCase().split(/\s+/)[0] === name);
  if (!e) return [];
  return [...new Set([e.first, ...e.explanations.map((x) => x.block)].filter(blockIdOk))].slice(0, 6);
}

/** The line under an answer that rests on reviewed notes. Drafted by the coding agent; approved by the owner as drafted (2026-11-17). */
export const NOTE_WORDING = {
  draft: false,
  summary: 'Uses the chapter summaries · AI summary, written by an AI model, Claude, not by the author, and checked against the book by AI.',
  learnMore: (name: string, owner: boolean) =>
    owner
      ? `Uses “Learn more about ${name}” · written by the site’s owner, not by the author.`
      : `Uses “Learn more about ${name}” · written by an AI model, Claude, not by the author, and approved by the site’s owner.`,
};

/** The note lines for the notes an answer cited, in order: summaries first, then each character. */
export function noteLines(used: Note[]): string[] {
  const lines: string[] = [];
  if (used.some((n) => n.kind === 'summary')) lines.push(NOTE_WORDING.summary);
  for (const slug of [...new Set(used.filter((n) => n.kind === 'learn-more').map((n) => n.slug!))]) {
    const t = LEARN_MORE[slug];
    lines.push(NOTE_WORDING.learnMore(t.name, /^owner/.test(t.author)));
  }
  return lines;
}
