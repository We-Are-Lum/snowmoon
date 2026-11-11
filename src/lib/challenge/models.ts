import { CHALLENGE, CLOSED_IMAGES, CLOSED_PROVIDERS, IMAGES } from '../config';
import { MODEL_NOTICES } from '../legal';
import { makerServes, type Maker, type Where } from '../images/countries';
import { MODEL_WORDING } from './model-wording';

/**
 * The challenge's models (branch challenge-models, owner, 2026-11-08; Qwen-Image-Edit dropped 2026-11-09): the remix screen's Model row offers these, in
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
export type ChallengeModelId = 'flux2-klein-4b-edit' | 'gpt-image-2.5-sunburst' | 'gemini-3.1-flash-image';

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

/**
 * The one exception to "the default is open" (principle 3; owner, 2026-11-09, the challenge only): until entries
 * close (CHALLENGE.dates.closes, 29 Nov 23:59 PT), the Model row starts on GPT Image 2.5 Sunburst for someone who can
 * use it: signed in with Farcaster, Lens or Bluesky (not a wallet account), where OpenAI serves (countries.ts: its
 * supported countries, without the embargoed ones; nothing when the country header is missing), with closed models
 * offered (CHALLENGE.modelChoice), and with enough of today's free pictures left for one (CLOSED_IMAGES.countsAs).
 * Everyone else starts on FLUX, which stays first in the row and one tap away; after the close everyone starts on
 * FLUX again, with no deploy. The row's order doesn't change. check:principles P3e accepts exactly this and fails on
 * anything wider (a closed default for anyone else, after the close, or any other closed model).
 */
export const CHALLENGE_CLOSED_DEFAULT: ChallengeModelId = 'gpt-image-2.5-sunburst';

export interface DefaultCase {
  where: Where;
  /** Signed in at all (a wallet account included). */
  signedIn: boolean;
  wallet: boolean;
  /** Today's free pictures left; null when not known (signed out, or a wallet account). */
  picturesLeft: number | null;
  now: Date;
  /** CHALLENGE.modelChoice, for tests. */
  on?: boolean;
  /** One more closed picture would pass today's closed caps (limits.ts closedCapReached): start on FLUX (owner, 2026-11-09). */
  closedCapReached?: boolean;
}

/** The model the Model row starts on for this visitor (the exception above, or the open default). */
export function challengeDefaultModel(c: DefaultCase): ChallengeModelId {
  if (!c.signedIn || c.wallet) return DEFAULT_CHALLENGE_MODEL;
  if (!(c.now.getTime() < Date.parse(CHALLENGE.dates.closes))) return DEFAULT_CHALLENGE_MODEL;
  if (typeof c.picturesLeft === 'number' && c.picturesLeft < CLOSED_IMAGES.countsAs) return DEFAULT_CHALLENGE_MODEL;
  if (c.closedCapReached) return DEFAULT_CHALLENGE_MODEL;
  return challengeModelsFor(c.where, c.on).some((m) => m.id === CHALLENGE_CLOSED_DEFAULT) ? CHALLENGE_CLOSED_DEFAULT : DEFAULT_CHALLENGE_MODEL;
}

/** Every kind of visitor P3e and the tests try the default on: the exception's edges, each one way and the other. */
export function defaultCases(): DefaultCase[] {
  const closes = Date.parse(CHALLENGE.dates.closes);
  const out: DefaultCase[] = [];
  const wheres: Where[] = [{ country: 'US', region: null }, { country: 'FR', region: null }, { country: null, region: null }, { country: 'IR', region: null }, { country: 'CN', region: null }, { country: 'UA', region: '43' }];
  for (const where of wheres)
    for (const [signedIn, wallet] of [[true, false], [true, true], [false, false]] as const)
      for (const picturesLeft of [null, 10, 3, 2, 0])
        for (const now of [new Date(closes - 60_000), new Date(closes), new Date(closes + 86_400_000)])
          for (const on of [true, false]) for (const closedCapReached of [false, true]) out.push({ where, signedIn, wallet, picturesLeft, now, on, closedCapReached });
  return out;
}

/**
 * What's wrong with these defaults (P3e): any closed model but GPT Image 2.5 Sunburst as a default, or GPT as a
 * default outside the exception (signed out, a wallet account, after the close, where OpenAI doesn't serve or the
 * country is unknown, closed models off, too few pictures left). A narrower default (FLUX where the exception allows
 * GPT) is no P3 problem; scripts/test-model-choice.ts holds the exact rule.
 */
