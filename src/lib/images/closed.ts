import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { CLOSED_PROVIDERS, IMAGES, type ClosedProvider } from '../config';
import { gatewayToken } from '../chat/model';
import { ImageUnavailable, type Made } from './fal';
import type { SheetModel, ViewSlot } from './sheet-models';

/**
 * A closed model's sheet view, through the Vercel AI Gateway (branch remix-model-choice, DRAFT, 2026-11-04), as the
 * bases script made them (docs/starting-sheet-drafts/bases/make-bases.mts, branch starting-sheet-drafts): GPT Image
 * 2.5 Sunburst at /v1/images/generations (the front) and /v1/images/edits (side and back, from the front), Gemini 3.1
 * Flash Image at /v1/chat/completions with image output. The provider receives the prompt and, for a side or back, the
 * front view; nothing else about the person (no user field, no FID, no IP: the call comes from our server).
 *
 * Every call asks the gateway for what it offers for that model (CLOSED_PROVIDERS[maker].gateway: no prompt training
 * for both; zero data retention for Google Vertex AI only, since the gateway offers none for OpenAI's image model; owner,
 * 2026-11-04: closed models without zero retention are allowed, with a notice), and pins the provider whose terms were
 * checked (OpenAI for GPT, Google Vertex AI for Gemini: Google's Vertex terms are the ones quoted in
 * docs/legal/remix-model-choice-draft.md). The picture comes back as a PNG at the model's own size; it is stored as the
 * site stores views (JPEG at IMAGES.viewSize, the whole picture scaled to fit and padded with its own corner colour,
 * no model), and the recipe records the conversion and the original's sha256.
 */
export const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1';
/** What the gateway is asked to do with a call's data, per maker (src/lib/config.ts CLOSED_PROVIDERS). */
export const gatewayDataFor = (maker: string) => CLOSED_PROVIDERS[maker as ClosedProvider]?.gateway ?? null;
const PIN: Record<string, string[]> = { 'openai/gpt-image-2.5-sunburst': ['openai'], 'google/gemini-3.1-flash-image': ['vertex'] };

export interface ClosedRequest {
  url: string;
  body: Record<string, unknown>;
  /** What the recipe records as the settings (the call's own options, without the prompt or the pictures). */
  settings: Record<string, unknown>;
}

