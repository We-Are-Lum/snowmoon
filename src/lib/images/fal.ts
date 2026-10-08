import 'server-only';
import { IMAGES } from '../config';

/**
 * The image model on fal.ai (decision 3): one image, fixed size and settings, the host's safety
 * checker on, prompt expansion off. Asked to keep nothing it can avoid (decision 2, on the
 * assistant's terms): sync_mode returns the bytes in the reply and stores no output file, and
 * X-Fal-Store-IO: 0 keeps no copy of the request or reply. Needs FAL_KEY.
 */
export interface Made {
  bytes: Buffer;
  contentType: string;
  seed: number | null;
  requestId: string | null;
  nsfw: boolean;
  costUsd: number;
  settings: Record<string, unknown>;
}

export class ImageUnavailable extends Error {}

export async function makeImage(prompt: string): Promise<Made> {
  const key = process.env.FAL_KEY;
  if (!key) throw new ImageUnavailable('FAL_KEY is not set');
  const settings = {
    image_size: { width: IMAGES.size.width, height: IMAGES.size.height },
    num_images: 1,
    num_inference_steps: IMAGES.steps,
    enable_safety_checker: true,
    enable_prompt_expansion: false,
    output_format: 'jpeg',
    sync_mode: true,
  };
  const res = await fetch(`https://fal.run/${IMAGES.model.endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json', 'X-Fal-Store-IO': '0' },
    body: JSON.stringify({ prompt, ...settings }),
  }).catch(() => null);
  if (!res) throw new ImageUnavailable('fal.ai did not answer');
  if (!res.ok) throw new ImageUnavailable(`fal.ai ${res.status}`);
  const j = (await res.json()) as { images?: { url?: string; content_type?: string }[]; seed?: number; has_nsfw_concepts?: boolean[] };
  const url = j.images?.[0]?.url ?? '';
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new ImageUnavailable('fal.ai sent no image');
  const mp = (IMAGES.size.width * IMAGES.size.height) / 1e6;
  return {
    bytes: Buffer.from(m[2], 'base64'),
    contentType: m[1],
    seed: typeof j.seed === 'number' ? j.seed : null,
    requestId: res.headers.get('x-fal-request-id'),
    nsfw: Boolean(j.has_nsfw_concepts?.[0]),
    costUsd: mp * IMAGES.pricePerMp,
    settings,
  };
}
