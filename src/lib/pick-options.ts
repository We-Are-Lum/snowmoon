import 'server-only';
import { loadIllustrations } from './illustrations';
import { db } from './db';
import { chapterImages } from './images/data';
import { byline } from './images/byline';
import { referenceSheets } from './references';
import { sheetImages } from './images/sheet-images';
import { hiddenSeeded } from './admin-hidden';
import { additionsEverywhere, replacementsEverywhere } from './chapter-pictures/read';
import { addedPictures, shownPicture, type Redone } from './chapter-pictures/view';

/**
 * The images a moment or a glossary term can show (owner, 2026-10-29): the seeded image at that block (unless an admin
 * hid it) and readers' published images whose passage covers it; for a term, its sheets' images as References shows
 * them. What the pick switch orders and what the review pages list. Reads no picks.
 *
 * A pick of a seeded image names its job (the image's id), not a file. When an admin has redone that picture and kept
 * the redo, the option shows the kept redo, with who, when and the model, as the chapter shows it just above the
 * switch (owner, 2026-11-18/19); a restore brings back the committed file. The pick itself is unchanged.
 *
 * A picture an admin added (owner, 2026-11-21) is one of the edition's pictures at the block it sits after, so a moment
 * offers it there, as it offers the edition's picture at its own block: kind "seeded", keyed by its id, credited
 * "Added by @handle". Only there, not at every block of its passage: the chapter shows it after that block, and a pick
 * there sets aside every edition picture at the block (src/components/admin-picks.tsx), so each must stay one tap away
 * in the switch. Taken off, never kept, or hidden: not offered (hidden ones are listed, marked, on the admins' review).
 * A term offers it where its sheets show it (src/lib/images/sheet-images.ts).
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
  /** A seeded image an admin redid and kept: the redo shows, credited. */
  redone?: Redone;
}

export async function momentOptions(chapter: number, opts: { withHidden?: boolean } = {}): Promise<Map<number, PickOption[]>> {
  const [hidden, shown, additions] = await Promise.all([hiddenSeeded(), replacementsEverywhere(), additionsEverywhere()]);
  const out = new Map<number, PickOption[]>();
  const add = (idx: number, o: PickOption) => out.set(idx, [...(out.get(idx) ?? []), o]);
  for (const committed of loadIllustrations(chapter)) {
    const h = hidden.has(committed.id);
    if (h && !opts.withHidden) continue;
    const im = shownPicture(committed, shown);
    add(im.idx, { key: im.id, kind: 'seeded', url: im.url, alt: im.alt, href: `/chapter/${chapter}#c${chapter}-b${im.idx}`, by: null, likes: 0, createdAt: null, hidden: h, ...(im.replaced ? { redone: im.replaced } : {}) });
  }
  // Added pictures, after the edition's at the same block; a hidden one only for the admins' review (withHidden).
  for (const im of addedPictures(chapter, additions, shown, opts.withHidden ? new Set() : hidden)) {
    add(im.idx, { key: im.id, kind: 'seeded', url: im.url, alt: im.alt, href: `/chapter/${chapter}#c${chapter}-b${im.idx}`, by: null, likes: 0, createdAt: null, hidden: hidden.has(im.id), redone: im.replaced });
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
      out.push({ key: im.key, kind: im.reader ? 'reader' : 'seeded', url: im.url, alt: im.alt, href: im.href, by: im.reader?.by ?? null, likes: 0, createdAt: im.reader?.date ?? null, hidden: false, ...(im.redone ? { redone: im.redone } : {}) });
    }
  return out;
}
