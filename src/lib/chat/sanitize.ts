/**
 * What the model says is never shown as it came. Pure, so the tests can run it.
 *
 * - Citations: block ids in brackets ([c14-b97], 【c14-b97】, (c14-b97)) become
 *   citation parts. An id that is not in `allowed` (not a block, past the
 *   reader's chapter limit, or not among the passages the model was given) is
 *   dropped and counted. The quote shown for a citation is rendered from the
 *   database by the caller, never from the model's words.
 * - Note citations: with `notes`, a reviewed note's label in brackets ([summary c8 §2], [learn-more bai who]) is a
 *   citation of that note (owner, 2026-11-17); a label not among the notes given is dropped and counted.
 * - Quotes: by default any quoted span of six words or more is removed ("…"), because the book's words must come from
 *   the stored text. With `textOf` (the assistant, owner 2026-11-17): a quotation of three words or more stays only if it
 *   matches, word for word, a block its sentence cites (a note citation counts with its source blocks); otherwise its
 *   clause is dropped, or the whole sentence when the quotation is in its first clause. No "…" is left.
 * - Reasoning a model wraps in <think>…</think> is removed.
 */
export type Part = { type: 'text'; text: string } | { type: 'cite'; id: string };
/** An assistant answer's parts: also a reviewed note cited by its label. */
export type AnswerPart = Part | { type: 'note'; label: string };

export interface Sanitized {
  parts: Part[];
  /** Ids in the order first cited, each once. */
  cites: string[];
  /** Citations removed because they were not allowed. */
  dropped: string[];
  /** Quoted spans removed (by default), or clauses and sentences dropped for a quotation that doesn't match. */
  quotesRemoved: number;
}

export interface SanitizedAnswer extends Omit<Sanitized, 'parts'> {
  parts: AnswerPart[];
  /** Note labels in the order first cited, each once. */
  notes: string[];
}

export interface SanitizeOptions {
  /** Labels of the reviewed notes the model was given. */
  notes?: ReadonlySet<string>;
  /** The plain text of a block, for checking quotations word for word. Turns on clause dropping. */
  textOf?: (id: string) => string | undefined;
  /** A note's source blocks. */
  sourcesOf?: (label: string) => string[];
}

/** One id, or a range within a chapter: c15-b84–c15-b85, c15-b84-b85, c15-b84–85 (any dash). */
const ITEM = String.raw`c\d+-b\d+(?:\s*[-‐‑‒–—]\s*(?:c\d+-)?b?\d+)?`;
/** A reviewed note's label: "summary c8 §2" (also "§ 2", "s2", "section 2"), "learn-more bai who" (also "learn more"). */
const NOTE = String.raw`(?:summary\s+c\d+\s*(?:§|s|sec\.?|section)\s*\d+|learn[- ]more\s+[a-z][a-z-]*\s+(?:who|start|later|drives))`;
const ANY = `(?:${ITEM}|${NOTE})`;
const CITE = new RegExp(String.raw`[[【(]\s*(${ANY}(?:\s*[,;]\s*${ANY})*)\s*[\]】)]`, 'gi');
const NOTE_ONE = new RegExp(`^${NOTE}$`, 'i');
/** "summary c8 s2" → "summary c8 §2"; "Learn more Bai who" → "learn-more bai who". */
export function noteLabel(item: string): string {
  const t = item.trim().toLowerCase().replace(/\s+/g, ' ');
  const m = t.match(/^summary c(\d+) ?(?:§|s|sec\.?|section) ?(\d+)$/);
  if (m) return `summary c${m[1]} §${m[2]}`;
  return t.replace(/^learn[- ]more /, 'learn-more ');
}
/** A range is opened into its blocks, up to this many. */
const MAX_RANGE = 6;
const QUOTED = /["“”]([^"“”\n]{1,600})["“”]/g;
const MIN_QUOTE_WORDS = 6;
/** With `textOf`, a quotation this long or longer must match a cited block; one or two quoted words are a term or a name. */
const CHECKED_QUOTE_WORDS = 3;

/** "c15-b84–c15-b85" → ["c15-b84", "c15-b85"]; a single id stays as it is; a range across chapters or too long keeps only its ends. */
function openRange(item: string): string[] {
  const m = item.match(/^c(\d+)-b(\d+)\s*[-‐‑‒–—]\s*(?:c(\d+)-)?b?(\d+)$/);
  if (!m) return [item.trim()];
  const [ch, from, ch2, to] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : Number(m[1]), Number(m[4])];
  if (ch2 !== ch || to < from || to - from >= MAX_RANGE) return [`c${ch}-b${from}`, `c${ch2}-b${to}`];
  return Array.from({ length: to - from + 1 }, (_, k) => `c${ch}-b${from + k}`);
}

export function blockIdOk(id: string): boolean {
  return /^c\d{1,2}-b\d{1,4}$/.test(id);
}

export function sanitizeReply(raw: string, allowed: ReadonlySet<string>): Sanitized {
  // With no notes given, no part is a note.
  const { notes: _notes, ...rest } = sanitizeAnswer(raw, allowed);
  return rest as Sanitized;
}

