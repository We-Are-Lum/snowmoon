/**
 * The shared path for batch jobs that call a closed image model (CLAUDE.md: batch jobs go only through the Vercel AI
 * Gateway, never the site's own keys). Owner, 2026-11-04 (second decision of the day): every closed call sets
 * disallowPromptTraining and pins its provider, Google's models to Vertex AI (`only: ['vertex']`), OpenAI's to OpenAI
 * (`only: ['openai']`). Zero data retention is required for Google on Vertex only. OpenAI is allowed without it, for
 * bases and styles the owner makes, after the gateway's endpoint list (a free GET) has been read, and the retention that
 * applied is recorded in the picture's settings (so in its recipe and the ledger).
 *
 * The gateway key is read from AI_GATEWAY_API_KEY and never printed. Tests: scripts/test-batch-model.ts.
 */
export type ClosedImageModel = 'gemini-3.1-flash-image' | 'gpt-image-2.5-sunburst';

export const CLOSED_IMAGE_MODELS: Record<ClosedImageModel, { slug: string; maker: 'Google' | 'OpenAI'; provider: 'vertex' | 'openai'; requireZdr: boolean; worstUsd: number }> = {
  'gemini-3.1-flash-image': { slug: 'google/gemini-3.1-flash-image', maker: 'Google', provider: 'vertex', requireZdr: true, worstUsd: 0.09 },
  'gpt-image-2.5-sunburst': { slug: 'openai/gpt-image-2.5-sunburst', maker: 'OpenAI', provider: 'openai', requireZdr: false, worstUsd: 0.08 },
};

/**
 * What OpenAI keeps when a call has no zero data retention, word for word from its API data page
 * (https://developers.openai.com/api/docs/guides/your-data, read 2026-11-03; re-check before relying on it later).
 */
export const OPENAI_DEFAULT_RETENTION = {
  quote: 'By default, abuse monitoring logs are generated for all API feature usage and retained for up to 30 days, unless longer retention is required by law, or is reasonably necessary to protect our services or any third party from harm.',
  images_row: '/v1/images/edits: abuse monitoring retention 30 days, application state retention none',
  source: 'https://developers.openai.com/api/docs/guides/your-data',
  read: '2026-11-03',
} as const;

const GATEWAY = 'https://ai-gateway.vercel.sh/v1';

/** The gateway options every closed call carries. */
export function gatewayOptions(model: ClosedImageModel): { only: string[]; disallowPromptTraining: true; zeroDataRetention?: true } {
  const m = CLOSED_IMAGE_MODELS[model];
  return m.requireZdr ? { only: [m.provider], zeroDataRetention: true, disallowPromptTraining: true } : { only: [m.provider], disallowPromptTraining: true };
}

/** Throws unless a request body carries the required gateway options for its model. Run on every body before it is sent. */
export function assertGatewayOptions(model: ClosedImageModel, body: { providerOptions?: { gateway?: Record<string, unknown> } }): void {
  const g = body.providerOptions?.gateway ?? {};
  const m = CLOSED_IMAGE_MODELS[model];
  if (m.requireZdr && g.zeroDataRetention !== true) throw new Error(`${model}: zeroDataRetention is not set (required for ${m.maker} on ${m.provider})`);
  if (g.disallowPromptTraining !== true) throw new Error(`${model}: disallowPromptTraining is not set`);
  if (!Array.isArray(g.only) || g.only.length !== 1 || g.only[0] !== m.provider) throw new Error(`${model}: only must be ['${m.provider}']`);
}

type Fetch = typeof fetch;

/** The retention that applies to a call, as recorded in its settings (recipe) and the ledger. */
export interface Retention { provider: string; zero_data_retention: boolean; no_training: boolean; endpoint_list_read_at: string; kept?: typeof OPENAI_DEFAULT_RETENTION }

/**
 * The gateway's endpoint list for the model (no cost). The pinned provider must promise no training, and, where the
 * model requires it (Google on Vertex), zero data retention. Returns the refusal (null when the call may go ahead) and
 * the retention to record.
 */
