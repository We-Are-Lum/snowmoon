import 'server-only';
import { loadChapter } from '../book';
import { sentencesOf, type Sentence } from './match';

/**
 * The speeches a person can perform. The team's speeches haven't arrived (Nate, 2026-11-20): until they do, Lord
 * Ephelion's letter (c13-b64, "The Dead Hand of Egalitarianism, and the Path of Strength") stands in, word for word from
 * the book's text, title and sign-off included. Performing a written letter aloud is this edition's invention.
 */
export interface Speech {
  id: string;
  title: string;
  character: string;
  /** Where the words come from: a book block, or (later) the team's speech. */
  source: { kind: 'book'; block: string } | { kind: 'edition'; by: string };
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
    standIn: true,
    paragraphs,
    sentences: sentencesOf(paragraphs),
    names,
    characters: paragraphs.join('\n').length,
  };
}

let cache: Speech[] | null = null;
export function speeches(): Speech[] {
  return (cache ??= [fromBlock('ephelion-c13-b64', 13, 64, ['Lord Ephelion', 'Ephelion', 'Dreadknot', 'Veridia', 'Arctic Empire'])]);
}
export const speechById = (id: string) => speeches().find((s) => s.id === id) ?? null;
