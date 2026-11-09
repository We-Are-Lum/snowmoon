import { CHALLENGE, CLOSED_IMAGES, CLOSED_PROVIDERS, IMAGES } from '../config';
import { MODEL_NOTICES } from '../legal';
import { makerServes, type Maker, type Where } from '../images/countries';

/**
 * The challenge's models (branch challenge-models, owner, 2026-11-08): the remix screen's Model row offers these, in
 * this order, the open default first (principle 3; check:principles P3e). Each makes one picture from the person's
 * words with the tapped picture as its single reference image, through the site's own pipeline (consent, the gate,
 * the daily count and caps, the prompt check). No server-only imports: the route sends the list, and the screen shows
 * it; the route alone decides what is offered (a closed model only where its maker serves, countries.ts) and refuses
 * anything else.
 *
 * Every model is on config/models.json, which records its licence, maker and whether its weights are open. Prices are
 * today's published ones (docs/legal/challenge-models-draft.md, "Cost", with sources): `estimateUsd` what one picture
 * usually costs; the worst case reserved before a picture is reserveUsd(model, reference) (reserve-then-settle).
 */
export type ChallengeModelId = 'flux2-klein-4b-edit' | 'qwen-image-edit' | 'gpt-image-2.5-sunburst' | 'gemini-3.1-flash-image';

export interface ChallengeModel {
  id: ChallengeModelId;
  /** Its id in config/models.json. */
  allowlistId: string;
  name: string;
  /** Who made it: named first wherever a closed model's pictures are shown (owner, 2026-10-18). */
  maker: string;
  open: boolean;
  /** "open weights, Apache-2.0" or "a closed model by Google": the screen's label and the recipe's. */
  terms: string;
  /** How it is called: the host or gateway, the endpoint there, and (for the gateway) the one provider allowed. */
  call: { host: 'fal.ai' | 'Vercel AI Gateway'; endpoint: string; only?: string[] };
  /** What one picture usually costs, at today's prices. */
  estimateUsd: number;
  /** A price still to be confirmed by the owner (shown nowhere as fact). */
  priceToConfirm?: string;
  /** For a closed model: its maker's retention words (CLOSED_PROVIDERS), as Privacy §7 and the notice say them. */
  retention: string | null;
}

const GUARD_SHARE = IMAGES.reserveUsd - IMAGES.pricePerMp; // 0.0015, the prompt check's share, as every Generate reserves
const mp = (s: { width: number; height: number }) => (s.width * s.height) / 1e6;

/**
 * Qwen-Image-Edit-2509 on fal.ai (coordinator, 2026-11-08, from fal's pages): `fal-ai/qwen-image-edit-plus` is 2509;
 * `fal-ai/qwen-image-edit-2511` also exists at the same price (the owner may switch: change it here only);
 * `fal-ai/qwen-image-edit` is deprecated, never used. "$0.03 per megapixel"; how fal rounds megapixels is
 * unconfirmed, so it is costed safely: $0.03 x (the output's MP, at least 1, + the reference's MP), as
 * scripts/fal-batch.py does.
 */
export const QWEN = { allowlistId: 'qwen-image-edit-2509', name: 'Qwen-Image-Edit', endpoint: 'fal-ai/qwen-image-edit-plus', pricePerMp: 0.03 } as const;
export const qwenCostUsd = (out: { width: number; height: number }, ref: { width: number; height: number }) => QWEN.pricePerMp * (Math.max(1, mp(out)) + mp(ref));

const retention = (maker: string) => CLOSED_PROVIDERS[maker as keyof typeof CLOSED_PROVIDERS]?.retentionWords ?? null;

export const CHALLENGE_MODELS: readonly ChallengeModel[] = [
  {
    id: 'flux2-klein-4b-edit',
    allowlistId: IMAGES.editModel.id,
    name: IMAGES.editModel.name,
    maker: 'Black Forest Labs',
    open: true,
    terms: `open weights, ${IMAGES.editModel.licence}`,
    call: { host: 'fal.ai', endpoint: IMAGES.editModel.endpoint },
    // (1024 x 576 out + a 1024 x 576 reference) at $0.01/MP.
    estimateUsd: 0.012,
    retention: null,
  },
  {
    id: 'qwen-image-edit',
    allowlistId: QWEN.allowlistId,
    name: QWEN.name,
    maker: 'Alibaba\'s Qwen team',
    open: true,
    terms: 'open weights, Apache-2.0',
    call: { host: 'fal.ai', endpoint: QWEN.endpoint },
    // $0.03 x (1 MP, the output rounded up + about 0.6 MP of reference).
    estimateUsd: 0.048,
    priceToConfirm: 'fal\'s megapixel rounding (costed at the output\'s MP, at least 1, plus the reference\'s)',
    retention: null,
  },
  {
    id: 'gpt-image-2.5-sunburst',
    allowlistId: 'gpt-image-2.5-sunburst',
    name: 'GPT Image 2.5 Sunburst',
    maker: 'OpenAI',
    open: false,
    terms: 'a closed model by OpenAI',
    call: { host: 'Vercel AI Gateway', endpoint: 'openai/gpt-image-2.5-sunburst', only: ['openai'] },
    // Measured on the bases (2026-11-03): $0.0466 to $0.0468 a picture with one reference, 1536 x 1024, quality high.
    estimateUsd: 0.047,
    retention: retention('OpenAI'),
  },
  {
    id: 'gemini-3.1-flash-image',
    allowlistId: 'gemini-3.1-flash-image',
    name: 'Gemini 3.1 Flash Image',
    maker: 'Google',
    open: false,
    terms: 'a closed model by Google',
    // Vertex AI only, never the `google` (Gemini API) provider (docs/legal/age-terms-closed-models.md).
    call: { host: 'Vercel AI Gateway', endpoint: 'google/gemini-3.1-flash-image', only: ['vertex'] },
    // $0.067 per 1K image plus tokens; the bases run: $0.0677 a picture.
    estimateUsd: 0.068,
    retention: retention('Google'),
  },
];