export async function retentionCheck(model: ClosedImageModel, f: Fetch = fetch, now: () => Date = () => new Date()): Promise<{ refusal: string | null; retention: Retention | null }> {
  const m = CLOSED_IMAGE_MODELS[model];
  const res = await f(`${GATEWAY}/models/${m.slug}/endpoints`);
  if (!res.ok) return { refusal: `${model}: the gateway's endpoint list answered ${res.status}; not calling`, retention: null };
  const body = (await res.json()) as { data?: { endpoints?: { provider_name?: string; tag?: string; has_zdr?: boolean; has_no_training?: boolean }[] } };
  const eps = body.data?.endpoints ?? [];
  const e = eps.find((x) => (x.tag ?? x.provider_name) === m.provider || x.provider_name === m.provider);
  if (!e) return { refusal: `${model}: the gateway lists no ${m.provider} endpoint; not calling`, retention: null };
  if (e.has_no_training !== true) return { refusal: `${model}: the gateway's ${m.provider} endpoint doesn't promise no training; not calling`, retention: null };
  if (m.requireZdr && e.has_zdr !== true) return { refusal: `${model}: the gateway's ${m.provider} endpoint has no zero data retention (has_zdr ${String(e.has_zdr)}); not calling`, retention: null };
  const zdr = m.requireZdr; // a ZDR call only where it is required and the endpoint has it; otherwise the provider's default applies
  if (!zdr && m.provider !== 'openai') return { refusal: `${model}: no recorded retention terms for ${m.provider} without ZDR; not calling`, retention: null };
  return { refusal: null, retention: { provider: m.provider, zero_data_retention: zdr, no_training: true, endpoint_list_read_at: now().toISOString(), ...(zdr ? {} : { kept: OPENAI_DEFAULT_RETENTION }) } };
}

/** The refusal alone (scripts that check before their prompt check). */
export async function retentionRefusal(model: ClosedImageModel, f: Fetch = fetch): Promise<string | null> {
  return (await retentionCheck(model, f)).refusal;
}

/** GPT Image 2.5 Sunburst from text alone: the reserve stays $0.08 (the drafts' edits, with a picture in, cost $0.0467). */
/**
 * Worst case for a Gemini picture made from text alone (a style sample): the gateway's list price, $0.067 per 1K image,
 * plus its input tokens at $0.50 per million (a 600-character prompt is a few hundred) and a margin: $0.075. With a
 * reference picture the reserve stays CLOSED_IMAGE_MODELS' $0.09.
 */
export const GEMINI_TEXT_WORST_USD = 0.075;

/**
 * The request for one picture: from a reference picture (a sheet's front) or, with `ref` null, from text alone (a style
 * sample, `aspect` e.g. '16:9'; Gemini only). Pure: nothing is sent.
 */
export function closedImageRequest(model: ClosedImageModel, prompt: string, ref: { bytes: Buffer; contentType: string } | null, aspect = '3:4') {
  const m = CLOSED_IMAGE_MODELS[model];
  const gateway = gatewayOptions(model);
  if (!ref) {
    if (model === 'gpt-image-2.5-sunburst') {
      const settings = { size: aspect === '16:9' ? '1536x1024' : '1024x1536', quality: 'high', n: 1, output_format: 'png' };
      const body = { model: m.slug, prompt, ...settings, providerOptions: { gateway } };
      assertGatewayOptions(model, body);
      return { url: `${GATEWAY}/images/generations`, body, settings: { ...settings, gateway } };
    }
    const settings = { modalities: ['text', 'image'], aspect_ratio: aspect };
    const body = { model: m.slug, modalities: settings.modalities, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      providerOptions: { gateway, google: { imageConfig: { aspectRatio: aspect } } } };
    assertGatewayOptions(model, body);
    return { url: `${GATEWAY}/chat/completions`, body, settings: { ...settings, gateway } };
  }
  const dataUrl = `data:${ref.contentType};base64,${ref.bytes.toString('base64')}`;
  if (model === 'gpt-image-2.5-sunburst') {
    // Landscape (branch closed-lettering, 2026-11-18): `aspect` '3:2' or '16:9' asks for 1536 x 1024, as the challenge's
    // closed pictures are made (src/lib/images/closed.ts challengeClosedRequest); anything else stays portrait, as before.
    const settings = { size: aspect === '3:2' || aspect === '16:9' ? '1536x1024' : '1024x1536', quality: 'high', n: 1, output_format: 'png' };
    const body = { model: m.slug, prompt, images: [{ image_url: dataUrl }], ...settings, providerOptions: { gateway } };
    assertGatewayOptions(model, body);
    return { url: `${GATEWAY}/images/edits`, body, settings: { ...settings, gateway } };
  }
  const settings = { modalities: ['text', 'image'], aspect_ratio: '3:4' };
  const body = {
    model: m.slug, modalities: settings.modalities,
    messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: prompt }] }],
    providerOptions: { gateway, google: { imageConfig: { aspectRatio: '3:4' } } },
  };
  assertGatewayOptions(model, body);
  return { url: `${GATEWAY}/chat/completions`, body, settings: { ...settings, gateway } };
}

export interface ClosedMade { bytes: Buffer; contentType: string; requestId: string | null; costUsd: number; settings: Record<string, unknown>; meta: Record<string, unknown> }

