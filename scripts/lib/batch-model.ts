/**
 * The shared path for batch jobs that call a closed image model (CLAUDE.md: batch jobs go only through the Vercel AI
 * Gateway, never the site's own keys). Owner, 2026-11-04: every new closed call sets zeroDataRetention and
 * disallowPromptTraining, and pins its provider: Google's models to Vertex AI (`only: ['vertex']`), OpenAI's to OpenAI
 * (`only: ['openai']`). Before any paid call, the gateway's own endpoint list (a free GET) must show that provider with
 * both `has_zdr` and `has_no_training`; otherwise the call is refused here and nothing is sent.
 *
 * The gateway key is read from AI_GATEWAY_API_KEY and never printed. Tests: scripts/test-batch-model.ts.
 */
export type ClosedImageModel = 'gemini-3.1-flash-image' | 'gpt-image-2.5-sunburst';

export const CLOSED_IMAGE_MODELS: Record<ClosedImageModel, { slug: string; maker: 'Google' | 'OpenAI'; provider: 'vertex' | 'openai'; worstUsd: number }> = {
  'gemini-3.1-flash-image': { slug: 'google/gemini-3.1-flash-image', maker: 'Google', provider: 'vertex', worstUsd: 0.09 },
  'gpt-image-2.5-sunburst': { slug: 'openai/gpt-image-2.5-sunburst', maker: 'OpenAI', provider: 'openai', worstUsd: 0.08 },
};

const GATEWAY = 'https://ai-gateway.vercel.sh/v1';

/** The gateway options every closed call carries. */
export function gatewayOptions(model: ClosedImageModel) {
  return { only: [CLOSED_IMAGE_MODELS[model].provider], zeroDataRetention: true, disallowPromptTraining: true } as const;
}

/** Throws unless a request body carries the required gateway options for its model. Run on every body before it is sent. */
export function assertGatewayOptions(model: ClosedImageModel, body: { providerOptions?: { gateway?: Record<string, unknown> } }): void {
  const g = body.providerOptions?.gateway ?? {};
  const want = gatewayOptions(model);
  if (g.zeroDataRetention !== true) throw new Error(`${model}: zeroDataRetention is not set`);
  if (g.disallowPromptTraining !== true) throw new Error(`${model}: disallowPromptTraining is not set`);
  if (!Array.isArray(g.only) || g.only.length !== 1 || g.only[0] !== want.only[0]) throw new Error(`${model}: only must be ['${want.only[0]}']`);
}

type Fetch = typeof fetch;

/**
 * The gateway's endpoint list for the model (no cost): the pinned provider must offer both ZDR and no training.
 * Returns null when it does, or the reason it doesn't.
 */
export async function retentionRefusal(model: ClosedImageModel, f: Fetch = fetch): Promise<string | null> {
  const m = CLOSED_IMAGE_MODELS[model];
  const res = await f(`${GATEWAY}/models/${m.slug}/endpoints`);
  if (!res.ok) return `${model}: the gateway's endpoint list answered ${res.status}; not calling`;
  const body = (await res.json()) as { data?: { endpoints?: { provider_name?: string; tag?: string; has_zdr?: boolean; has_no_training?: boolean }[] } };
  const eps = body.data?.endpoints ?? [];
  const e = eps.find((x) => (x.tag ?? x.provider_name) === m.provider || x.provider_name === m.provider);
  if (!e) return `${model}: the gateway lists no ${m.provider} endpoint; not calling`;
  if (e.has_zdr !== true) return `${model}: the gateway's ${m.provider} endpoint has no zero data retention (has_zdr ${String(e.has_zdr)}); not calling`;
  if (e.has_no_training !== true) return `${model}: the gateway's ${m.provider} endpoint doesn't promise no training; not calling`;
  return null;
}

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
    if (model !== 'gemini-3.1-flash-image') throw new Error(`${model}: text-only pictures are made with Gemini only here`);
    const settings = { modalities: ['text', 'image'], aspect_ratio: aspect };
    const body = { model: m.slug, modalities: settings.modalities, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      providerOptions: { gateway, google: { imageConfig: { aspectRatio: aspect } } } };
    assertGatewayOptions(model, body);
    return { url: `${GATEWAY}/chat/completions`, body, settings: { ...settings, gateway } };
  }
  const dataUrl = `data:${ref.contentType};base64,${ref.bytes.toString('base64')}`;
  if (model === 'gpt-image-2.5-sunburst') {
    const settings = { size: '1024x1536', quality: 'high', n: 1, output_format: 'png' };
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
  const why = await retentionRefusal(model, f);
  if (why) throw new Error(why);
  const m = CLOSED_IMAGE_MODELS[model];
  const req = closedImageRequest(model, prompt, ref, opts.aspect);
  const res = await f(req.url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
  const body = (await res.json().catch(() => ({}))) as any;
  if (model === 'gpt-image-2.5-sunburst') {
    if (!res.ok || !body.data?.[0]?.b64_json) throw new Error(`${model} ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
    const meta = { ...body, data: undefined };
    return { bytes: Buffer.from(body.data[0].b64_json, 'base64'), contentType: 'image/png', requestId: meta.providerMetadata?.gateway?.generationId ?? null,
      costUsd: Number(meta.providerMetadata?.gateway?.cost ?? m.worstUsd), settings: req.settings, meta };
  }
  const url: string = body.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? '';
  const mm = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!res.ok || !mm) throw new Error(`${model} ${res.status} ${JSON.stringify({ ...body, choices: body.choices?.map((c: any) => ({ ...c, message: { ...c.message, images: undefined } })) }).slice(0, 400)}`);
  const cost = Number(body.usage?.cost ?? body.providerMetadata?.gateway?.cost ?? NaN);
  const meta = { id: body.id, model: body.model, usage: body.usage, provider_metadata: body.choices?.[0]?.message?.provider_metadata ?? body.providerMetadata ?? null };
  return { bytes: Buffer.from(mm[2], 'base64'), contentType: mm[1], requestId: body.id ?? null, costUsd: Number.isFinite(cost) ? cost : m.worstUsd, settings: req.settings, meta };
}
