/**
 * The challenge's quotes of the book, checked word for word (P8c-style; owner, 2026-11-05: "word-for-word quotes
 * checked by a test"): each is an exact substring of its block as a reader sees it (the block's text with its markup,
 * its emphasis marks and speaker-colour spans removed; whitespace and curly quote marks normalized, as quote cards
 * compare), at whole words. Used by scripts/test-challenge-moments.ts and check:principles P9g on the moments
 * (src/lib/challenge/moments.ts) and the cards (src/lib/challenge/cards.ts). Pure: the caller hands it the book's
 * blocks (scripts/lib/glossary.ts, loadBlocks), so it runs anywhere.
 */
export interface Cited {
  /** Where it is used, for the report: "moment c4-b129-symbol", "card bai fact 2". */
  where: string;
  block: string;
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** A block's text as a reader sees it: tags and emphasis marks removed, entities decoded, spaces and quote marks normalized. */
export function readerText(content: string): string {
  return content
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => (e.startsWith('#x') ? String.fromCodePoint(parseInt(e.slice(2), 16)) : e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1))) : (ENTITIES[e] ?? m)))
    .replace(/(\*\*|\*|__)(?=\S)([^*_]+?)(?<=\S)\1/g, '$2')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const wordChar = /[\p{L}\p{N}]/u;
/** The quote is in the text and doesn't start or end in the middle of a word. */
function atWholeWords(text: string, q: string): boolean {
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) {
    const before = text[i - 1] ?? ' ', after = text[i + q.length] ?? ' ';
    if (!(wordChar.test(q[0]) && wordChar.test(before)) && !(wordChar.test(q[q.length - 1]) && wordChar.test(after))) return true;
  }
  return false;
}

/** What is wrong with these quotes: a block that doesn't exist, or words that aren't in it word for word. */
export function quoteProblems(quotes: readonly Cited[], blocks: ReadonlyMap<string, { kind: string; content: string }>): string[] {
  const out: string[] = [];
  for (const q of quotes) {
    const b = blocks.get(q.block);
    if (!b) out.push(`${q.where}: ${q.block} is not a block of the book`);
    else if (!q.text.trim()) out.push(`${q.where}: an empty quote of ${q.block}`);
    else if (!atWholeWords(readerText(b.content), norm(q.text))) out.push(`${q.where}: "${q.text.slice(0, 60)}" is not word for word in ${q.block}`);
  }
  return out;
}
