import 'server-only';
import { chapterNumbers, loadChapter } from './book';
import { blockFacts } from './reading';

/**
 * The book's committed text (content/snowmoon/text) as the search corpus for "Make an image"
 * (/images/new): paragraphs and quotes, markup removed. Served whole by GET /api/book/text and
 * searched on the reader's device (src/lib/book-search-core.ts); no query reaches the server.
 */
import { searchCorpus, SEARCH, type CorpusEntry, type SearchResult } from './book-search-core';

export { SEARCH };
export type { CorpusEntry, SearchHit, SearchResult } from './book-search-core';

let corpus: CorpusEntry[] | null = null;

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

/** Every paragraph and quote of the book, in reading order. */
export function bookCorpus(): CorpusEntry[] {
  if (corpus) return corpus;
  corpus = [];
  for (const n of chapterNumbers()) {
    const ch = loadChapter(n)!;
    const facts = blockFacts(ch.blocks);
    ch.blocks.forEach((b, i) => {
      if (b.kind !== 'paragraph' && b.kind !== 'quote') return;
      const text = plainText(b.content);
      if (text) corpus!.push([n, b.idx, facts[i].label, text]);
    });
  }
  return corpus;
}

/** The same search the page runs, here for tests. */
export function searchBook(raw: string, limit: number = SEARCH.limit): SearchResult {
  return searchCorpus(bookCorpus(), raw, limit);
}
