/**
 * The one exact-words check for a moment of the book (docs/proposals/remix-moments.md, 1.5 and 2.3): the home page's
 * "A moment from the book" (src/lib/home.ts, check:principles P2i) and "Find a moment" in "Ask for help"
 * (src/lib/sheet-help/find-moment.ts, P2k) both call it, so there is one rule for what counts as the book's words.
 *
 * A quote passes only if:
 * - its block is a paragraph or a quote (never a heading, a screen or a break);
 * - it is found in the block's text exactly (`momentSource`: speaker-colour span tags removed, nothing else changed:
 *   no quote marks normalised, no whitespace collapsed, no case folded), so one changed word, straight quotes where the
 *   book has curly ones, or words that run on into the next block all fail;
 * - it is whole sentences: it starts at the block's start or after a sentence end, and ends a sentence;
 * - it is at most MOMENT_QUOTE_MAX characters.
 * Pure: no database, no file reads. The caller passes the block as read from the database (or the book's files), never
 * the device's or the model's copy of it.
 */
export const MOMENT_QUOTE_MAX = 420;

/** The block's text that moments are quoted from: only the speaker-colour span tags removed. */
export const momentSource = (content: string) => content.replace(/<\/?span[^>]*>/g, '');

export type MomentQuoteRefusal = 'not-a-sentence-block' | 'empty' | 'too-long' | 'not-verbatim' | 'not-whole-sentences';
export type MomentQuoteCheck =
  | { ok: true; start: number; end: number; text: string }
  | { ok: false; reason: MomentQuoteRefusal };

const SENTENCE_END = /[.!?…]["”’)]?$/;
const AFTER_SENTENCE = /[.!?…]["”’)]?\s$/;

/** Check one quote against its block. On success, `text` is the block's own words cut at the checked offsets. */
export function checkMomentQuote(block: { kind: string; content: string }, quote: string): MomentQuoteCheck {
  if (block.kind !== 'paragraph' && block.kind !== 'quote') return { ok: false, reason: 'not-a-sentence-block' };
  if (!quote.trim()) return { ok: false, reason: 'empty' };
  if (quote.length > MOMENT_QUOTE_MAX) return { ok: false, reason: 'too-long' };
  const src = momentSource(block.content);
  let at = src.indexOf(quote);
  if (at < 0) return { ok: false, reason: 'not-verbatim' };
  for (; at >= 0; at = src.indexOf(quote, at + 1)) {
    const before = src.slice(0, at);
    const after = src.slice(at + quote.length);
    if ((before === '' || AFTER_SENTENCE.test(before)) && SENTENCE_END.test(quote) && (after === '' || /^\s/.test(after))) {
      return { ok: true, start: at, end: at + quote.length, text: src.slice(at, at + quote.length) };
    }
  }
  return { ok: false, reason: 'not-whole-sentences' };
}

/** The first whole sentence of a block, for a "From search" result (no model words). Null if there is none. */
export function firstSentence(block: { kind: string; content: string }): string | null {
  if (block.kind !== 'paragraph' && block.kind !== 'quote') return null;
  const src = momentSource(block.content);
  const m = src.match(/^[\s\S]*?[.!?…]["”’)]?(?=\s|$)/);
  const text = (m ? m[0] : '').trim();
  if (!text) return null;
  const at = src.indexOf(text);
  const c = checkMomentQuote(block, text);
  return c.ok && at === c.start ? c.text : null;
}
