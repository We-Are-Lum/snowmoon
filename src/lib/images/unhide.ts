import 'server-only';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { getPrivate, keyFor, restorePublic } from './store';
import { unhideReachesTakes } from '../voice/take-hide';
import { hideReachesChapterPictures } from '../chapter-pictures/after-hide';
import type { Work } from './designs';

/**
 * A moderator's unhide of a reader's image (Nate, 2026-11-27: the follow-up to #255). Principle 5, reread by Nate
 * 2026-11-23: "A moderator may unhide what was hidden; it puts back exactly what its maker published, and never publishes
 * anything else." So: only an image a moderator or a stated rule hid (a maker's own hide is theirs to undo, on the
 * image's own page); each file goes back to the public bucket only if its private copy is byte for byte the published
 * file (its sha256 is the image's own); then the element is published again, the steps are logged, the takes hidden only
 * because of it come back (studio.unhide_takes_using_picture: not those hidden or reported for themselves), and a chapter
 * picture made after it credits it again.
 */
type Sql = postgres.Sql;
export interface UnhideDeps {
  getPrivate: (key: string) => Promise<Buffer | Uint8Array | null>;
  restorePublic: (sha256: string) => Promise<void>;
}
const realDeps: UnhideDeps = { getPrivate, restorePublic };

export async function unhideImage(sql: Sql, el: Work, by: number, deps: UnhideDeps = realDeps): Promise<{ ok: true; takes: number } | { ok: false; status: number; error: string }> {
  if (el.type !== 'image') return { ok: false, status: 400, error: 'Only a picture can be unhidden here' };
  if (el.status !== 'hidden') return { ok: false, status: 404, error: 'Not hidden' };
  const [last] = await sql`select role from studio.removal_log where element_id = ${el.elementId} and step in ('hidden', 'unhidden') order by at desc limit 1`;
  if (!last || !['moderator', 'rule', 'maintainer'].includes(String(last.role))) return { ok: false, status: 403, error: 'Its maker hid it; only they can bring it back' };
  for (const sha of el.files) {
    const bytes = await deps.getPrivate(keyFor(sha));
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== sha) return { ok: false, status: 409, error: 'Its kept copy is not the published picture, so nothing was changed' };
  }
  for (const sha of el.files) await deps.restorePublic(sha);
  await sql.begin(async (tx) => {
    await tx`update studio.elements set status = 'published' where id = ${el.elementId} and status = 'hidden'`;
    await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'restored_public', by_fid: by, role: 'moderator' })}`;
    await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'unhidden', by_fid: by, role: 'moderator' })}`;
  });
  const t = await unhideReachesTakes(sql, el.elementId, by, 'moderator').catch((e) => (console.error('moderate: bringing the takes back failed', (e as Error).name), { takes: 0 }));
  await hideReachesChapterPictures(sql, el.elementId).catch(() => undefined);
  return { ok: true, takes: t.takes };
}

/** Readers' images a moderator or a rule hid, newest first: what a moderator can unhide (never a maker's own hide). */
export async function hiddenImages(sql: Sql) {
  const rows = await sql`
    with last as (
      select distinct on (element_id) element_id, step, role, by_fid, at from studio.removal_log
      where step in ('hidden', 'unhidden') order by element_id, at desc)
    select v.id as version_id, last.role, last.by_fid, last.at
    from last join studio.elements e on e.id = last.element_id and e.element_type = 'image' and e.status = 'hidden'
    join lateral (select id from studio.element_versions where element_id = e.id order by version_no desc limit 1) v on true
    where last.step = 'hidden' and last.role in ('moderator', 'rule', 'maintainer')
    order by last.at desc limit 100`;
  return rows.map((r) => ({
    versionId: String(r.version_id),
    hiddenAt: new Date(r.at as string).toISOString(),
    hiddenBy: r.role === 'rule' ? 'a stated rule' : `${r.role} (FID ${r.by_fid})`,
  }));
}
