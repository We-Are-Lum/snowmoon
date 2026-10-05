import 'server-only';
import { blockFacts, labelRange } from './reading';
import { renderMarkdown } from './render';
import { loadChapter } from './book';
import { loadIllustrations, type Illustration } from './illustrations';

/**
 * Quote cards (stateless): a share link names a chapter, a run of blocks, an
 * optional exact quote inside them, and an optional seeded image. Everything on
 * the card comes from the book, checked here, so a card can never misquote it.
 */
export const MAX_BLOCKS = 4;
export const MAX_QUOTE = 420;
const QUOTABLE = new Set(['paragraph', 'quote']);

export interface Quote {
  chapter: number;
  from: number; // block idx
  to: number;
  text: string; // what the card shows
  label: string; // "¶ 4" or "¶ 4–6"
  setting: string | null;
  image: Illustration | null;
  truncated: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** A block's text as a reader sees it (the textContent of its rendered HTML). */
export function plainText(content: string, kind: string): string {
  const html = renderMarkdown({ idx: 0, kind, content });
  return html
    .replace(/<\/(p|li|blockquote)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)));
      return ENTITIES[e] ?? m;
    })
    .trim();
}

/** Whitespace and quote marks normalized, for comparing a selection with the book. */
export const normalize = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** "5" or "5-7". */
export function parseRange(range: string): [number, number] | null {
  const m = range.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
  if (!m) return null;
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  return to >= from && to - from < 200 ? [from, to] : null;
}

function clip(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_QUOTE) return { text, truncated: false };
  const cut = text.slice(0, MAX_QUOTE);
  return { text: cut.slice(0, Math.max(cut.lastIndexOf(' '), MAX_QUOTE - 40)).replace(/[,;:\s]+$/, '') + '…', truncated: true };
}

export function resolveQuote(n: number, range: string, q?: string | null, img?: string | null): Quote | null {
  const chapter = loadChapter(n);
  const r = parseRange(range);
  if (!chapter || !r) return null;
  const facts = blockFacts(chapter.blocks);
  const picked = chapter.blocks
    .map((b, i) => ({ b, f: facts[i] }))
    .filter(({ b }) => b.idx >= r[0] && b.idx <= r[1]);
  if (!picked.length || picked.length > MAX_BLOCKS) return null;
  if (picked[0].b.idx !== r[0] || picked[picked.length - 1].b.idx !== r[1]) return null;
  if (!picked.every(({ b }) => QUOTABLE.has(b.kind))) return null;

  const whole = normalize(picked.map(({ b }) => plainText(b.content, b.kind)).join(' '));
  let text = whole;
  if (q) {
    const want = normalize(q);
    if (want.length < 3 || !whole.includes(want)) return null; // not in the book: no card
    text = want;
  }
  const labels = picked.map(({ f }) => f.label!).filter((l) => l !== null);
  const image = img ? loadIllustrations(n).find((i) => i.id === img) ?? null : null;
  if (img && !image) return null;
  const clipped = clip(text);
  return {
    chapter: n,
    from: r[0],
    to: r[1],
    text: clipped.text,
    truncated: clipped.truncated,
    label: labelRange(labels[0], labels[labels.length - 1]),
    setting: picked[0].f.setting,
    image,
  };
}

/** Query string for a quote's share and card URLs. */
export function quoteQuery(q?: string | null, img?: string | null): string {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (img) p.set('img', img);
  const s = p.toString();
  return s ? `?${s}` : '';
}