/** The request for one view. `front` is the front view's JPEG for a side or back. Pure: tests run it on stand-ins. */
export function closedRequest(m: SheetModel, slot: ViewSlot, prompt: string, front: Buffer | null): ClosedRequest {
  const call = slot === 'front' ? m.front : m.views;
  if (m.open) throw new Error('not a closed model');
  if ((slot === 'front') !== (front === null)) throw new Error('a front from text; a side or back from the front');
  const data = gatewayDataFor(m.maker ?? '');
  if (!data) throw new Error(`no gateway settings for ${m.maker}`);
  const gateway = { ...data, only: PIN[call.endpoint] };
  if (!gateway.only) throw new Error(`no provider chosen for ${call.endpoint}`);
  if (m.id === 'gpt-image-2.5-sunburst') {
    const settings = { size: '1024x1536', quality: 'high', n: 1, output_format: 'png' };
    const body = { model: call.endpoint, prompt, ...settings, providerOptions: { gateway }, ...(front ? { images: [{ image_url: `data:image/jpeg;base64,${front.toString('base64')}` }] } : {}) };
    return { url: `${GATEWAY_URL}/images/${front ? 'edits' : 'generations'}`, body, settings: { ...settings, gateway } };
  }
  if (m.id === 'gemini-3.1-flash-image') {
    const settings = { modalities: ['text', 'image'], aspect_ratio: '3:4' };
    const content = [...(front ? [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${front.toString('base64')}` } }] : []), { type: 'text', text: prompt }];
    const body = { model: call.endpoint, modalities: settings.modalities, messages: [{ role: 'user', content }], providerOptions: { gateway, google: { imageConfig: { aspectRatio: '3:4' } } } };
    return { url: `${GATEWAY_URL}/chat/completions`, body, settings: { ...settings, gateway } };
  }
  throw new Error(`no request for ${m.id}`);
}

export interface ClosedPicture {
  bytes: Buffer;
  contentType: string;
  requestId: string | null;
  /** As the gateway reports it; null when it doesn't (the caller then counts the worst case). */
  costUsd: number | null;
}

/** The picture and its cost from the gateway's answer. Pure: tests run it on recorded answers. */
export function parseClosed(m: SheetModel, status: number, j: unknown): ClosedPicture {
  const b = (j ?? {}) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (status < 200 || status >= 300) throw new ImageUnavailable(`gateway ${status}`);
  const num = (x: unknown) => (x === undefined || x === null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
  if (m.id === 'gpt-image-2.5-sunburst') {
    const b64 = b.data?.[0]?.b64_json;
    if (typeof b64 !== 'string' || !b64) throw new ImageUnavailable('the gateway sent no image');
    return { bytes: Buffer.from(b64, 'base64'), contentType: 'image/png', requestId: b.providerMetadata?.gateway?.generationId ?? null, costUsd: num(b.providerMetadata?.gateway?.cost) };
  }
  const url: string = b.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? '';
  const mm = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!mm) throw new ImageUnavailable('the gateway sent no image');
  return { bytes: Buffer.from(mm[2], 'base64'), contentType: mm[1], requestId: typeof b.id === 'string' ? b.id : null, costUsd: num(b.usage?.cost ?? b.providerMetadata?.gateway?.cost) };
}

/**
 * Whether the original carries content credentials (a C2PA manifest: PNG chunk caBX, or a JUMBF box labelled c2pa).
 * Both providers sign theirs (OpenAI OpCo, LLC; Google LLC, with SynthID), and the JPEG conversion drops them, so the
 * recipe records that the original had one and that it was not kept (keeping originals: the owner's decision).
 */
export function hasC2pa(original: Buffer): boolean {
  return original.includes(Buffer.from('caBX')) || original.includes(Buffer.from('c2pa'));
}

/** The whole picture, never cropped: scaled to fit the view size and padded with its own top-left colour (no model). */
export async function toView(original: Buffer, size = IMAGES.viewSize): Promise<Buffer> {
  const { data } = await sharp(original).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  return sharp(original).resize(size.width, size.height, { fit: 'contain', background: bg }).flatten({ background: bg }).jpeg({ quality: 92 }).toBuffer();
}

/** One closed view: the call, the picture converted, its cost (the gateway's, else the worst case reserved). */
export async function makeClosed(m: SheetModel, slot: ViewSlot, prompt: string, front: Buffer | null, request: Request, worstUsd: number, send: typeof fetch = fetch): Promise<Made> {
  const token = gatewayToken(request);
  if (!token) throw new ImageUnavailable('no gateway credential');
  const r = closedRequest(m, slot, prompt, front);
  const res = await send(r.url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(r.body) }).catch(() => null);
  if (!res) throw new ImageUnavailable('the gateway did not answer');
  const pic = parseClosed(m, res.status, await res.json().catch(() => ({})));
  const jpeg = await toView(pic.bytes);
  const from = pic.contentType.split('/')[1] ?? 'png';
  return {
    bytes: jpeg,
    contentType: 'image/jpeg',
    seed: null,
    requestId: pic.requestId,
    // No safety checker result comes back: the maker's own filters run where we can't see them (recipe-lines.ts).
    nsfw: false,
    costUsd: pic.costUsd ?? worstUsd,
    settings: {
      ...r.settings,
      converted: { from, sha256: createHash('sha256').update(pic.bytes).digest('hex'), to: 'jpeg', resized_to: IMAGES.viewSize, fit: 'contain, padded with the picture\'s own corner colour' },
      content_credentials: hasC2pa(pic.bytes) ? 'the original had a C2PA manifest from its maker; the JPEG does not keep it' : 'none found in the original',
    },
  };
}
