import { CLOSED_IMAGES, IMAGES } from '../config';

/**
 * Which model makes a remixed character sheet's views (branch remix-model-choice, DRAFT, 2026-11-04). Off unless
 * IMAGES.designs.modelChoice is on. A sheet's views all come from one choice, chosen once per sheet: its front, then
 * its side and back made from that front, with the same model. The site's open models are the default and always
 * first (principle 3; check:principles P3e). No server-only imports: the form shows the list, the routes enforce it.
 *
 * Each choice names the models it calls, by their id in config/models.json, where every model's licence, maker and
 * whether its weights are open are recorded; the labels shown ("open weights, Apache-2.0", "a closed model by
 * Google") are read from there (recipe-lines.ts, modelTerms), never written here.
 *
 * Prices are today's published ones (docs/legal/remix-model-choice-draft.md, "Cost per remix", with sources):
 * - `estimateUsd`: what one picture usually costs, from the price lists and the bases run of 2026-11-03;
 * - `reserveUsd`: the worst case reserved before a picture (the picture plus the prompt check's share, 0.0015), then
 *   replaced by the real cost (reserve-then-settle, src/lib/images/limits.ts).
 */
export type SheetModelId = 'open' | 'gemini-3.1-flash-image' | 'gpt-image-2.5-sunburst';
export type ViewSlot = 'front' | 'side' | 'back';

export interface SheetModelCall {
  /** The model's id in config/models.json. */
  id: string;
  name: string;
  endpoint: string;
  host: string;
}

export interface SheetModel {
  id: SheetModelId;
  /** What the picker shows, before the label read from config/models.json. */
  name: string;
  /** True for the site's open models; false for a closed model. */
  open: boolean;
  /** The maker, for a closed model (named first wherever its pictures are shown: owner, 2026-10-18). */
  maker: string | null;
  /** The provider the picture's prompt and reference pictures are sent to, and through what. */
  provider: { name: string; through: string };
  /** The front from text; the side and back from the front. */
  front: SheetModelCall;
  views: SheetModelCall;
  estimateUsd: { front: number; view: number };
  reserveUsd: { front: number; view: number };
}

const GUARD_SHARE = IMAGES.reserveUsd - IMAGES.pricePerMp; // 0.0015, as every Generate reserves for the prompt check

