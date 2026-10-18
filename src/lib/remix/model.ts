/**
 * Which model Remix draws with (owner, 2026-10-18: "all the pictures in the remix aren't the ChatGPT images so
 * might be confusing"). Plain constants and pure helpers, no server code, so check:principles P3b can read them.
 *
 * REMIX_MODEL is the flag. It is OFF ('flux') until the owner rereads docs/legal/remix-gpt-draft.md: Privacy,
 * Terms and the consent wording must name OpenAI on the day it goes live (owner's rule: the texts only ever
 * describe what the site does that day). It is not an environment variable. Turning it on is a reviewed commit.
 *
 * - 'flux' (today): every version is remixed with FLUX.2 [klein] 4B edit on fal.ai (IMAGES.editModel). A version
 *   whose pictures a closed model redrew from an open-weight one (version 2, the GPT cut) sends the open-weight
 *   version's shot (src/lib/remix/shot.ts), and the panel says the frame won't look like the version's pictures.
 * - 'gpt': a version whose pictures were drawn by REMIX_GPT's model (its editor data names it as closedModel) is
 *   remixed with that same model, through the same gateway and endpoint as the cut
 *   (adaptations/fifteen-days/preprod/gpt/gpt.mjs: Vercel AI Gateway /v1/images/edits), with its own shot's prompt,
 *   cards and plate, so the frames match. Every other version stays on FLUX.
 */
export type RemixModelKind = 'flux' | 'gpt';

/** THE FLAG. Default 'flux'. DO NOT set to 'gpt' before the owner's reread of the drafted legal lines. */
export const REMIX_MODEL: RemixModelKind = 'flux';

/** A closed model, named as the owner asked (2026-10-18): its name, its maker, that it is closed; the recipe adds the date. */
export interface ClosedRemixModel {
  id: string;
  name: string;
  maker: string;
  endpoint: string;
  host: string;
  licence: string;
  closed: true;
  open_weights: false;
}

/**
 * GPT Image 2.5 Sunburst through Vercel AI Gateway, as the cut used it (config/models.json gpt-image-2.5-sunburst,
 * open_weights false). Prices are the gateway's, as fitted exactly to the cut's 51 recipes (docs/legal/remix-gpt-draft.md):
 * $5 per million text tokens in, $8 per million image tokens in, $30 per million tokens out.
 */
export const REMIX_GPT = {
  model: {
    id: 'gpt-image-2.5-sunburst',
    name: 'GPT Image 2.5 Sunburst',
    maker: 'OpenAI',
    endpoint: 'openai/gpt-image-2.5-sunburst',
    host: 'Vercel AI Gateway',
    licence: 'proprietary (OpenAI); weights not published',
    closed: true,
    open_weights: false,
  } satisfies ClosedRemixModel,
  /** The gateway's OpenAI-compatible image edit endpoint, as gpt.mjs called it. */
  url: 'https://ai-gateway.vercel.sh/v1/images/edits',
  /** The cut's size, so a remix frame matches the version's frames. */
  size: { width: 1536, height: 864 },
  /** Asked for a JPEG, as the readers' bucket stores remix frames; a PNG reply is kept as PNG. */
  outputFormat: 'jpeg',
  /** USD per million tokens, as the gateway charged for the cut (2026-10-18). */
  usdPerMTok: { textIn: 5, imageIn: 8, out: 30 },
  /** Worst-case tokens for one Remix frame (the cut's maxima: 1,678 text, 2,304 image, 1,078 out; rounded up). */
  maxTokens: { textIn: 2200, imageIn: 2600, out: 1100 },
  /** The shot's prompt (up to 7,397 characters in version 2), the reader's words (600) and the no-text line. */
  promptMaxChars: 8500,
  /** The prompt check, as REMIX.reserveUsd counts it. */
  guardUsd: 0.0015,
} as const;

/** The worst case reserved before a GPT Generate: $0.0663 (2,200 × $5 + 2,600 × $8 + 1,100 × $30 per million, plus the check). */
export function gptReserveUsd(): number {
  const { usdPerMTok: p, maxTokens: t, guardUsd } = REMIX_GPT;
  return Math.round(((t.textIn * p.textIn + t.imageIn * p.imageIn + t.out * p.out) / 1e6 + guardUsd) * 1e6) / 1e6;
}

/** The model for a version: GPT only with the flag on and only for a version whose own pictures that model drew. */
export function remixModelFor(versionModelEndpoint: string | null | undefined, flag: RemixModelKind = REMIX_MODEL): RemixModelKind {
  return flag === 'gpt' && versionModelEndpoint === REMIX_GPT.model.endpoint ? 'gpt' : 'flux';
}

/**
 * The AI declaration under a remix frame (principle 2), naming a closed model with its maker and that it is closed
 * (principle 3; owner, 2026-10-18). DRAFT wording.
 */
export function remixFrameLabel(model: { name?: string; maker?: string; closed?: boolean } | null | undefined): string {
  return model?.closed ? `AI-generated with ${model.name} (${model.maker}, a closed model), not by the author` : 'AI-generated image, not by the author';
}

/**
 * A remix of an open-weight version listed on a version GPT Image drew (owner, 2026-10-18, decision 2d: list version
 * 1's remixes on version 2's panel, labelled "version 1 · open-weight"): its tag, and its own label naming its open
 * model. DRAFT wording.
 */
export const openWeightTag = (version: number) => `version ${version} · open-weight`;
export const openFrameLabel = (modelName: string | undefined) => `AI-generated with ${modelName ?? 'an open-weight model'} (open weights), not by the author`;

/** The model as a remix frame's recipe records it: a closed one with its maker, the date and "closed model". */
export function closedRecipeModel(madeAt: string) {
  const m = REMIX_GPT.model;
  return { id: m.id, name: m.name, maker: m.maker, licence: m.licence, endpoint: m.endpoint, host: m.host, closed: true, open_weights: false, date: madeAt.slice(0, 10), label: 'closed model' } as const;
}
