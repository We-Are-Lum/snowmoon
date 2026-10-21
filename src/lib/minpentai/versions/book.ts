/**
 * Checks a version's book citations against the committed chapter text (content/snowmoon/text/):
 * the quoted words must appear in the blocks cited. Node only (reads files).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const cache = new Map<number, Map<number, string>>();
const norm = (s: string) => s.replace(/[*_]/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/—/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

function block(root: string, id: string): string | null {
  const m = /^c(\d+)-b(\d+)$/.exec(id);
  if (!m) return null;
  const ch = +m[1], b = +m[2];
  if (!cache.has(ch)) {
    try {
      const j = JSON.parse(readFileSync(path.join(root, 'content/snowmoon/text', `chapter-${ch}.json`), 'utf8')) as { blocks: { idx: number; content: string }[] };
      cache.set(ch, new Map(j.blocks.map((x) => [x.idx, x.content])));
    } catch {
      cache.set(ch, new Map());
    }
  }
  return cache.get(ch)!.get(b) ?? null;
}

/** True when every piece of the quote (split at "...") appears in one of the cited blocks. */
export function quoteFound(root: string, says: string, blocks: string[]): boolean {
  const texts = blocks.map((b) => block(root, b)).filter((t): t is string => t !== null).map(norm);
  if (!texts.length) return false;
  const parts = says.split(/\.\.\.|…/).map(norm).filter(Boolean);
  return parts.length > 0 && parts.every((p) => texts.some((t) => t.includes(p.replace(/^"|"$/g, ''))));
}