export const SHEET_MODELS: readonly SheetModel[] = [
  {
    id: 'open',
    name: `${IMAGES.model.name}, then ${IMAGES.editModel.name}`,
    open: true,
    maker: null,
    provider: { name: 'fal.ai', through: 'fal.ai' },
    front: { id: IMAGES.model.id, name: IMAGES.model.name, endpoint: IMAGES.model.endpoint, host: IMAGES.model.host },
    views: { id: IMAGES.editModel.id, name: IMAGES.editModel.name, endpoint: IMAGES.editModel.endpoint, host: IMAGES.editModel.host },
    // Z-Image Turbo: 576 x 768 = 0.442 MP at $0.005/MP; FLUX.2 [klein] 4B edit: (output + the front) 0.885 MP at $0.01/MP.
    estimateUsd: { front: 0.0022, view: 0.0088 },
    reserveUsd: { front: IMAGES.reserveUsd, view: IMAGES.editReserveUsd(1) },
  },
  {
    id: 'gemini-3.1-flash-image',
    name: 'Gemini 3.1 Flash Image',
    open: false,
    maker: 'Google',
    provider: { name: 'Google', through: 'Vercel AI Gateway' },
    front: { id: 'gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image', endpoint: 'google/gemini-3.1-flash-image', host: 'Vercel AI Gateway' },
    views: { id: 'gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image', endpoint: 'google/gemini-3.1-flash-image', host: 'Vercel AI Gateway' },
    // $0.067 per 1K image plus tokens ($0.50 / $3 per million); the bases run: $0.0677 a picture.
    estimateUsd: { front: 0.0677, view: 0.0677 },
    reserveUsd: { front: 0.09 + GUARD_SHARE, view: 0.09 + GUARD_SHARE },
  },
  {
    id: 'gpt-image-2.5-sunburst',
    name: 'GPT Image 2.5 Sunburst',
    open: false,
    maker: 'OpenAI',
    provider: { name: 'OpenAI', through: 'Vercel AI Gateway' },
    front: { id: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway' },
    views: { id: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway' },
    // Tokens: $5 per million in ($8 for picture tokens, as the bases' bills work out), $30 out; 1024 x 1536 at quality
    // high is 1,372 output tokens ($0.0412). A front from text alone about $0.0427; a view with the front, $0.0467 (bases).
    estimateUsd: { front: 0.0427, view: 0.0467 },
    reserveUsd: { front: 0.08 + GUARD_SHARE, view: 0.08 + GUARD_SHARE },
  },
];

export const DEFAULT_SHEET_MODEL: SheetModelId = 'open';

/** The choices a remixer is offered: only the open default while the switch is off. */
export function sheetModelsOffered(on: boolean = IMAGES.designs.modelChoice, geminiOk: boolean = CLOSED_IMAGES.geminiAgeReadingAccepted): readonly SheetModel[] {
  // Gemini waits for the owner's reading of Google's under-18 clause (CLOSED_IMAGES.geminiAgeReadingAccepted).
  return on ? SHEET_MODELS.filter((m) => m.id !== 'gemini-3.1-flash-image' || geminiOk) : SHEET_MODELS.filter((m) => m.id === DEFAULT_SHEET_MODEL);
}

/** A choice by its id, only if it is offered now; anything else (or nothing) is the open default. Null for an unknown id. */
export function sheetModel(id: unknown, on: boolean = IMAGES.designs.modelChoice, geminiOk: boolean = CLOSED_IMAGES.geminiAgeReadingAccepted): SheetModel | null {
  const want = id === undefined || id === null || id === '' ? DEFAULT_SHEET_MODEL : id;
  return sheetModelsOffered(on, geminiOk).find((m) => m.id === want) ?? null;
}

/** The model a view is made with, for this choice. */
export const callFor = (m: SheetModel, slot: ViewSlot): SheetModelCall => (slot === 'front' ? m.front : m.views);
/** The worst case reserved before a view. */
export const reserveFor = (m: SheetModel, slot: ViewSlot): number => (slot === 'front' ? m.reserveUsd.front : m.reserveUsd.view);
/** Is this model id a closed sheet model's? (Its pictures count in CLOSED_IMAGES, not in the open 10.) */
export const isClosedModelId = (id: string): boolean => SHEET_MODELS.some((m) => !m.open && (m.front.id === id || m.views.id === id));
export const CLOSED_MODEL_IDS: readonly string[] = [...new Set(SHEET_MODELS.filter((m) => !m.open).flatMap((m) => [m.front.id, m.views.id]))];

/**
 * One model per sheet: every view's record names the same choice ('open' when a record has none, as every record made
 * before this branch). Returns the choice, or null when the views were made with more than one.
 */
export function oneChoice(views: { choice?: string | null }[]): SheetModelId | null {
  const ids = new Set(views.map((v) => v.choice ?? DEFAULT_SHEET_MODEL));
  return ids.size === 1 ? ([...ids][0] as SheetModelId) : null;
}

/** What's wrong with a list of choices (P3e, and scripts/test-model-choice.ts on planted lists). */
export function sheetModelProblems(list: readonly SheetModel[]): string[] {
  const p: string[] = [];
  if (!list.length) return ['no sheet models'];
  if (list[0].id !== DEFAULT_SHEET_MODEL) p.push(`the first choice is ${list[0].id}, not the open default`);
  if (!list[0].open) p.push('the first choice is not open: the default must be open');
  if (list.filter((m) => m.id === DEFAULT_SHEET_MODEL).length !== 1) p.push('the open default is listed more than once, or not at all');
  for (const m of list) {
    if (!m.open && !m.maker) p.push(`${m.id}: a closed model without its maker`);
    if (m.open && m.maker) p.push(`${m.id}: an open choice names a maker as if closed`);
    for (const k of ['front', 'view'] as const) if (!(m.reserveUsd[k] >= m.estimateUsd[k])) p.push(`${m.id}: reserves less than its estimate for the ${k}`);
  }
  return p;
}
