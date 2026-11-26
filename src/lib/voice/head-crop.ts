import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

/**
 * The face from a look's front view (Nate, 2026-11-24: "When the person describes clothes, send only the face from the
 * look (a head crop), not the full figure"): a published sheet's front view is a whole figure standing, centred, head at
 * the top. A fixed box takes the head and shoulders: the middle half of the width, from the top, as tall as it is wide
 * (at most a third of the height). No model: a rule, recorded in the recipe with the box and the sheet picture it came from.
 */
export const HEAD_CROP = { left: 0.25, width: 0.5, top: 0.02, maxHeight: 0.33 } as const;

export async function headCrop(front: Buffer): Promise<{ bytes: Buffer; sha256: string; box: { left: number; top: number; width: number; height: number } }> {
  const meta = await sharp(front).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error('not a picture');
  const width = Math.max(1, Math.round(W * HEAD_CROP.width));
  const left = Math.round(W * HEAD_CROP.left);
  const top = Math.round(H * HEAD_CROP.top);
  const height = Math.max(1, Math.min(width, Math.round(H * HEAD_CROP.maxHeight), H - top));
  const bytes = await sharp(front).extract({ left, top, width, height }).png().toBuffer();
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), box: { left, top, width, height } };
}
