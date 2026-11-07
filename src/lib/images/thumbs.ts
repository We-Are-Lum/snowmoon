import sharp from 'sharp';
import { THUMBS, thumbKeyFor, type ThumbWidth } from './thumb-url';

/**
 * Making the small copies (src/lib/images/thumb-url.ts says what they are and why). A plain resize with sharp, the
 * image library the site already uses for its cards: no model, no crop, no change of colour. Never wider than the
 * original (a copy is never enlarged). sharp leaves out the original's metadata unless asked to keep it, so a copy
 * carries no more than the pixels. Coding agent (Claude, by Anthropic), 2026-11-07, DRAFT for the owner.
 */
export type Thumb = { w: ThumbWidth; key: string; bytes: Buffer; width: number; height: number };

export async function makeThumbs(sha256: string, original: Buffer): Promise<Thumb[]> {
  const out: Thumb[] = [];
  for (const w of THUMBS.widths) {
    const { data, info } = await sharp(original)
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: THUMBS.quality })
      .toBuffer({ resolveWithObject: true });
    out.push({ w, key: thumbKeyFor(sha256, w), bytes: data, width: info.width, height: info.height });
  }
  return out;
}
