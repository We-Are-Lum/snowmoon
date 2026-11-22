import 'server-only';
import { rawIntro } from '../intro';
import { seededOnSheet } from '../images/sheets';
import { isAddedId } from './shared';

/**
 * Every page a chapter picture shows on, for revalidating after a Keep or a Restore (owner, 2026-11-18/19: a kept redo
 * reaches every place the picture shows). Pages that are built ahead of time or kept for a while (ISR) are revalidated
 * by path; the pages rendered on each request (home, the share pages, the card images, the pick switch's data) read
 * the replacements through the tag (PICTURES_TAG, src/lib/chapter-pictures/read.ts), which the route revalidates too.
 *  - the chapter itself (and its player);
 *  - an introduction card's picture is in every page's shell ("What is this?"), so the whole site (the root layout);
 *  - a picture of a character or a place shows on its sheet and on References' glossary cards: everything under
 *    /references.
 * A picture an admin added (owner, 2026-11-21) is never in the introduction; it may be on character and place sheets
 * (src/lib/images/sheet-images.ts, addedOnSheet), so its chapter and everything under /references, always: whether it
 * is on a sheet depends on its recipe and its passage, and revalidating /references when it isn't costs one re-render.
 * Its quote cards (the share pages, saved cards and the card images) and the pick switch's data are rendered on each
 * request and read it through the tag. Keep, take it off and show it again are all decisions through the show route;
 * a Hide goes through the admin Hide route, which revalidates these same paths.
 */
export type Revalidation = { path: string; type?: 'layout' | 'page' };

export function pathsFor(jobId: string, chapter: number): Revalidation[] {
  const out: Revalidation[] = [{ path: `/chapter/${chapter}` }];
  if (isAddedId(jobId)) return [...out, { path: '/references', type: 'layout' }];
  const inIntro = rawIntro().cards.some((c) => c.image === `published:${jobId}`);
  if (inIntro) return [{ path: '/', type: 'layout' }];
  if (seededOnSheet(jobId)) out.push({ path: '/references', type: 'layout' });
  return out;
}
