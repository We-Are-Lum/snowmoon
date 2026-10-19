import { createHash } from 'node:crypto';
import sharp from 'sharp';

/**
 * A GPT Image remix frame as the readers' bucket stores it: a JPEG, converted on our server (owner, 2026-10-19: "JPEG
 * for GPT Remix frames: yes, converted on our server, with the recipe recording both the original PNG's sha256 and
 * the stored JPEG's"). The gateway ignores output_format and sends a PNG (the test call of 2026-10-19: a 1,535,122-byte
 * PNG for output_format "jpeg").
 *
 * What the model sent is recorded as model_output (its type, size and sha256); the stored JPEG's sha256 is the recipe's
 * output_sha256 and the frame's image_sha256, as for every other frame. The PNG itself is kept in the private bucket
 * only, under a key named by its sha256 (owner, 2026-10-19: "Keep the original PNGs privately in R2. Delete a PNG
 * whenever its frame is deleted"; putFrameFiles in src/lib/remix/frames.ts), and model_output records that key, never
 * a URL. A JPEG from the model is stored as sent, unconverted, so its two sha256s are the same and nothing else is kept.
 *
 * Plain module (no 'server-only'), so scripts/test-gpt-jpeg.ts can run it.
 */
export const STORED_JPEG = { quality: 90, mozjpeg: true } as const;

export interface ModelOutput {
  content_type: string;
  sha256: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  /** How it became the stored JPEG; null when the model's own JPEG is stored as sent. */
  converted: string | null;
  /** True once the original is in the private bucket; private_key is its key there (never a URL). */
  kept: boolean;
  private_key: string | null;
}

export interface Stored {
  bytes: Buffer;
  contentType: 'image/jpeg';
  modelOutput: ModelOutput;
  /** The model's PNG, to keep privately; absent when the model's JPEG is stored as sent. */
  original?: Buffer;
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
const isPng = (b: Buffer) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47;

/** Null when the bytes are neither PNG nor JPEG (the caller refuses the frame). */
export async function storedJpeg(bytes: Buffer): Promise<Stored | null> {
  const png = isPng(bytes);
  if (!png && !isJpeg(bytes)) return null;
  const meta = await sharp(bytes).metadata().catch(() => null);
  if (!meta) return null;
  const modelOutput = (converted: string | null): ModelOutput => ({
    content_type: png ? 'image/png' : 'image/jpeg',
    sha256: sha(bytes),
    size_bytes: bytes.length,
    width: meta.width ?? null,
    height: meta.height ?? null,
    converted,
    kept: false,
    private_key: null,
  });
  if (!png) return { bytes, contentType: 'image/jpeg', modelOutput: modelOutput(null) };
  // Flattened onto black in case the PNG has an alpha channel; no metadata is copied (sharp's default).
  const jpeg = await sharp(bytes).flatten({ background: '#000000' }).jpeg(STORED_JPEG).toBuffer();
  return {
    bytes: jpeg,
    contentType: 'image/jpeg',
    modelOutput: modelOutput(`to JPEG on our server (sharp, quality ${STORED_JPEG.quality}, mozjpeg)`),
    original: bytes,
  };
}

/**
 * The picture fields of a remix frame's recipe: the stored picture's type and sha256 (output_sha256, which is also the
 * frame's image_sha256) and, for a converted one, model_output with what the model sent and its own sha256.
 */
export function outputRecord(made: { bytes: Buffer; contentType: string; modelOutput?: ModelOutput }) {
  return { content_type: made.contentType, output_sha256: sha(made.bytes), ...(made.modelOutput ? { model_output: made.modelOutput } : {}) };
}
