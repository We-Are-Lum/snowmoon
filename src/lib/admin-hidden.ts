import 'server-only';
import { cache } from 'react';
import { db } from './db';

/**
 * Seeded images an admin hid in the reader (owner, 2026-10-29). A seeded image is a file in the repository, so its hide
 * is a row in studio.seeded_hidden (NEXT_admin_picks), read before the image is shown. Until the table exists, nothing
 * is hidden (and the admin Hide answers that it isn't set up yet).
 *
 * The chapter pages are built ahead of time, all at once: during a build the list is read once per build worker (not
 * once per page, which queued 32 pages on one connection each and timed the build out), and a read that takes longer
 * than 5 seconds fails the build rather than shipping pages that show hidden images. At run time (a page rebuilt after
 * a hide) it is read fresh, once per request; if that read fails, the page shows as built.
 */
const BUILDING = process.env.NEXT_PHASE === 'phase-production-build';
let duringBuild: Promise<Set<string>> | null = null;
/** The table missing is remembered for a minute at run time, as for picks (src/lib/picks.ts). */
let missingUntil = 0;

async function read(): Promise<Set<string>> {
  const sql = db();
  if (!sql || Date.now() < missingUntil) return new Set();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<never>((_, no) => (timer = setTimeout(() => no(new Error('seeded hides: the read took over 5 s')), 5000)));
  try {
    const rows = await Promise.race([sql<{ image_id: string }[]>`select image_id from studio.seeded_hidden`, slow]);
    return new Set(rows.map((r) => r.image_id));
  } catch (e) {
    // The table missing (42P01: NEXT_admin_picks not applied yet) means nothing is hidden. Anything else is a failure.
    if ((e as { code?: string }).code === '42P01') {
      if (!BUILDING) missingUntil = Date.now() + 60_000;
      return new Set();
    }
    // At build a failed read stops the build; at run time the page shows as built (the seeded images are the project's own).
    if (BUILDING) throw e;
    console.error('seeded hides: not read', (e as Error).message);
    return new Set();
  } finally {
    clearTimeout(timer);
  }
}

export const hiddenSeeded = cache(async (): Promise<Set<string>> => {
  if (BUILDING) return (duringBuild ??= read());
  return read();
});
