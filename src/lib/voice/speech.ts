import 'server-only';
import { loadChapter } from '../book';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sentencesOf, type Sentence } from './match';

/**
 * The speeches a person can perform: Lord Ephelion's letter (c13-b64, "The Dead Hand of Egalitarianism, and the Path of
 * Strength"), word for word from the book's text, title and sign-off included (performing a written letter aloud is this
 * edition's invention); and the team's three invented speeches (Nate, 2026-11-22; config/voice-speeches.json, word for
 * word from their Google Doc), each labelled "Invented, not from the book", versioned, with its own names.
 */
export interface Speech {
  id: string;
  title: string;
  character: string;
  /** Where the words come from: a book block, or the team's speech (its source document and version). */
  source: { kind: 'book'; block: string } | { kind: 'edition'; by: string; doc: string; version: number };
  /** The text's version: a recording is tied to the exact text it was checked against (Nate, 2026-11-22). */
  version: number;
  /** Whether AI helped write this version (set by Nate, never by an agent or the site), and the credit that follows from it. */
  aiHelp: boolean | null;
  credit: string | null;
  /**
   * The speech's own label (Nate, 2026-11-21): the stand-in c13-b64 is "Book"; the team's speeches will be "Invented,
   * not from the book", with their writers credited. Shown with the speech, and kept in every recipe.
   */
  label: { kind: 'book'; text: 'Book'; block: string } | { kind: 'invented'; text: 'Invented, not from the book'; writers: string[] };
  standIn: boolean;
  paragraphs: string[];
  sentences: Sentence[];
  /** The speech's names, sent to transcription as key terms and matched by sound in the word check (Nate, 2026-11-21). */
  names: string[];
  /** Characters in the text read aloud, for the reading's cost. */
  characters: number;
}

const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

function fromBlock(id: string, chapter: number, idx: number, names: string[]): Speech {
  const ch = loadChapter(chapter);
  const b = ch?.blocks.find((x) => x.idx === idx);
  if (!b) throw new Error(`no block c${chapter}-b${idx}`);
  const html = b.content;
  const title = strip(html.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? '');
  const paragraphs = [title, ...[...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => strip(m[1]))].filter(Boolean);
  return {
    id,
    title,
    character: 'ephelion',
    source: { kind: 'book', block: `c${chapter}-b${idx}` },
    label: { kind: 'book', text: 'Book', block: `c${chapter}-b${idx}` },
    version: 1,
    aiHelp: null,
    credit: null,
    // No longer a stand-in (Nate, 2026-11-22): c13-b64 is one of the challenge's speeches. Recipes made before keep what they recorded.
    standIn: false,
    paragraphs,
    sentences: sentencesOf(paragraphs),
    names,
    characters: paragraphs.join('\n').length,
  };
}

interface InventedFile {
  source: { title: string; googleDocId: string; version: number };
  credits: { aiHelp: string; noAiHelp: string };
  speeches: { id: string; version: number; aiHelp: boolean; title: string; names: string[]; paragraphs: string[] }[];
}
/** The team's speeches, as written (titles and notes are not spoken: only the paragraphs). */
function invented(): Speech[] {
  const f = JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'voice-speeches.json'), 'utf8')) as InventedFile;
  return f.speeches.map((x) => {
    // The credit follows the version's aiHelp, which only Nate sets (2026-11-22).
    if (typeof x.aiHelp !== 'boolean') throw new Error(`${x.id}: aiHelp must be set (true or false) by Nate`);
    const credit = x.aiHelp ? f.credits.aiHelp : f.credits.noAiHelp;
    return {
    id: x.id,
    title: x.title,
    character: 'ephelion',
    source: { kind: 'edition', by: credit, doc: f.source.googleDocId, version: x.version },
    label: { kind: 'invented', text: 'Invented, not from the book', writers: [credit] },
    version: x.version,
    aiHelp: x.aiHelp,
    credit,
    standIn: false,
    paragraphs: x.paragraphs,
    sentences: sentencesOf(x.paragraphs),
    names: x.names,
    characters: x.paragraphs.join('\n').length,
    } satisfies Speech;
  });
}

let cache: Speech[] | null = null;
export function speeches(): Speech[] {
  return (cache ??= [fromBlock('ephelion-c13-b64', 13, 64, ['Lord Ephelion', 'Ephelion', 'Dreadknot', 'Veridia', 'Arctic Empire']), ...invented()]);
}
export const speechById = (id: string) => speeches().find((s) => s.id === id) ?? null;
