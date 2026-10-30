import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORK } from './config';
import { sheetImages } from './images/sheet-images';
import { placeTitle, sheetCharacters, sheetPlace } from './images/sheets';
import type { SheetImage } from '~/components/design-sheets';

/**
 * References (owner, 2026-10-29, the next-version plan, Phase 1): one card per glossary term that has images, from
 * the character and place sheets content/snowmoon/references.json names for it. A link marked `check` (uncertain,
 * matched only because a place's name contains the term) is left out until the owner's review clears it. Terms with no
 * image aren't shown (owner, 2026-10-29); "Add a reference" is on the term's own glossary page.
 */
type MapFile = { terms: { term: string; designs: { kind: 'character' | 'place'; slug: string; check: boolean }[] }[] };
type Term = { slug: string; term: string; first_chapter: number; first_sentence: { block: string; text: string } };

export interface ReferenceCard {
  slug: string;
  term: string;
  chapter: number;
  firstSentence: { block: string; text: string };
  sheets: { kind: 'character' | 'place'; slug: string; name: string; href: string }[];
  images: SheetImage[];
  total: number;
}

const read = <T,>(file: string): T => JSON.parse(readFileSync(path.join(process.cwd(), 'content', WORK.id, file), 'utf8')) as T;
const SHOWN = 3;

/** The design sheets the reviewed map links to a glossary term (uncertain links left out). */
export function referenceSheets(term: string): ReferenceCard['sheets'] {
  const entry = read<MapFile>('references.json').terms.find((t) => t.term === term);
  return (entry?.designs ?? [])
    .filter((d) => !d.check)
    .map((d) => {
      if (d.kind === 'character') {
        const c = sheetCharacters().find((x) => x.slug === d.slug);
        return c ? { kind: d.kind, slug: d.slug, name: c.name, href: `/references/designs/character/${d.slug}` } : null;
      }
      const p = sheetPlace(d.slug);
      return p ? { kind: d.kind, slug: d.slug, name: placeTitle(p.name), href: `/references/designs/place/${d.slug}` } : null;
    })
    .filter((x) => x !== null);
}

/** Every glossary term with at least one image, in the order a reader meets them. */
export async function referenceCards(): Promise<ReferenceCard[]> {
  const terms = read<{ terms: Term[] }>('glossary.json').terms;
  const cards: ReferenceCard[] = [];
  for (const t of terms) {
    const sheets = referenceSheets(t.slug);
    if (!sheets.length) continue;
    const seen = new Set<string>();
    const images: SheetImage[] = [];
    for (const s of sheets) for (const im of await sheetImages(s.kind, s.slug, s.name)) if (!seen.has(im.key)) (seen.add(im.key), images.push(im));
    if (!images.length) continue;
    cards.push({ slug: t.slug, term: t.term, chapter: t.first_chapter, firstSentence: { block: t.first_sentence.block, text: t.first_sentence.text }, sheets, images: images.slice(0, SHOWN), total: images.length });
  }
  return cards.sort((a, b) => a.chapter - b.chapter || a.term.localeCompare(b.term));
}
