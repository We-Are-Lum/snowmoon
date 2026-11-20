import 'server-only';
import { rawIntro } from '../intro';
import { seededOnSheet } from '../images/sheets';

/**
 * Every page a chapter picture shows on, for revalidating after a Keep or a Restore (owner, 2026-11-18/19: a kept redo
 * reaches every place the picture shows). Pages that are built ahead of time or kept for a while (ISR) are revalidated
 * by path; the pages rendered on each request (home, the share pages, the card images, the pick switch's data) read
 * the replacements through the tag (PICTURES_TAG, src/lib/chapter-pictures/read.ts), which the route revalidates too.
 *  - the chapter itself (and its player);
 *  - an introduction card's picture is in every page's shell ("What is this?"), so the whole site (the root layout);
 *  - a picture of a character or a place shows on its sheet and on References' glossary cards: everything under
 *    /references.
 */
export type Revalidation = { path: string; type?: 'layout' | 'page' };

export function pathsFor(jobId: string, chapter: number): Revalidation[] {
  const out: Revalidation[] = [{ path: `/chapter/${chapter}` }];
  const inIntro = rawIntro().cards.some((c) => c.image === `published:${jobId}`);
  if (inIntro) return [{ path: '/', type: 'layout' }];
  if (seededOnSheet(jobId)) out.push({ path: '/references', type: 'layout' });
  return out;
}
