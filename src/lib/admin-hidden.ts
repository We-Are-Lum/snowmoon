import 'server-only';
import { cache } from 'react';
import { db } from './db';

/**
 * Seeded images an admin hid in the reader (owner, 2026-10-29). A seeded image is a file in the repository, so its hide
 * is a row in studio.seeded_hidden (NEXT_admin_picks), read before the image is shown. Until the table exists, nothing
 * is hidden (and the admin Hide answers that it isn't set up yet).
 */
export const hiddenSeeded = cache(async (): Promise<Set<string>> => {
  const sql = db();
  if (!sql) return new Set();
  try {
    const rows = await sql<{ image_id: string }[]>`select image_id from studio.seeded_hidden`;
    return new Set(rows.map((r) => r.image_id));
  } catch (e) {
    console.error('seeded hides: none read', (e as Error).name);
    return new Set();
  }
});
