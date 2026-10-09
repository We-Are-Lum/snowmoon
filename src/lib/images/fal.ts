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

type Size = { width: number; height: number };

/** One call to fal.ai, sync mode, nothing stored: the bytes come back in the reply. */
async function call(endpoint: string, body: Record<string, unknown>, settings: Record<string, unknown>, costUsd: number): Promise<Made> {
  const key = process.env.FAL_KEY;
  if (!key) throw new ImageUnavailable('FAL_KEY is not set');
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json', 'X-Fal-Store-IO': '0' },
    body: JSON.stringify({ ...body, ...settings }),
  }).catch(() => null);
  if (!res) throw new ImageUnavailable('fal.ai did not answer');
  if (!res.ok) throw new ImageUnavailable(`fal.ai ${res.status}`);
  const j = (await res.json()) as { images?: { url?: string; content_type?: string }[]; seed?: number; has_nsfw_concepts?: boolean[] };
  const url = j.images?.[0]?.url ?? '';
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new ImageUnavailable('fal.ai sent no image');
  return {
    bytes: Buffer.from(m[2], 'base64'),
    contentType: m[1],
    seed: typeof j.seed === 'number' ? j.seed : null,
    requestId: res.headers.get('x-fal-request-id'),
    nsfw: Boolean(j.has_nsfw_concepts?.[0]),
    costUsd,
    settings,
  };
}

export async function makeImage(prompt: string, size: Size = IMAGES.size): Promise<Made> {
  const settings = {
    image_size: { width: size.width, height: size.height },
    num_images: 1,
    num_inference_steps: IMAGES.steps,
    enable_safety_checker: true,
    enable_prompt_expansion: false,
    output_format: 'jpeg',
    sync_mode: true,
  };
  return call(IMAGES.model.endpoint, { prompt }, settings, ((size.width * size.height) / 1e6) * IMAGES.pricePerMp);
}

/**
 * FLUX.2 [klein] 4B edit (step 4): the prompt and up to IMAGES.maxReferences pictures, each sent
 * as a data: URI so fal fetches nothing. Settings fixed; the safety checker on. The cost counts the
 * output and every input picture (fal's page doesn't say whether inputs count; see config).
 */
export async function makeEdit(prompt: string, references: { bytes: Buffer; contentType: string; width: number; height: number }[], size: Size = IMAGES.size): Promise<Made> {
  if (!references.length || references.length > IMAGES.maxReferences) throw new ImageUnavailable('wrong number of reference pictures');
  const settings = {
    image_size: { width: size.width, height: size.height },
    num_images: 1,
    enable_safety_checker: true,
    output_format: 'jpeg',
    sync_mode: true,
  };
  const mp = (size.width * size.height + references.reduce((n, r) => n + r.width * r.height, 0)) / 1e6;
  const image_urls = references.map((r) => `data:${r.contentType};base64,${r.bytes.toString('base64')}`);
  // The pictures themselves are not kept in the recipe's settings (they are recorded by sha256).
  const made = await call(IMAGES.editModel.endpoint, { prompt, image_urls }, settings, mp * IMAGES.editPricePerMp);
  return made;
}
