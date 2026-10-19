import 'server-only';
import { gatewayToken } from '../chat/model';
import { REMIX_GPT } from '../remix/model';
import { ImageUnavailable, type Made } from './fal';
import { storedJpeg } from './stored-jpeg';

/**
 * GPT Image 2.5 Sunburst (OpenAI, a closed model) through Vercel AI Gateway's /v1/images/edits, as the GPT cut was
 * made (adaptations/fifteen-days/preprod/gpt/gpt.mjs): the prompt and the pictures as data: URIs, one picture back.
 * Only Remix calls it, and only with REMIX_MODEL = 'gpt' (src/lib/remix/model.ts; off until the owner's reread of
 * docs/legal/remix-gpt-draft.md). Authentication is the site's existing gateway credential (gatewayToken: the
 * project's OIDC token on Vercel, as the prompt check uses); no new key or environment variable. Nothing that
 * identifies the person is sent. The cost is the one the gateway reports for the call.
 *
 * The owner-approved test without ZDR (2026-10-19, as a script) took all four pictures and ignored output_format: a PNG
 * came back. The picture is stored as a JPEG converted on our server (src/lib/images/stored-jpeg.ts), the PNG is kept
 * in the private bucket, and the recipe records both sha256s. How a moderation refusal looks is still to confirm.
 */
type Ref = { bytes: Buffer; contentType: string; width: number; height: number };

export async function makeGptEdit(prompt: string, references: Ref[], request: Request, max = 4): Promise<Made> {
  if (!references.length || references.length > max) throw new ImageUnavailable('wrong number of reference pictures');
  const token = gatewayToken(request);
  if (!token) throw new ImageUnavailable('no gateway credential');
  const size = `${REMIX_GPT.size.width}x${REMIX_GPT.size.height}`;
  // No zeroDataRetention here, on purpose. The owner asked for it (2026-10-18, decision 2c), and the one test call sent
  // with it was refused by the gateway: HTTP 400, type "no_zdr_providers_available", "openai/gpt-image-2.5-sunburst is
  // ineligible for Zero Data Retention (ZDR). This model retains data and cannot be used with ZDR configurations."
  // ($0, no provider attempted). With it, every call would be refused. What OpenAI keeps is said in the Privacy draft
  // (docs/legal/remix-gpt-draft.md) instead.
  const settings = { model: REMIX_GPT.model.endpoint, n: 1, size, output_format: REMIX_GPT.outputFormat };
  const res = await fetch(REMIX_GPT.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...settings, prompt, images: references.map((r) => ({ image_url: `data:${r.contentType};base64,${r.bytes.toString('base64')}` })) }),
  }).catch(() => null);
  if (!res) throw new ImageUnavailable('the gateway did not answer');
  const text = await res.text();
  let body: { data?: { b64_json?: string }[]; providerMetadata?: { gateway?: { cost?: string; generationId?: string } }; error?: { code?: string; type?: string; message?: string } } = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  // OpenAI's own moderation refuses the request: treated as the safety checker's flag (the frame is dropped, nothing kept).
  if (!res.ok && /moderation|safety/i.test(`${body.error?.code ?? ''} ${body.error?.type ?? ''}`)) {
    return { bytes: Buffer.alloc(0), contentType: 'image/jpeg', seed: null, requestId: null, nsfw: true, costUsd: Number(body.providerMetadata?.gateway?.cost ?? 0), settings };
  }
  if (!res.ok) throw new ImageUnavailable(`the gateway ${res.status}`);
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new ImageUnavailable('the gateway sent no image');
  const stored = await storedJpeg(Buffer.from(b64, 'base64'));
  if (!stored) throw new ImageUnavailable('the gateway sent an unknown picture format');
  return {
    bytes: stored.bytes,
    contentType: stored.contentType,
    modelOutput: stored.modelOutput,
    original: stored.original,
    seed: null,
    requestId: body.providerMetadata?.gateway?.generationId ?? null,
    nsfw: false,
    costUsd: Number(body.providerMetadata?.gateway?.cost ?? 0),
    settings: { ...settings, host: REMIX_GPT.model.host, safety: "OpenAI's own moderation (the request is refused if flagged)" },
  };
}
