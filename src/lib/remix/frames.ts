import 'server-only';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { SYSTEM_FID } from '../config';
import { moveToPrivate, putPublic, restorePublic, storageReady } from '../images/store';
import { testFakes } from './make';

/**
 * Remix frames (studio.remix_frames, migration 0013): every generated frame, saved to its maker's
 * remix of the shot. Shown at /remix/<id> to anyone with the link, with the maker's words and name,
 * its AI label and its recipe, until it is hidden: by its maker ("Hide", undone only by them) or by
 * the maintainer (SYSTEM_FID; undone only by the maintainer). A hidden frame's public file moves to the
 * private bucket, as Pictures does (docs/removal.md).
 *
 * The local tests keep the files in REMIX_TEST_STORE instead of R2 (with REMIX_TEST_FAKES only, never
 * on Vercel), served by /api/remix/test-file/<sha256>.
 */
type Sql = postgres.Sql;

export interface Frame {
  id: string;
  adaptationId: number;
  versionId: number;
  shotId: string;
  person: number;
  ownWords: string;
  prompt: string;
  recipe: Record<string, unknown>;
  imageUrl: string;
  imageSha256: string;
  costUsd: number;
  byName: string | null;
  hidden: boolean;
  hiddenRole: 'maker' | 'maintainer' | null;
  createdAt: string;
}

const testStore = () => (testFakes() && process.env.REMIX_TEST_STORE ? process.env.REMIX_TEST_STORE : null); // never on Vercel (testFakes)
export const frameStorageReady = () => Boolean(testStore()) || storageReady();
export const isMaintainer = (person: number) => person === SYSTEM_FID;

/** A frame's bytes to the readers' bucket, served as the type it is (a GPT frame may come back as PNG). */
export async function putFrame(sha256: string, bytes: Buffer, contentType = 'image/jpeg'): Promise<string> {
  const dir = testStore();
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${sha256}.jpg`), bytes);
    return `/api/remix/test-file/${sha256}`;
  }
  return putPublic(sha256, bytes, contentType);
}
export function readTestFile(sha256: string): Buffer | null {
  const dir = testStore();
  if (!dir || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  try {
    return readFileSync(path.join(dir, `${sha256}.jpg`));
  } catch {
    return null;
  }
}
async function hideFile(sha256: string) {
  if (!testStore()) await moveToPrivate(sha256);
}
async function unhideFile(sha256: string) {
  if (!testStore()) await restorePublic(sha256);
}

const row = (r: Record<string, unknown>): Frame => ({
  id: String(r.id),
  adaptationId: Number(r.adaptation_id),
  versionId: Number(r.version_id),
  shotId: String(r.shot_id),
  person: Number(r.person),
  ownWords: String(r.own_words),
  prompt: String(r.prompt),
  recipe: r.recipe as Record<string, unknown>,
  imageUrl: String(r.image_url),
  imageSha256: String(r.image_sha256),
  costUsd: Number(r.cost_usd),
  byName: (r.by_name as string | null) ?? null,
  hidden: Boolean(r.hidden),
  hiddenRole: (r.hidden_role as Frame['hiddenRole']) ?? null,
  createdAt: new Date(r.created_at as string).toISOString(),
});

export async function saveFrame(sql: Sql, f: Omit<Frame, 'id' | 'hidden' | 'hiddenRole' | 'createdAt'>): Promise<Frame> {
  const [r] = await sql`insert into studio.remix_frames ${sql({
    adaptation_id: f.adaptationId,
    version_id: f.versionId,
    shot_id: f.shotId,
    person: f.person,
    own_words: f.ownWords,
    prompt: f.prompt,
    recipe: sql.json(f.recipe as never),
    image_url: f.imageUrl,
    image_sha256: f.imageSha256,
    cost_usd: Number(f.costUsd.toFixed(4)),
    by_name: f.byName,
  })} returning *`;
  return row(r);
}

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

export async function frameById(sql: Sql, id: string): Promise<Frame | null> {
  if (!isId(id)) return null;
  const [r] = await sql`select * from studio.remix_frames where id = ${id}`;
  return r ? row(r) : null;
}

/** A person's own frames for one shot of one version, newest first (their own hidden ones too, marked). */
export async function myFrames(sql: Sql, person: number, versionId: number, shotId: string): Promise<Frame[]> {
  const rs = await sql`select * from studio.remix_frames where person = ${person} and version_id = ${versionId} and shot_id = ${shotId} order by created_at desc limit 60`;
  return rs.map(row);
}

/** Every frame of a person's, newest first (their "My remixes"). */
export async function allMyFrames(sql: Sql, person: number): Promise<Frame[]> {
  const rs = await sql`select * from studio.remix_frames where person = ${person} order by created_at desc limit 200`;
  return rs.map(row);
}

/**
 * Hide or unhide. The maker hides their own; the maintainer hides anything. A maker's hide is undone
 * by the maker; a maintainer's only by the maintainer.
 */
export async function setHidden(sql: Sql, person: number, id: string, hide: boolean): Promise<{ ok: true; frame: Frame } | { ok: false; status: number; error: string }> {
  const f = await frameById(sql, id);
  if (!f) return { ok: false, status: 404, error: 'No such frame' };
  const maker = f.person === person;
  const maint = isMaintainer(person);
  if (!maker && !maint) return { ok: false, status: 403, error: 'Only the person who made this frame can hide it.' };
  if (hide) {
    if (f.hidden) return { ok: true, frame: f };
    const role = maker ? 'maker' : 'maintainer';
    const [r] = await sql`update studio.remix_frames set hidden = true, hidden_by = ${person}, hidden_role = ${role}, hidden_at = now() where id = ${id} returning *`;
    await hideFile(f.imageSha256);
    return { ok: true, frame: row(r) };
  }
  if (!f.hidden) return { ok: true, frame: f };
  if (f.hiddenRole === 'maintainer' && !maint) return { ok: false, status: 403, error: 'This was hidden by the maintainer; only the maintainer can bring it back.' };
  if (f.hiddenRole === 'maker' && !maker) return { ok: false, status: 403, error: 'Only its maker can bring this back.' };
  await unhideFile(f.imageSha256);
  const [r] = await sql`update studio.remix_frames set hidden = false, hidden_by = null, hidden_role = null, hidden_at = null where id = ${id} returning *`;
  return { ok: true, frame: row(r) };
}
