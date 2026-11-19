import 'server-only';
import { chapterNumbers, loadChapter } from './book';
import { blockFacts } from './reading';

/**
 * The book's committed text (content/snowmoon/text) as the search corpus for "Make an image"
 * (/references/new): paragraphs and quotes, markup removed. Served whole by GET /api/book/text and
 * searched on the reader's device (src/lib/book-search-core.ts); no query reaches the server.
 * The agents' search_book also searches the in-world screens (c13-b64, Lord Ephelion's letter, was
 * missing: owner, 2026-11-18); the page's corpus stays paragraphs and quotes, since a screen can't be
 * tapped there as a passage's first or last block.
 */
import { searchCorpus, SEARCH, type CorpusEntry, type SearchResult } from './book-search-core';
import { screenText } from './screen-text';

export { SEARCH, screenText };
export type { CorpusEntry, SearchHit, SearchResult } from './book-search-core';

let corpus: CorpusEntry[] | null = null;
let withScreens: CorpusEntry[] | null = null;

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

/** A block's words, the way its kind is shown. */
export function blockText(b: { kind: string; content: string }): string {
  return b.kind === 'screen' ? screenText(b.content) : plainText(b.content);
}

function build(screens: boolean): CorpusEntry[] {
  const out: CorpusEntry[] = [];
  for (const n of chapterNumbers()) {
    const ch = loadChapter(n)!;
    const facts = blockFacts(ch.blocks);
    ch.blocks.forEach((b, i) => {
      if (b.kind !== 'paragraph' && b.kind !== 'quote' && !(screens && b.kind === 'screen')) return;
      const text = blockText(b);
      if (text) out.push([n, b.idx, facts[i].label, text]);
    });
  }
  return out;
}

/** Every paragraph and quote of the book, in reading order; with `screens`, its in-world screens too. */
export function bookCorpus(opts: { screens?: boolean } = {}): CorpusEntry[] {
  if (opts.screens) return (withScreens ??= build(true));
  return (corpus ??= build(false));
}

/** The same search the page runs (with `screens`, the agents' search_book), here for tests. */
export function searchBook(raw: string, limit: number = SEARCH.limit, opts: { screens?: boolean } = {}): SearchResult {
  return searchCorpus(bookCorpus(opts), raw, limit);
}
