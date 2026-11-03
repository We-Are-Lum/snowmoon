import 'server-only';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { moveToPrivate, putPublic, restorePublic, storageReady } from '../images/store';
import { testFakes } from './make';

/**
 * Remix frames (studio.remix_frames, migration 0013): every generated frame, saved to its maker's
 * remix of the shot. Shown at /remix/<id> to anyone with the link, with the maker's words and name,
 * its AI label and its recipe, until it is hidden: by its maker ("Hide", undone only by them) or by
 * an admin (src/lib/admins.ts; undone only by an admin). A hidden frame's public file moves to the
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

export async function putFrame(sha256: string, bytes: Buffer): Promise<string> {
  const dir = testStore();
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${sha256}.jpg`), bytes);
    return `/api/remix/test-file/${sha256}`;
  }
  return putPublic(sha256, bytes, 'image/jpeg');
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
export async function hideFile(sha256: string) {
  if (!testStore()) await moveToPrivate(sha256);
}
export async function unhideFile(sha256: string) {
  if (!testStore()) await restorePublic(sha256);
}

const rowOf = (r: Record<string, unknown>): Frame => ({
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
  return rowOf(r);
}

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

export async function frameById(sql: Sql, id: string): Promise<Frame | null> {
  if (!isId(id)) return null;
  const [r] = await sql`select * from studio.remix_frames where id = ${id}`;
  return r ? rowOf(r) : null;
}

/** A person's own frames for one shot of one version, newest first (their own hidden ones too, marked). */
export async function myFrames(sql: Sql, person: number, versionId: number, shotId: string): Promise<Frame[]> {
  const rs = await sql`select * from studio.remix_frames where person = ${person} and version_id = ${versionId} and shot_id = ${shotId} order by created_at desc limit 60`;
  return rs.map(rowOf);
}

/** Every frame of a person's, newest first (their "My remixes"). */
export async function allMyFrames(sql: Sql, person: number): Promise<Frame[]> {
  const rs = await sql`select * from studio.remix_frames where person = ${person} order by created_at desc limit 200`;
  return rs.map(rowOf);
}

/** A person's frames that are shown (not hidden), newest first: for their public profile, /@<handle> (owner, 2026-10-18). */
export async function shownFramesBy(sql: Sql, person: number, limit = 60): Promise<Frame[]> {
  const rs = await sql`select * from studio.remix_frames where person = ${person} and not hidden order by created_at desc limit ${limit}`;
  return rs.map(rowOf);
}

export const frameRow = (r: Record<string, unknown>): Frame => rowOf(r);
