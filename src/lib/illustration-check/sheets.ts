import 'server-only';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getPrivate, storageReady } from '../images/store';

/**
 * The cast sheets the seeded images used as references (cast/<slug>-sheet, content/snowmoon/recipes/images/cast.json),
 * for the owner's drift grids (/you/illustrations/characters; owner, 2026-10-25). The sheets are not published: they are
 * kept in the private bucket under review/cast-sheets/ (put there by scripts/upload-cast-sheets.ts) and read only by the
 * owner-only route /api/you/illustrations/sheet/<slug>. Without storage (a local copy of the site), the file is read from
 * images-out/cast/ (gitignored) when it is there. Either way, bytes whose sha256 isn't the cast recipe's are refused.
 */
export interface CastSheet {
  slug: string;
  file: string;
  sha256: string;
  width: number;
  height: number;
}

const ROOT = process.cwd();
const CAST = path.join(ROOT, 'content', 'snowmoon', 'recipes', 'images', 'cast.json');

let sheets: Map<string, CastSheet> | null = null;

/** Every cast sheet in the cast recipe, by character slug ("zei" for cast/zei-sheet). */
export function castSheets(): Map<string, CastSheet> {
  if (sheets) return sheets;
  sheets = new Map();
  if (!existsSync(CAST)) return sheets;
  for (const im of JSON.parse(readFileSync(CAST, 'utf8')).images as { id: string; file: string; sha256: string; width: number; height: number }[]) {
    const m = /^(.+)-sheet$/.exec(im.id);
    if (m) sheets.set(m[1], { slug: m[1], file: im.file, sha256: im.sha256, width: im.width, height: im.height });
  }
  return sheets;
}

export const sheetKey = (s: CastSheet) => `review/cast-sheets/${s.file}`;

/** The sheet's bytes, from the private bucket or the local file, only if they are the recorded ones. */
export async function readSheet(slug: string): Promise<Buffer | null> {
  const s = castSheets().get(slug);
  if (!s) return null;
  const local = path.join(ROOT, 'images-out', 'cast', s.file);
  const bytes = storageReady() ? await getPrivate(sheetKey(s)) : existsSync(local) ? readFileSync(local) : null;
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== s.sha256) return null;
  return bytes;
}
