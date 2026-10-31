import 'server-only';
import { loadIllustrations } from './illustrations';
import { db } from './db';
import { chapterImages } from './images/data';
import { byline } from './images/byline';
import { referenceSheets } from './references';
import { sheetImages } from './images/sheet-images';
import { hiddenSeeded } from './admin-hidden';

/**
 * The images a moment or a glossary term can show (owner, 2026-10-29): the seeded image at that block (unless an admin
 * hid it) and readers' published images whose passage covers it; for a term, its sheets' images as References shows
 * them. What the pick switch orders and what the review pages list. Reads no picks.
 */
export interface PickOption {
  key: string;
  kind: 'seeded' | 'reader';
  url: string;
  alt: string;
  href: string;
  /** "AI image · by …" for a reader's image; null for the project's seeded image. */
  by: string | null;
  likes: number;
  createdAt: string | null;
  hidden: boolean;
}

export async function momentOptions(chapter: number, opts: { withHidden?: boolean } = {}): Promise<Map<number, PickOption[]>> {
  const hidden = await hiddenSeeded();
  const out = new Map<number, PickOption[]>();
  const add = (idx: number, o: PickOption) => out.set(idx, [...(out.get(idx) ?? []), o]);
  for (const im of loadIllustrations(chapter)) {
    const h = hidden.has(im.id);
    if (h && !opts.withHidden) continue;
    add(im.idx, { key: im.id, kind: 'seeded', url: im.url, alt: im.alt, href: `/chapter/${chapter}#c${chapter}-b${im.idx}`, by: null, likes: 0, createdAt: null, hidden: h });
  }
  const sql = db();
  const readers = sql ? await chapterImages(sql, chapter).catch(() => []) : [];
  for (const im of readers) {
    const o: PickOption = { key: im.versionId, kind: 'reader', url: im.url, alt: `AI-generated image: ${im.userPrompt.split(/(?<=[.!?])\s/)[0]}`, href: `/image/${im.versionId}`, by: byline(im.byName, im.byFid), likes: im.likes, createdAt: im.createdAt, hidden: false };
    for (let i = im.start; i <= im.end; i++) add(i, o);
  }
  return out;
}

export async function termOptions(term: string): Promise<PickOption[]> {
  const sheets = referenceSheets(term);
  const seen = new Set<string>();
  const hidden = await hiddenSeeded();
  const out: PickOption[] = [];
  for (const s of sheets)
    for (const im of await sheetImages(s.kind, s.slug, s.name)) {
      if (seen.has(im.key) || (!im.reader && hidden.has(im.key))) continue;
      seen.add(im.key);
      out.push({ key: im.key, kind: im.reader ? 'reader' : 'seeded', url: im.url, alt: im.alt, href: im.href, by: im.reader?.by ?? null, likes: 0, createdAt: im.reader?.date ?? null, hidden: false });
    }
  return out;
}
