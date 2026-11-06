import 'server-only';
import { createHash } from 'node:crypto';

/**
 * A published picture sent to the edit model as a reference (a picked sheet's view at Generate; a remix's source
 * front view, owner 2026-11-04), fetched from the readers' own public bucket (R2_IMAGES_PUBLIC_URL, ours) and checked
 * against its sha256. Any other address is refused: nothing is fetched from anywhere else.
 */
export async function referencePicture(url: string, sha256: string): Promise<Buffer | null> {
  const base = process.env.R2_IMAGES_PUBLIC_URL?.replace(/\/$/, '');
  if (!base || !url.startsWith(`${base}/`)) return null;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  return createHash('sha256').update(bytes).digest('hex') === sha256 ? bytes : null;
}
