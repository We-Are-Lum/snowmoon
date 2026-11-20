import 'server-only';
import type postgres from 'postgres';
import { isAdmin } from '../admins';
import type { Look, PictureRecipe } from './shared';

/**
 * The only code that changes what a chapter shows (owner's ruling for principle 5, 2026-11-18, reread by the owner 2026-11-19: "An
 * admin may replace a picture in the site's own edition of a chapter. The change is public at once, shows who made it
 * and when, and can be undone. This covers only the edition's own pictures, never the order or prominence of people's
 * published work."; adding pictures, 2026-11-19, pending his reread). It writes the four chapter-picture tables and nothing else (check:principles P5j,
 * scripts/lib/p5b.ts): a draft version, a decision (keep or restore), a look. Every write is a new row; nothing here
 * updates or deletes. Each refuses anyone who isn't an admin, whatever its caller checked.
 */
type Sql = postgres.Sql;

function admin(fid: number) {
  if (!isAdmin(fid)) throw new Error('chapter pictures: admins only');
}

export interface NewVersion {
  jobId: string;
  chapter: number;
  model: string;
  maker: string;
  open: boolean;
  look: Look | null;
  note: string;
  prompt: string;
  recipe: PictureRecipe;
  sha256: string;
  width: number;
  height: number;
  jpeg: Buffer;
  costUsd: number | null;
}

/** A draft: private until an admin keeps it (its bytes are only here). Returns its id. */
export async function saveVersion(sql: Sql, fid: number, v: NewVersion): Promise<string> {
  admin(fid);
  const [r] = await sql<{ id: string }[]>`insert into studio.chapter_picture_versions ${sql({
    job_id: v.jobId, chapter: v.chapter, made_by_fid: fid, model: v.model, maker: v.maker, open_weights: v.open,
    look: v.look ? sql.json(v.look as never) : null, note: v.note, prompt: v.prompt, recipe: sql.json(v.recipe as never),
    sha256: v.sha256, width: v.width, height: v.height, jpeg: v.jpeg, cost_usd: v.costUsd,
  })} returning id`;
  return r.id;
}

/**
 * Which picture a chapter picture shows from now: a version (its public file already in place: publicUrl), or the
 * committed file (versionId null). "keep" the first time a version is shown, "restore" for any earlier picture.
 */
export async function saveDecision(sql: Sql, fid: number, d: { jobId: string; chapter: number; versionId: string | null; action: 'keep' | 'restore'; publicUrl: string | null; byHandle: string | null }) {
  admin(fid);
  await sql`insert into studio.chapter_picture_decisions ${sql({ job_id: d.jobId, chapter: d.chapter, version_id: d.versionId, action: d.action, public_url: d.publicUrl, by_fid: fid, by_handle: d.byHandle })}`;
}

/** Where an added picture sits (owner, 2026-11-19; 0043_chapter_picture_additions): written once, at its first draft. */
export async function saveAddition(sql: Sql, fid: number, a: { jobId: string; chapter: number; after: number; start: number; end: number }) {
  admin(fid);
  await sql`insert into studio.chapter_picture_additions ${sql({ job_id: a.jobId, chapter: a.chapter, after_idx: a.after, start_idx: a.start, end_idx: a.end, by_fid: fid })}`;
}

/** The look for every chapter (chapter null) or one chapter's own (look null clears it). */
export async function saveLook(sql: Sql, fid: number, chapter: number | null, look: Look | null) {
  admin(fid);
  await sql`insert into studio.chapter_picture_looks ${sql({ chapter, look: look ? sql.json(look as never) : null, by_fid: fid })}`;
}
