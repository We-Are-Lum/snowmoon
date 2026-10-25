import 'server-only';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { AGENTS } from '../config';
import { getPrivate, putPrivate, storageReady } from '../images/store';
import { ToolInputError } from '../agent/tools';
import { sha256 } from './core';

/**
 * A brought-in image (owner, 2026-10-20; design §6; research: docs/agents/research-scanning.md).
 * Order, every time:
 *   1. the bytes are decoded in memory only (PNG or JPEG, at most 3 MB, about 16:9);
 *   2. the scan, BEFORE anything is stored; a scanner that can't answer fails closed;
 *   3. re-encoded as JPEG at most 1920 wide, which drops every piece of metadata (location included);
 *   4. stored in the private bucket only (a test folder in the local tests).
 * AGENTS.scanner 'none' (the default) means bringing in images is closed. 'test' exists only off Vercel:
 * a stand-in that matches only the test's own planted hashes, so the refusal path can be proved.
 */
export class ScanMatch extends Error {}

const testStore = () => (process.env.VERCEL ? null : process.env.AGENTS_TEST_STORE ?? null);
export const imagesOpen = () => {
  if (AGENTS.scanner === 'none' && !(process.env.AGENTS_TEST_SCANNER && !process.env.VERCEL)) return false;
  return Boolean(testStore()) || storageReady();
};

type Scan = { ok: true; by: string } | { ok: false; match: boolean; by: string };

async function scan(bytes: Buffer): Promise<Scan> {
  const test = process.env.VERCEL ? null : process.env.AGENTS_TEST_SCANNER;
  if (test) {
    // The local stand-in: "known" material is a list of sha256s the test plants. It is labelled as a stand-in everywhere.
    const known = test.split(',').map((s) => s.trim()).filter((s) => /^[0-9a-f]{64}$/.test(s));
    return known.includes(sha256(bytes)) ? { ok: false, match: true, by: 'test stand-in (not a real scan)' } : { ok: true, by: 'test stand-in (not a real scan)' };
  }
  // A real vendor is wired here once chosen (decision D1): Arachnid Shield and/or PhotoDNA, bytes in memory, fail closed.
  return { ok: false, match: false, by: 'no scanner configured' };
}

export interface Declared {
  prompt: string;
  model: { name: string; maker: string; weights: 'open' | 'closed' | 'unknown'; version?: string; ran_on?: string };
  inputs: { sha256: string; what?: string }[];
  seed?: string | number | null;
  settings?: Record<string, unknown>;
  made_at?: string;
}

export interface Checked {
  format: string;
  width: number;
  height: number;
  received_sha256: string;
  stored_sha256: string;
  metadata_removed: true;
  scanned_by: string;
  inputs_ours: { sha256: string; ours: boolean }[];
}

export async function bringIn(base64: string, declared: Declared, ourInputs: Set<string>): Promise<{ key: string; sha256: string; checked: Checked }> {
  if (!imagesOpen()) throw new ToolInputError('Bringing in images isn’t open yet: it opens once every image can be scanned before it is stored.');
  const raw = Buffer.from(base64.replace(/^data:image\/(png|jpeg);base64,/, ''), 'base64');
  if (!raw.length || raw.length > AGENTS.image.maxBytes) throw new ToolInputError(`the image must be at most ${AGENTS.image.maxBytes / 1024 / 1024} MB`);
  let meta;
  try {
    meta = await sharp(raw, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new ToolInputError('that isn’t a PNG or JPEG we can read');
  }
  if (meta.format !== 'png' && meta.format !== 'jpeg') throw new ToolInputError('PNG or JPEG only');
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h || Math.abs(w / h - AGENTS.image.aspect) / AGENTS.image.aspect > AGENTS.image.aspectTolerance) throw new ToolInputError('the image must be 16:9');
  const verdict = await scan(raw);
  if (!verdict.ok) {
    if (verdict.match) throw new ScanMatch('matched known material');
    throw new ToolInputError('The safety scan couldn’t run, so nothing was kept. Try again later.');
  }
  const jpeg = await sharp(raw).rotate().resize({ width: Math.min(w, AGENTS.image.maxSide), withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const stored = sha256(jpeg);
  const key = `brought-in/${stored.slice(0, 32)}.jpg`;
  const dir = testStore();
  if (dir) {
    mkdirSync(path.join(dir, 'brought-in'), { recursive: true });
    writeFileSync(path.join(dir, key), jpeg);
  } else {
    await putPrivate(key, jpeg, 'image/jpeg');
  }
  const out = await sharp(jpeg).metadata();
  return {
    key,
    sha256: stored,
    checked: {
      format: meta.format, width: out.width ?? 0, height: out.height ?? 0, received_sha256: sha256(raw), stored_sha256: stored,
      metadata_removed: true, scanned_by: verdict.by,
      inputs_ours: declared.inputs.map((i) => ({ sha256: i.sha256, ours: ourInputs.has(i.sha256) })),
    },
  };
}

/** What an approved edit made (a frame or a video): kept privately, like a brought-in image, until kept and published. */
export async function storeMade(bytes: Buffer, ext: 'jpg' | 'mp4'): Promise<string> {
  const key = `made/${sha256(bytes).slice(0, 32)}.${ext}`;
  const dir = testStore();
  if (dir) {
    mkdirSync(path.join(dir, 'made'), { recursive: true });
    writeFileSync(path.join(dir, key), bytes);
  } else {
    await putPrivate(key, bytes, ext === 'jpg' ? 'image/jpeg' : 'video/mp4');
  }
  return key;
}

/** A made file's bytes read back from where storeMade put it (the test folder, or the private bucket), or null. */
export async function readMade(key: string): Promise<Buffer | null> {
  const dir = testStore();
  if (dir) {
    const f = path.join(dir, key);
    return existsSync(f) ? readFileSync(f) : null;
  }
  return getPrivate(key);
}

export const contentTypeOf = (key: string) => (key.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');

export async function readImage(key: string): Promise<Buffer | null> {
  if (!/^(brought-in|made)\/[0-9a-f]{32}\.(jpg|mp4)$/.test(key)) return null;
  const dir = testStore();
  if (dir) return existsSync(path.join(dir, key)) ? readFileSync(path.join(dir, key)) : null;
  return await getPrivate(key);
}
