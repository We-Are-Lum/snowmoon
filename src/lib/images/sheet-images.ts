import 'server-only';
import { hasPassage } from './no-passage';
import { db } from '../db';
import { loadIllustrations } from '../illustrations';
import { hiddenSeeded } from '../admin-hidden';
import { additionsEverywhere, replacementsEverywhere } from '../chapter-pictures/read';
import { keptAddedPictures, shownPicture, type AddedIllustration } from '../chapter-pictures/view';
import { imagesWithSheet } from './data';
import { byline } from './byline';
import { passageLabel } from './passage';
import { inPassage, placeTitle, seededImages, sheetCharacters, sheetPlace, slugOfLocation } from './sheets';
import type { SheetImage } from '~/components/design-sheets';

/**
 * The images of a character or a place, for its sheet page: readers' published images whose recipe
 * records it, newest first, then this edition's seeded images (published.json) in book order.
 */
export async function sheetImages(kind: 'character' | 'place', slug: string, name: string): Promise<SheetImage[]> {
  const sql = db();
  const readers = sql ? await imagesWithSheet(sql, kind, slug, name).catch(() => []) : [];
  // A sheet's images are listed by chapter: a remix challenge picture has no passage (owner, 2026-11-10), so it isn't here.
  const fromReaders: SheetImage[] = readers.filter(hasPassage).map((im) => {
    const by = byline(im.byName, im.byFid);
    return {
      key: im.versionId, href: `/image/${im.versionId}`, url: im.url, alt: `AI-generated image: ${im.userPrompt.split(/(?<=[.!?])\s/)[0]}`,
      chapter: im.chapter, where: passageLabel(im.chapter, im.start, im.end),
      reader: { versionId: im.versionId, by, prompt: im.userPrompt, date: im.createdAt.slice(0, 10) }, recipe: null,
    };
  });
  // Seeded images an admin hid (owner, 2026-10-29) aren't shown here either; one an admin redid and kept shows the
  // kept redo, with who, when and the model, as the chapter does (owner, 2026-11-18/19).
  const [hidden, shown, additions] = await Promise.all([hiddenSeeded(), replacementsEverywhere(), additionsEverywhere()]);
  const seeded = seededImages()
    .filter((s) => !hidden.has(s.id))
    .filter((s) => (kind === 'place' ? slugOfLocation(s.location) === slug : (s.characters ?? []).includes(slug)))
    .sort((a, b) => a.chapter - b.chapter || a.idx - b.idx)
    .map((s): SheetImage => {
      const alt = loadIllustrations(s.chapter).find((i) => i.id === s.id)?.alt ?? 'AI-generated image';
      const p = shownPicture({ id: s.id, idx: s.idx, url: s.url, width: 1024, height: 576, recipe: s.recipe, alt }, shown);
      return {
        key: s.id, href: `/chapter/${s.chapter}#c${s.chapter}-b${s.idx}`, url: p.url, alt,
        chapter: s.chapter, where: passageLabel(s.chapter, s.idx, s.idx), reader: null, recipe: { file: s.recipe, item: s.id },
        ...(p.replaced ? { redone: p.replaced } : {}),
      };
    });
  // Pictures admins added (owner, 2026-11-21), among the edition's in book order: kept, not taken off, not hidden.
  const added = keptAddedPictures(additions, shown, hidden)
    .filter((a) => addedOnSheet(a, kind, slug))
    .map((a): SheetImage & { at: [number, number] } => ({
      key: a.id, href: `/chapter/${a.chapter}#c${a.chapter}-b${a.idx}`, url: a.url, alt: a.alt,
      chapter: a.chapter, where: passageLabel(a.chapter, a.passage.start, a.passage.end), reader: null, recipe: null, redone: a.replaced, at: [a.chapter, a.idx],
    }));
  if (!added.length) return [...fromReaders, ...seeded];
  const place = new Map(seededImages().map((s) => [s.id, [s.chapter, s.idx] as [number, number]]));
  const edition = [...seeded.map((s) => ({ ...s, at: place.get(s.key)! })), ...added].sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
  return [...fromReaders, ...edition.map(({ at: _at, ...im }) => (void _at, im))];
}

/**
 * Which sheets a picture an admin added shows on (owner, 2026-11-21). The edition's own pictures are on a sheet because
 * a person marked each job with its characters and place (published.json), not because the term is used in its
 * passage; readers' images, because their recipe records the sheet they chose. An added picture follows the same idea:
 *  - a character's sheet: when that character's sheet picture was sent with it (its recipe's `references`, which the
 *    admin chose among the characters its passage names); a character only named in the passage is not enough, since
 *    the picture need not show them;
 *  - a place's sheet: when its passage sits in a part of a scene with that place (content/snowmoon/designs/scenes.json,
 *    the rule that decides a passage's place everywhere else, inPassage), since an added picture records no place.
 * DRAFT rule (coding agent, 2026-11-21), for the owner to confirm.
 */
export function addedOnSheet(a: Pick<AddedIllustration, 'chapter' | 'passage' | 'sheets'>, kind: 'character' | 'place', slug: string): boolean {
  if (kind === 'character') return a.sheets.includes(slug);
  return inPassage(a.chapter, a.passage.start, a.passage.end).place?.slug === slug;
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