/** Makes one picture. Refuses (throws, nothing sent) unless the pinned provider offers ZDR and no training. */
export async function closedImage(model: ClosedImageModel, prompt: string, ref: { bytes: Buffer; contentType: string } | null, opts: { key?: string; fetch?: Fetch; aspect?: string } = {}): Promise<ClosedMade> {
  const f = opts.fetch ?? fetch;
  const key = opts.key ?? process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error('no AI_GATEWAY_API_KEY');
  const { refusal, retention } = await retentionCheck(model, f);
  if (refusal || !retention) throw new Error(refusal ?? `${model}: no retention recorded; not calling`);
  const m = CLOSED_IMAGE_MODELS[model];
  const req = closedImageRequest(model, prompt, ref, opts.aspect);
  const res = await f(req.url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
  const body = (await res.json().catch(() => ({}))) as any;
  if (model === 'gpt-image-2.5-sunburst') {
    if (!res.ok || !body.data?.[0]?.b64_json) throw new Error(`${model} ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
    const meta = { ...body, data: undefined };
    return { bytes: Buffer.from(body.data[0].b64_json, 'base64'), contentType: 'image/png', requestId: meta.providerMetadata?.gateway?.generationId ?? null,
      costUsd: Number(meta.providerMetadata?.gateway?.cost ?? m.worstUsd), settings: { ...req.settings, retention }, meta };
  }
  const url: string = body.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? '';
  const mm = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!res.ok || !mm) throw new Error(`${model} ${res.status} ${JSON.stringify({ ...body, choices: body.choices?.map((c: any) => ({ ...c, message: { ...c.message, images: undefined } })) }).slice(0, 400)}`);
  const cost = Number(body.usage?.cost ?? body.providerMetadata?.gateway?.cost ?? NaN);
  const meta = { id: body.id, model: body.model, usage: body.usage, provider_metadata: body.choices?.[0]?.message?.provider_metadata ?? body.providerMetadata ?? null };
  return { bytes: Buffer.from(mm[2], 'base64'), contentType: mm[1], requestId: body.id ?? null, costUsd: Number.isFinite(cost) ? cost : m.worstUsd, settings: { ...req.settings, retention }, meta };
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading text in a picture (branch closed-lettering, 2026-11-18; decision C's read-back test). A vision model through
// the gateway, pinned to one provider, with zero data retention and no prompt training, both required and both checked
// on the gateway's endpoint list (a free GET) before anything is sent. The reader receives only the picture and a fixed
// instruction, never the words that were asked for: it reads blind, and the comparison is made in code.
// Prices: USD per token from https://ai-gateway.vercel.sh/v1/models/<id>/endpoints (read 2026-11-18). imageTokens is the
// assumption of scripts/check-illustrations.ts (OpenAI: 85 + 170 per 512-px tile = 1,105; Gemini: 1,120), used only for
// the worst case reserved before a call; the gateway's reported cost is what is counted afterwards.
// ---------------------------------------------------------------------------------------------------------------------

export type TextReader = 'openai/gpt-6.1-sol' | 'openai/gpt-6-luna' | 'google/gemini-3.8-flash';

export const TEXT_READERS: Record<TextReader, { name: string; maker: 'OpenAI' | 'Google'; provider: 'openai' | 'vertex'; input: number; output: number; imageTokens: number; effort: string }> = {
  'openai/gpt-6.1-sol': { name: 'GPT-6.1 Sol', maker: 'OpenAI', provider: 'openai', input: 2e-6, output: 10e-6, imageTokens: 1105, effort: 'low' },
  'openai/gpt-6-luna': { name: 'GPT-6 Luna', maker: 'OpenAI', provider: 'openai', input: 0.1e-6, output: 0.5e-6, imageTokens: 1105, effort: 'low' },
  'google/gemini-3.8-flash': { name: 'Gemini 3.8 Flash', maker: 'Google', provider: 'vertex', input: 0.75e-6, output: 3.75e-6, imageTokens: 1120, effort: 'low' },
};

/** The fixed instruction (DRAFT, coding agent). It never contains the words asked for. */
export const READ_TEXT_INSTRUCTION = [
  'You transcribe writing in pictures. List every piece of visible writing in the picture (a sign, a banner, a label, a caption, a printed or painted word), exactly as drawn: the same letters, capitals, spelling and punctuation, even where it is misspelled, oddly spaced or partly cut off. Never correct, complete or guess at a word you cannot see; transcribe only what is there.',
  'Give one entry per separate piece of writing, in reading order. Join the lines of one piece with a single space. Set cut_off to true for a piece that runs off an edge of the picture. If there is no writing at all, return an empty list.',
].join('\n\n');

const READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['texts'],
  properties: { texts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'cut_off'], properties: { text: { type: 'string' }, cut_off: { type: 'boolean' } } } } },
} as const;

export const READ_MAX_TOKENS = 1500;

/** The most one read can cost: the picture, the instruction and every allowed output token, at the published price. */
export function readWorstUsd(reader: TextReader): number {
  const r = TEXT_READERS[reader];
  return (r.imageTokens + READ_TEXT_INSTRUCTION.length / 3 + 100) * r.input + READ_MAX_TOKENS * r.output;
}

/** The gateway options every read carries: one provider, zero data retention, no prompt training. */
export function readerGateway(reader: TextReader) {
  return { only: [TEXT_READERS[reader].provider], zeroDataRetention: true as const, disallowPromptTraining: true as const };
}

/** The request for one read. Pure: nothing is sent. */
export function readTextRequest(reader: TextReader, image: { bytes: Buffer; contentType: string }) {
  const r = TEXT_READERS[reader];
  const body = {
    model: reader,
    temperature: 0,
    max_tokens: READ_MAX_TOKENS,
    reasoning: { effort: r.effort },
    response_format: { type: 'json_schema', json_schema: { name: 'writing', strict: true, schema: READ_SCHEMA } },
    messages: [
      { role: 'system', content: READ_TEXT_INSTRUCTION },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${image.contentType};base64,${image.bytes.toString('base64')}`, detail: 'high' } }, { type: 'text', text: 'Transcribe the writing in this picture.' }] },
    ],
    providerOptions: { gateway: readerGateway(reader) },
  };
  const g = body.providerOptions.gateway;
  if (g.zeroDataRetention !== true || g.disallowPromptTraining !== true || g.only.length !== 1) throw new Error(`${reader}: gateway options missing`);
  return { url: `${GATEWAY}/chat/completions`, body };
}

