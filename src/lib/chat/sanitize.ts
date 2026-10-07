/**
 * What the model says is never shown as it came. Pure, so the tests can run it.
 *
 * - Citations: block ids in brackets ([c14-b97], 【c14-b97】, (c14-b97)) become
 *   citation parts. An id that is not in `allowed` (not a block, past the
 *   reader's chapter limit, or not among the passages the model was given) is
 *   dropped and counted. The quote shown for a citation is rendered from the
 *   database by the caller, never from the model's words.
 * - Quotes: any quoted span of six words or more is removed, because the book's
 *   words must come from the stored text, not from model output.
 * - Reasoning a model wraps in <think>…</think> is removed.
 */
export type Part = { type: 'text'; text: string } | { type: 'cite'; id: string };

export interface Sanitized {
  parts: Part[];
  /** Ids in the order first cited, each once. */
  cites: string[];
  /** Citations removed because they were not allowed. */
  dropped: string[];
  /** Quoted spans removed. */
  quotesRemoved: number;
}

const CITE = /[[【(]\s*(c\d+-b\d+(?:\s*[,;]\s*c\d+-b\d+)*)\s*[\]】)]/g;
const QUOTED = /["“”]([^"“”\n]{1,600})["“”]/g;
const MIN_QUOTE_WORDS = 6;

export function blockIdOk(id: string): boolean {
  return /^c\d{1,2}-b\d{1,4}$/.test(id);
}

export function sanitizeReply(raw: string, allowed: ReadonlySet<string>): Sanitized {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  let quotesRemoved = 0;
  text = text.replace(QUOTED, (m, inner: string) => {
    if (inner.trim().split(/\s+/).length >= MIN_QUOTE_WORDS) {
      quotesRemoved++;
      return '…';
    }
    return m;
  });
  const parts: Part[] = [];
  const cites: string[] = [];
  const dropped: string[] = [];
  let at = 0;
  for (const m of text.matchAll(CITE)) {
    const before = text.slice(at, m.index);
    if (before) parts.push({ type: 'text', text: before });
    for (const id of m[1].split(/\s*[,;]\s*/)) {
      if (allowed.has(id) && blockIdOk(id)) {
        parts.push({ type: 'cite', id });
        if (!cites.includes(id)) cites.push(id);
      } else dropped.push(id);
    }
    at = m.index! + m[0].length;
  }
  const rest = text.slice(at);
  if (rest) parts.push({ type: 'text', text: rest });
  // Tidy: no space before punctuation left where a citation was removed.
  for (const p of parts) if (p.type === 'text') p.text = p.text.replace(/\s+([.,;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ');
  return { parts: parts.filter((p) => p.type === 'cite' || p.text.trim() !== ''), cites, dropped, quotesRemoved };
}

/** A block id's chapter, or null. */
export function chapterOf(id: string): number | null {
  const m = id.match(/^c(\d+)-b\d+$/);
  return m ? Number(m[1]) : null;
}