/** The assistant's answer: block ids, reviewed notes by label, and quotations checked word for word (see the top). */
export function sanitizeAnswer(raw: string, allowed: ReadonlySet<string>, opts: SanitizeOptions = {}): SanitizedAnswer {
  // An id written with another dash (c4‑b126, a non-breaking hyphen, as the model sometimes does) is still an id.
  let text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/\bc(\d+)[‐‑‒–—]b(\d+)/g, 'c$1-b$2');
  let quotesRemoved = 0;
  if (opts.textOf) {
    const checked = checkQuotes(text, allowed, opts);
    text = checked.text;
    quotesRemoved = checked.dropped;
  } else
    text = text.replace(QUOTED, (m, inner: string) => {
      if (inner.trim().split(/\s+/).length >= MIN_QUOTE_WORDS) {
        quotesRemoved++;
        return '…';
      }
      return m;
    });
  const parts: AnswerPart[] = [];
  const cites: string[] = [];
  const notes: string[] = [];
  const dropped: string[] = [];
  let at = 0;
  for (const m of text.matchAll(CITE)) {
    const before = text.slice(at, m.index);
    if (before) parts.push({ type: 'text', text: before });
    for (const item of m[1].split(/\s*[,;]\s*/)) {
      if (NOTE_ONE.test(item.trim())) {
        const label = noteLabel(item);
        if (opts.notes?.has(label)) {
          parts.push({ type: 'note', label });
          if (!notes.includes(label)) notes.push(label);
        } else dropped.push(label);
        continue;
      }
      for (const id of openRange(item)) {
        if (allowed.has(id) && blockIdOk(id)) {
          parts.push({ type: 'cite', id });
          if (!cites.includes(id)) cites.push(id);
        } else dropped.push(id);
      }
    }
    at = m.index! + m[0].length;
  }
  const rest = text.slice(at);
  if (rest) parts.push({ type: 'text', text: rest });
  // Tidy: no space before punctuation left where a citation was removed.
  for (const p of parts) if (p.type === 'text') p.text = p.text.replace(/\s+([.,;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ');
  return { parts: parts.filter((p) => p.type !== 'text' || p.text.trim() !== ''), cites, notes, dropped, quotesRemoved };
}

/** A sentence ends at . ! or ?, after any closing quote and the citations that follow it. */
const SENTENCE = new RegExp(String.raw`(?<=[.!?][”’"')\]】]*(?:\s*[[【(]\s*${ANY}(?:\s*[,;]\s*${ANY})*\s*[\]】)])*)\s+(?!\s)(?![[【(]\s*${ANY})`, 'iu');
/** Where one clause ends and the next begins. */
const CLAUSE = /\s*(?:[,;:]|\s[—–]\s|\s-\s)\s*/g;
const words = (t: string) => t.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}']+/gu, ' ').trim();

/**
 * Quotations in the model's words (owner, 2026-11-17): one stays only if it matches, word for word, a block its sentence
 * cites. Otherwise its clause goes, or the whole sentence (citations and all) when the quotation is in its first clause,
 * so what is left is still a complete sentence. Paragraph breaks are kept.
 */
function checkQuotes(text: string, allowed: ReadonlySet<string>, opts: SanitizeOptions): { text: string; dropped: number } {
  let dropped = 0;
  const out = text.split(/(\n\s*\n|\n)/).map((chunk) => {
    if (/^\s*$/.test(chunk)) return chunk;
    return chunk
      .split(SENTENCE)
      .map((sentence) => {
        let s = sentence;
        for (let guard = 0; guard < 8; guard++) {
          const cited = citedText(s, allowed, opts);
          const bad = [...s.matchAll(QUOTED)].find((m) => {
            const inner = words(m[1]);
            return inner.split(' ').length >= CHECKED_QUOTE_WORDS && !cited.some((t) => ` ${t} `.includes(` ${inner} `));
          });
          if (!bad) return s;
          dropped++;
          const start = bad.index!;
          const end = start + bad[0].length;
          const bounds = [...s.matchAll(CLAUSE)].map((m) => ({ at: m.index!, len: m[0].length }));
          const before = bounds.filter((b) => b.at + b.len <= start).pop();
          if (!before) return '';
          const after = bounds.find((b) => b.at >= end);
          // The sentence's end: its last . ! or ?, with what follows (closing quotes and citations).
          const tail = s.match(/[.!?][”’"')\]】]*(?:\s*[[【(][^\]】)]*[\]】)])*\s*$/);
          const stop = after ? after.at : tail ? tail.index! : s.length;
          s = s.slice(0, before.at) + s.slice(stop);
        }
        return s;
      })
      .filter((s) => s.trim() !== '')
      .join(' ');
  });
  return { text: out.join('').replace(/[ \t]{2,}/g, ' ').trim(), dropped };
}

/** The plain text of every block a sentence cites; a note citation brings its source blocks. */
function citedText(sentence: string, allowed: ReadonlySet<string>, opts: SanitizeOptions): string[] {
  const ids: string[] = [];
  for (const m of sentence.matchAll(CITE))
    for (const item of m[1].split(/\s*[,;]\s*/)) {
      if (NOTE_ONE.test(item.trim())) {
        const label = noteLabel(item);
        if (opts.notes?.has(label)) ids.push(...(opts.sourcesOf?.(label) ?? []));
      } else ids.push(...openRange(item).filter((id) => allowed.has(id)));
    }
  return ids.map((id) => opts.textOf!(id)).filter((t): t is string => !!t).map(words);
}

/** A block id's chapter, or null. */
export function chapterOf(id: string): number | null {
  const m = id.match(/^c(\d+)-b\d+$/);
  return m ? Number(m[1]) : null;
}