/** The gateway's endpoint list for a reader: its pinned provider must offer zero data retention and no training. */
export async function readerRetentionRefusal(reader: TextReader, f: Fetch = fetch): Promise<string | null> {
  const r = TEXT_READERS[reader];
  const res = await f(`${GATEWAY}/models/${reader}/endpoints`);
  if (!res.ok) return `${reader}: the gateway's endpoint list answered ${res.status}; not calling`;
  const body = (await res.json()) as { data?: { endpoints?: { provider_name?: string; tag?: string; has_zdr?: boolean; has_no_training?: boolean }[] } };
  const e = (body.data?.endpoints ?? []).find((x) => x.provider_name === r.provider || x.tag === r.provider);
  if (!e) return `${reader}: the gateway lists no ${r.provider} endpoint; not calling`;
  if (e.has_zdr !== true) return `${reader}: ${r.provider} has no zero data retention on the gateway; not calling`;
  if (e.has_no_training !== true) return `${reader}: ${r.provider} doesn't promise no training on the gateway; not calling`;
  return null;
}

export interface TextRead { texts: { text: string; cut_off: boolean }[]; costUsd: number; costReported: boolean; requestId: string | null; servedBy: string | null; usage: unknown; error: string | null }

/** Reads the writing in one picture. A failed or malformed answer comes back with `error` set and its cost counted. */
export async function readText(reader: TextReader, image: { bytes: Buffer; contentType: string }, opts: { key?: string; fetch?: Fetch } = {}): Promise<TextRead> {
  const f = opts.fetch ?? fetch;
  const key = opts.key ?? process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error('no AI_GATEWAY_API_KEY');
  const refusal = await readerRetentionRefusal(reader, f);
  if (refusal) throw new Error(refusal);
  const req = readTextRequest(reader, image);
  const res = await f(req.url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
  const j = (await res.json().catch(() => ({}))) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = TEXT_READERS[reader];
  const u = j.usage ?? {};
  const msg = j.choices?.[0]?.message;
  const reported = Number(u.cost ?? msg?.provider_metadata?.gateway?.cost ?? NaN);
  const est = (u.prompt_tokens ?? 0) * r.input + (u.completion_tokens ?? 0) * r.output;
  const costUsd = Number.isFinite(reported) ? reported : res.ok ? est || readWorstUsd(reader) : 0;
  const servedBy = msg?.provider_metadata?.gateway?.routing?.finalProvider ?? msg?.provider_metadata?.gateway?.routing?.resolvedProvider ?? null;
  const base = { costUsd, costReported: Number.isFinite(reported), requestId: j.id ?? null, servedBy, usage: j.usage ?? null };
  if (!res.ok) return { ...base, texts: [], error: `gateway ${res.status}: ${String(j.error?.message ?? '').slice(0, 200)}` };
  if (servedBy && servedBy !== r.provider) return { ...base, texts: [], error: `served by ${servedBy}, not ${r.provider}` };
  try {
    const parsed = JSON.parse(String(msg?.content ?? '')) as { texts?: { text?: unknown; cut_off?: unknown }[] };
    const texts = (parsed.texts ?? []).map((t) => ({ text: String(t.text ?? ''), cut_off: t.cut_off === true }));
    return { ...base, texts, error: null };
  } catch {
    return { ...base, texts: [], error: `malformed answer: ${String(msg?.content ?? '').slice(0, 120)}` };
  }
}