export function challengeDefaultProblems(got: readonly { c: DefaultCase; id: string }[]): string[] {
  const p: string[] = [];
  const closes = Date.parse(CHALLENGE.dates.closes);
  for (const { c, id } of got) {
    const m = CHALLENGE_MODELS.find((x) => x.id === id);
    const who = `${c.signedIn ? (c.wallet ? 'a wallet account' : 'signed in') : 'signed out'}, country ${c.where.country ?? 'unknown'}${c.where.region ? `-${c.where.region}` : ''}, ${c.picturesLeft ?? 'unknown'} left, ${c.now.toISOString()}${c.on === false ? ', closed models off' : ''}${c.closedCapReached ? ', the closed cap reached' : ''}`;
    if (!m) { p.push(`default ${id} is not a challenge model (${who})`); continue; }
    if (m.open) continue;
    if (m.id !== CHALLENGE_CLOSED_DEFAULT) { p.push(`the default is ${m.id}, a closed model other than the challenge's one exception (${who})`); continue; }
    const allowed = c.signedIn && !c.wallet && c.now.getTime() < closes && !(typeof c.picturesLeft === 'number' && c.picturesLeft < CLOSED_IMAGES.countsAs) && (c.on ?? CHALLENGE.modelChoice) && makerServes('OpenAI', c.where) && !c.closedCapReached;
    if (!allowed) p.push(`the default is closed (${m.id}) outside the exception (${who})`);
  }
  return p;
}

/** The worst case reserved before a picture: the picture's worst cost plus the prompt check's share. */
export function reserveUsd(m: ChallengeModel, ref: { width: number; height: number }, out: { width: number; height: number } = IMAGES.size): number {
  if (m.id === 'flux2-klein-4b-edit') return (mp(out) + mp(ref)) * IMAGES.editPricePerMp + GUARD_SHARE;
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

/** Can this visitor use a closed model here (not a wallet account, and one is offered where they are)? */
export const closedUsableBy = (where: Where, wallet: boolean, on?: boolean): boolean => !wallet && challengeModelsFor(where, on).some((m) => !m.open);

/** A model by its id, only if it is offered to this visitor; nothing (or empty) is the open default. Null otherwise. */
export function challengeModel(id: unknown, where: Where, on?: boolean, geminiOk?: boolean): ChallengeModel | null {
  const want = id === undefined || id === null || id === '' ? DEFAULT_CHALLENGE_MODEL : id;
  return challengeModelsFor(where, on, geminiOk).find((m) => m.id === want) ?? null;
}

/**
 * What the screen's Model row receives: one entry per offered model, the open default first. For a wallet account
 * (closed models are off for it), the closed entries are left out and `note` says why, where they'd otherwise be offered.
 */
export function modelView(where: Where, opts: { wallet?: boolean; on?: boolean } = {}) {
  const row = modelRow(where, opts.on);
  if (!opts.wallet || row.every((m) => m.open)) return { models: row, note: null as string | null };
  return { models: row.filter((m) => m.open), note: MODEL_WORDING.walletOnly as string | null };
}

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
    if (m.call.host === 'Vercel AI Gateway' && !(m.call.only?.length === 1)) p.push(`${m.id}: a gateway call not tied to one provider`);
    if (m.id === 'gemini-3.1-flash-image' && JSON.stringify(m.call.only) !== JSON.stringify(['vertex'])) p.push(`${m.id}: Gemini must go only through vertex`);
    if (!(reserveUsd(m, IMAGES.size) >= m.estimateUsd)) p.push(`${m.id}: reserves less than its estimate`);
  }
  return p;
}

// --- The screen's side (branch challenge-simple, 2026-11-08), kept as that lane built it --------------------------
// The remix screen shows one chip per model ("{label} · {maker} · open|closed"), sends the chosen `id`, and the route
// checks it (challengeModel above, which also applies the country). challenge-simple's list held one entry; this
// branch fills it from modelRow.

/** One chip's model: what challenge-simple's screen reads (a Model row entry has these and more). */
export interface ModelChoice {
  id: string;
  label: string;
  maker: string;
  open: boolean;
}

/** The Model row for a visitor (no country given: the open models only). The first is the default. */
export function challengeModels(where: Where = { country: null, region: null }): ModelRowEntry[] {
  return modelRow(where);
}

/** One chip's words: "FLUX.2 [klein] 4B · Black Forest Labs · open". */
export const modelChipText = (m: ModelChoice) => `${m.label} · ${m.maker} · ${m.open ? 'open' : 'closed'}`;

/** The model the request names, if the list offers it. Null (refused) for anything else, a missing one included. */
export function modelFromRequest<T extends ModelChoice>(id: unknown, models: readonly T[] = challengeModels() as unknown as T[]): T | null {
  return typeof id === 'string' ? (models.find((m) => m.id === id) ?? null) : null;
}
