import 'server-only';
import type postgres from 'postgres';
import { revalidatePath, revalidateTag } from 'next/cache';
import { forgetReplacements, PICTURES_TAG } from './read';
import { picturesMadeAfter, picturesMadeAfterJob } from './references';
import { pathsFor } from './where';

/**
 * A hide (or a maker's own unhide) of a picture or a sheet reaches the captions of the chapter pictures made after it
 * (owner's request via Garance, 2026-11-21; P5f: hides win): "after @name's Zei remix" becomes "after a picture since
 * hidden" on every page those pictures show on, at their next request. Reads only; never fails the hide itself.
 */
export async function hideReachesChapterPictures(sql: postgres.Sql, elementId: string): Promise<void> {
  try {
    const jobs = await picturesMadeAfter(sql, elementId);
    if (!jobs.length) return;
    forgetReplacements();
    revalidateTag(PICTURES_TAG);
    for (const j of jobs) for (const p of pathsFor(j.jobId, j.chapter)) revalidatePath(p.path, p.type);
  } catch (e) {
    console.error('chapter pictures: a hide did not reach their captions', (e as Error).name);
  }
}

/**
 * The same for an admin's hide of one of the edition's chapter pictures (a seeded hide by its job's id, 2026-11-24): the
 * chapter pictures made after it (picked as a `chapter` or `edition` reference) read "a picture since hidden" at their
 * next request. Reads only; never fails the hide itself.
 */
export async function jobHideReachesChapterPictures(sql: postgres.Sql, jobId: string): Promise<void> {
  try {
    const jobs = await picturesMadeAfterJob(sql, jobId);
    if (!jobs.length) return;
    forgetReplacements();
    revalidateTag(PICTURES_TAG);
    for (const j of jobs) for (const p of pathsFor(j.jobId, j.chapter)) revalidatePath(p.path, p.type);
  } catch (e) {
    console.error('chapter pictures: a hide did not reach their captions', (e as Error).name);
  }
}
