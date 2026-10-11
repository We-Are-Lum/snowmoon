import 'server-only';
import { chapterNumbers, loadChapter } from './book';
import { blockFacts } from './reading';

/**
 * Search the book's committed text (content/snowmoon/text), for "Make an image" (/images/new).
 * Paragraphs and quotes only, case-insensitive, plain substring match on the words as readers
 * see them (markup removed). No database, no outside service; nothing about a query is kept.
 */
export const SEARCH = { minChars: 3, maxChars: 80, limit: 20, before: 60, after: 100 } as const;

export interface SearchHit {
  chapter: number;
  idx: number;
  /** The ¶ number readers see. */
  label: number | null;
  /** The excerpt, split around the match so the page can mark it. */
  before: string;
  match: string;
  after: string;
}
export type SearchResult = { ok: true; q: string; hits: SearchHit[]; more: boolean } | { ok: false; error: string };

type Entry = { chapter: number; idx: number; label: number | null; text: string; folded: string };
let corpus: Entry[] | null = null;

/** A paragraph's or quote's words without markup: speaker spans, emphasis, quote marks at line starts. */
export function plainText(content: string): string {
  return content
    .replace(/<[^>]+>/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*`]/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lower case, curly quotes as straight ones; one character for one, so offsets carry over. */
const fold = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

function load(): Entry[] {
  if (corpus) return corpus;
  corpus = [];
  for (const n of chapterNumbers()) {
    const ch = loadChapter(n)!;
    const facts = blockFacts(ch.blocks);
    ch.blocks.forEach((b, i) => {
      if (b.kind !== 'paragraph' && b.kind !== 'quote') return;
      const text = plainText(b.content);
      // toLowerCase can change a string's length for a few letters; such a block is matched on its own case.
      if (text) corpus!.push({ chapter: n, idx: b.idx, label: facts[i].label, text, folded: fold(text).length === text.length ? fold(text) : text });
    });
  }
  return corpus;
}

/** Cut at a word boundary, with an ellipsis where the paragraph goes on. */
function excerpt(text: string, at: number, len: number): Pick<SearchHit, 'before' | 'match' | 'after'> {
  let from = Math.max(0, at - SEARCH.before);
  let to = Math.min(text.length, at + len + SEARCH.after);
  if (from > 0) from = text.indexOf(' ', from) + 1 || from;
  if (to < text.length) {
    const sp = text.lastIndexOf(' ', to);
    if (sp > at + len) to = sp;
  }
  return {
    before: (from > 0 ? '…' : '') + text.slice(from, at),
    match: text.slice(at, at + len),
    after: text.slice(at + len, to) + (to < text.length ? '…' : ''),
  };
}

export function searchBook(raw: string, limit: number = SEARCH.limit): SearchResult {
  const q = raw.replace(/\s+/g, ' ').trim();
  if (q.length < SEARCH.minChars) return { ok: false, error: `Type at least ${SEARCH.minChars} letters` };
  if (q.length > SEARCH.maxChars) return { ok: false, error: `Search for up to ${SEARCH.maxChars} characters` };
  const needle = fold(q);
  const hits: SearchHit[] = [];
  let more = false;
  for (const e of load()) {
    const at = e.folded.indexOf(needle);
    if (at < 0) continue;
    if (hits.length >= limit) {
      more = true;
      break;
    }
    hits.push({ chapter: e.chapter, idx: e.idx, label: e.label, ...excerpt(e.text, at, needle.length) });
  }
  return { ok: true, q, hits, more };
}
