import type { Part } from '../chat/sanitize';

/**
 * Block ids in the coach's replies (owner, 2026-10-19: "Coach faults: fix now": a reply showed "[c91]", which isn't a
 * block id, as plain text). The shared cleaner (src/lib/chat/sanitize.ts) turns well-formed ids it was given into
 * citations and coach.ts keeps only those found in the book's text; these two cover what it leaves as text.
 */

/** An id written loosely ([C7-B60], [c7 b60], [c7b60], [c7_b60]) becomes c7-b60, so the cleaner can check it. */
export function normaliseCites(raw: string): string {
  return raw.replace(/([[【(]\s*)c\s*(\d+)\s*[-‐‑‒–—_ ]?\s*b\s*(\d+)(?=\s*[\]】),;])/gi, (_m, open: string, ch: string, b: string) => `${open}c${ch}-b${b}`);
}

/** What still looks like a citation but isn't one ([c91], [b60], [c7-b], [ch. 7], (c91)) is dropped from the text. */
const BROKEN = [/\s*[[【]\s*(?:c|ch\.?|chapter|b|block)\s*\d+[^\]】\n]{0,24}[\]】]/gi, /\s*\(\s*c\d+(?:\s*-\s*b?\d*)?\s*\)/gi];

export function dropBrokenCites(parts: Part[]): { parts: Part[]; dropped: string[] } {
  const dropped: string[] = [];
  // Text on both sides of a citation the cleaner dropped is joined first, so the tidying sees it as one.
  const joined: Part[] = [];
  for (const p of parts) {
    const last = joined.at(-1);
    if (p.type === 'text' && last?.type === 'text') joined[joined.length - 1] = { type: 'text', text: last.text + p.text };
    else joined.push(p);
  }
  const out = joined.map((p) => {
    if (p.type !== 'text') return p;
    let text = p.text;
    for (const re of BROKEN)
      text = text.replace(re, (m) => {
        dropped.push(m.trim());
        return '';
      });
    return { type: 'text' as const, text: text.replace(/\s+([.,;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ') };
  });
  return { parts: out.filter((p) => p.type === 'cite' || p.text.trim() !== ''), dropped };
}
