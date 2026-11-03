import 'server-only';
import { db } from '../db';
import { loadIllustrations } from '../illustrations';
import { hiddenSeeded } from '../admin-hidden';
import { imagesWithSheet } from './data';
import { byline } from './byline';
import { passageLabel } from './passage';
import { placeTitle, seededImages, sheetCharacters, sheetPlace, slugOfLocation } from './sheets';
import type { SheetImage } from '~/components/design-sheets';

/**
 * The images of a character or a place, for its sheet page: readers' published images whose recipe
 * records it, newest first, then this edition's seeded images (published.json) in book order.
 */
export async function sheetImages(kind: 'character' | 'place', slug: string, name: string): Promise<SheetImage[]> {
  const sql = db();
  const readers = sql ? await imagesWithSheet(sql, kind, slug, name).catch(() => []) : [];
  const fromReaders: SheetImage[] = readers.map((im) => {
    const by = byline(im.byName, im.byFid);
    return {
      key: im.versionId, href: `/image/${im.versionId}`, url: im.url, alt: `AI-generated image: ${im.userPrompt.split(/(?<=[.!?])\s/)[0]}`,
      chapter: im.chapter, where: passageLabel(im.chapter, im.start, im.end),
      reader: { versionId: im.versionId, by, prompt: im.userPrompt, date: im.createdAt.slice(0, 10) }, recipe: null,
    };
  });
  // Seeded images an admin hid (owner, 2026-10-29) aren't shown here either.
  const hidden = await hiddenSeeded();
  const seeded = seededImages()
    .filter((s) => !hidden.has(s.id))
    .filter((s) => (kind === 'place' ? slugOfLocation(s.location) === slug : (s.characters ?? []).includes(slug)))
    .sort((a, b) => a.chapter - b.chapter || a.idx - b.idx)
    .map((s): SheetImage => ({
      key: s.id, href: `/chapter/${s.chapter}#c${s.chapter}-b${s.idx}`, url: s.url,
      alt: loadIllustrations(s.chapter).find((i) => i.id === s.id)?.alt ?? 'AI-generated image',
      chapter: s.chapter, where: passageLabel(s.chapter, s.idx, s.idx), reader: null, recipe: { file: s.recipe, item: s.id },
    }));
  return [...fromReaders, ...seeded];
}

/** "In this image": the characters and place an image is of, each with its sheet's link. */
export function inThisImage(characters: string[], place: string | null): { href: string; name: string }[] {
  const chars = characters.map((s) => sheetCharacters().find((c) => c.slug === s)).filter((c) => c !== undefined);
  return [
    ...chars.map((c) => ({ href: `/references/designs/character/${c.slug}`, name: c.name })),
    ...(place ? [placeLink(place)].filter((p) => p !== null) : []),
  ];
}
function placeLink(slug: string) {
  const p = sheetPlace(slug);
  return p ? { href: `/references/designs/place/${p.slug}`, name: placeTitle(p.name) } : null;
}
/** For a seeded image (published.json): its characters and place. */
export function seededInImage(id: string) {
  const s = seededImages().find((x) => x.id === id);
  return s ? inThisImage(s.characters ?? [], slugOfLocation(s.location)) : [];
}
