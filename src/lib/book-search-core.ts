/**
 * Searching the book's text: the part that runs anywhere. The page searches on the reader's own
 * device (owner, 2026-10-10: a query in a URL could end up in the host's request logs), over the
 * text served once by GET /api/book/text; the server uses the same code in tests.
 * Paragraphs and quotes only, case-insensitive, plain substring match on the words as readers see them.
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
/** One paragraph or quote: chapter, block idx, ¶ label, plain text. */
export type CorpusEntry = [chapter: number, idx: number, label: number | null, text: string];

/** Lower case, curly quotes as straight ones; one character for one, so offsets carry over. */
const fold = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

const folded = new WeakMap<CorpusEntry[], string[]>();
function foldedOf(corpus: CorpusEntry[]): string[] {
  let f = folded.get(corpus);
  if (!f) {
    // toLowerCase can change a string's length for a few letters; such a block is matched on its own case.
    f = corpus.map(([, , , text]) => (fold(text).length === text.length ? fold(text) : text));
    folded.set(corpus, f);
  }
  return f;
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

export function searchCorpus(corpus: CorpusEntry[], raw: string, limit: number = SEARCH.limit): SearchResult {
  const q = raw.replace(/\s+/g, ' ').trim();
  if (q.length < SEARCH.minChars) return { ok: false, error: `Type at least ${SEARCH.minChars} letters` };
  if (q.length > SEARCH.maxChars) return { ok: false, error: `Search for up to ${SEARCH.maxChars} characters` };
  const needle = fold(q);
  const f = foldedOf(corpus);
  const hits: SearchHit[] = [];
  let more = false;
  for (let i = 0; i < corpus.length; i++) {
    const at = f[i].indexOf(needle);
    if (at < 0) continue;
    if (hits.length >= limit) {
      more = true;
      break;
    }
    const [chapter, idx, label, text] = corpus[i];
    hits.push({ chapter, idx, label, ...excerpt(text, at, needle.length) });
  }
  return { ok: true, q, hits, more };
}
