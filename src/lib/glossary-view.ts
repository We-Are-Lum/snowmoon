/**
 * The glossary's shapes and the small pure helpers its client components share
 * (no server imports: the pages pass these in as props).
 */
export interface GlossaryIndexEntry {
  slug: string;
  term: string;
  /** The chapter the word first appears in. */
  chapter: number;
}

export interface GlossaryTermView {
  slug: string;
  term: string;
  aliases: string[];
  respelling: string | null;
  firstChapter: number;
  /** The sentence of the first block where the word appears, verbatim. */
  firstSentence: { block: string; chapter: number; label: string; text: string };
  explanations: { block: string; chapter: number; label: string; text: string }[];
  mentions: { chapter: number; blocks: { block: string; label: string }[] }[];
  clip: { block: string; chapter: number; label: string; url: string; seconds: number; voice: string } | null;
}

/** A reading place: "c3-b42" (chapter 3, block 42), or null if it isn't one. */
export function parsePlace(s: string | null | undefined, chapters = 32): { chapter: number; block: string } | null {
  const m = s?.match(/^c(\d{1,2})-b(\d{1,4})$/);
  if (!m) return null;
  const chapter = Number(m[1]);
  return chapter >= 1 && chapter <= chapters ? { chapter, block: `c${chapter}-b${Number(m[2])}` } : null;
}

/** Where a block is in the reader. */
export const blockHref = (block: string) => `/chapter/${block.match(/^c(\d+)/)![1]}#${block}`;

/** A quote's Markdown marks as HTML: *italic* and \-escapes. Everything else is text. */
export function quoteHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\\(.)/g, '$1')
    .replace(/&amp;nbsp;/g, ' ');
}

/**
 * The block at the top of the reader's screen, as a reading place, when a chapter is open.
 * Used by the menu's Glossary link so "Back" returns there.
 */
export function readingPlace(): string | null {
  if (typeof document === 'undefined') return null;
  const bar = document.querySelector('.topbar');
  const top = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().bottom : 0;
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('.page.chapter .block[id]'));
  const at = blocks.find((el) => el.getBoundingClientRect().bottom > top + 8);
  return at && parsePlace(at.id) ? at.id : null;
}