export const DEFAULT_CHALLENGE_MODEL: ChallengeModelId = 'flux2-klein-4b-edit';

/** The worst case reserved before a picture: the picture's worst cost plus the prompt check's share. */
export function reserveUsd(m: ChallengeModel, ref: { width: number; height: number }, out: { width: number; height: number } = IMAGES.size): number {
  if (m.id === 'flux2-klein-4b-edit') return (mp(out) + mp(ref)) * IMAGES.editPricePerMp + GUARD_SHARE;
  if (m.id === 'qwen-image-edit') return qwenCostUsd(out, ref) + GUARD_SHARE;
  if (m.id === 'gpt-image-2.5-sunburst') return 0.08 + GUARD_SHARE;
  return 0.09 + GUARD_SHARE;
}

/**
 * The models offered to this visitor now: the open ones always (first, the default first); a closed one only while
 * CHALLENGE.modelChoice is on and its maker serves the visitor's country (countries.ts). Gemini also waits on
 * CLOSED_IMAGES.geminiAgeReadingAccepted (owner, 2026-11-04: accepted).
 */
export function challengeModelsFor(where: Where, on: boolean = CHALLENGE.modelChoice, geminiOk: boolean = CLOSED_IMAGES.geminiAgeReadingAccepted): readonly ChallengeModel[] {
  return CHALLENGE_MODELS.filter((m) => {
    if (m.open) return on || m.id === DEFAULT_CHALLENGE_MODEL;
    if (!on) return false;
    if (m.id === 'gemini-3.1-flash-image' && !geminiOk) return false;
    return makerServes(m.maker as Maker, where);
  });
}

/** A model by its id, only if it is offered to this visitor; nothing (or empty) is the open default. Null otherwise. */
export function challengeModel(id: unknown, where: Where, on?: boolean, geminiOk?: boolean): ChallengeModel | null {
  const want = id === undefined || id === null || id === '' ? DEFAULT_CHALLENGE_MODEL : id;
  return challengeModelsFor(where, on, geminiOk).find((m) => m.id === want) ?? null;
}

/** What the screen's Model row receives: one entry per offered model, the open default first. */
export function modelRow(where: Where, on?: boolean) {
  return challengeModelsFor(where, on).map((m) => ({
    id: m.id,
    label: m.name,
    maker: m.maker,
    open: m.open,
    terms: m.terms,
    aboutUsd: Number(m.estimateUsd.toFixed(2)),
    // A closed model: its maker's label beside it always, and the notice (version) the screen must have shown.
    retention: m.open ? null : (MODEL_NOTICES[m.maker as keyof typeof MODEL_NOTICES]?.label ?? null),
    notice: m.open ? null : (CLOSED_PROVIDERS[m.maker as keyof typeof CLOSED_PROVIDERS]?.noticeVersion ?? null),
    countsAs: m.open ? 1 : CLOSED_IMAGES.countsAs,
  }));
}
export type ModelRowEntry = ReturnType<typeof modelRow>[number];

/**
 * A closed model needs the screen to say its maker's notice was shown and the 18+ box ticked on this device
 * (model-notice.ts). The server can't check either (they live on the device): this only refuses a request that
 * didn't go through them. Returns the problem, or null.
 */
export function noticeProblem(m: ChallengeModel, notice: unknown): 'notice' | 'adult' | null {
  if (m.open) return null;
  const n = (notice && typeof notice === 'object' ? notice : {}) as { version?: unknown; adult?: unknown };
  const want = CLOSED_PROVIDERS[m.maker as keyof typeof CLOSED_PROVIDERS]?.noticeVersion;
  if (want === undefined || n.version !== want) return 'notice';
  if (n.adult !== true) return 'adult';
  return null;
}

/** What's wrong with a list of models (P3e, and scripts/test-model-choice.ts on planted lists). */
export function challengeModelProblems(list: readonly ChallengeModel[]): string[] {
  const p: string[] = [];
  if (!list.length) return ['no challenge models'];
  if (list[0].id !== DEFAULT_CHALLENGE_MODEL || !list[0].open) p.push(`the first model is ${list[0].id}, not the open default`);
  const firstClosed = list.findIndex((m) => !m.open);
  if (firstClosed >= 0 && list.slice(firstClosed).some((m) => m.open)) p.push('an open model is listed after a closed one');
  for (const m of list) {
    if (!m.maker) p.push(`${m.id}: no maker`);
    if (!m.open && !/closed model by /.test(m.terms)) p.push(`${m.id}: a closed model whose label doesn't say "a closed model by" its maker`);
    if (!m.open && !m.terms.includes(m.maker)) p.push(`${m.id}: its label doesn't name its maker`);
    if (!m.open && !m.retention) p.push(`${m.id}: a closed model without its maker's retention words`);
    if (m.call.host === 'Vercel AI Gateway' && !(m.call.only?.length === 1)) p.push(`${m.id}: a gateway call not pinned to one provider`);
    if (m.id === 'gemini-3.1-flash-image' && JSON.stringify(m.call.only) !== JSON.stringify(['vertex'])) p.push(`${m.id}: Gemini must go only through vertex`);
    if (!(reserveUsd(m, IMAGES.size) >= m.estimateUsd)) p.push(`${m.id}: reserves less than its estimate`);
  }
  return p;
}
