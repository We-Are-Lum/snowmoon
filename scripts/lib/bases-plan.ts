/**
 * The challenge's styles and bases, planned and priced (docs/starting-sheet-drafts/styles-proposal.md). Pure: reads the
 * plan file and the repository, calls no model, no database, no network. Used by `seed:designs -- --bases-plan`.
 *
 * Every price is measured, with where it was read:
 *   - fal pricing API (GET api.fal.ai/v1/models/pricing, read 2026-11-03): FLUX.2 [klein] 4B edit $0.01 per megapixel,
 *     Z-Image Turbo $0.005 per megapixel. The edit is billed on output + input megapixels (the drafts' ledger matches:
 *     a front from the 1024 x 576 sheet $0.01032192, a side from the 576 x 768 front $0.00884736).
 *   - Vercel AI Gateway model list (GET ai-gateway.vercel.sh/v1/models, read 2026-11-03): Gemini 3.1 Flash Image $0.067
 *     per 1K image plus tokens; GPT Image 2.5 Sunburst $5 per million input tokens, $30 per million output tokens.
 *   - The drafts' ledger (docs/starting-sheet-drafts/bases/ledger.json, 110 calls, 2026-11-03): Gemini 3.1 Flash Image
 *     $0.40605 for 6 pictures, GPT Image 2.5 Sunburst $0.28009 for 6 (1024 x 1536, quality high), the prompt check
 *     $0.00750 for 62 checks over 48 pictures (14 "unclear" first answers asked again).
 * Worst cases are the reserves the drafts' script held before each call (make-bases.mts): $0.02 an edit, $0.005 a
 * Z-Image picture, $0.09 Gemini, $0.08 GPT, $0.0015 a prompt check.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type ModelId = 'flux2-klein-4b-edit' | 'flux2-klein-4b' | 'z-image-turbo' | 'gemini-3.1-flash-image' | 'gpt-image-2.5-sunburst';
export interface StyleRow { name: string; status: string; kind: string; model: ModelId; samples: number; samples_made: boolean; text?: string }
export interface PlanFile {
  styles: StyleRow[];
  style_test: { style: string; model: ModelId; what: string }[];
  plans: Record<string, { about: string; bases: { style: string; model: ModelId }[] }>;
  retake_share: number;
}

const MP = (w: number, h: number) => (w * h) / 1e6;
const LEDGER = { geminiUsd: 0.4060455 / 6, gptUsd: 0.280093 / 6, checkUsd: 0.00750375 / 62, checksPerPicture: 62 / 48 };
const SHEET = MP(1024, 576); // the original sheets (content/snowmoon/recipes/images/cast.json)
const VIEW = MP(576, 768); // IMAGES.viewSize
const SAMPLE = MP(1024, 576); // a style sample, as the site makes them

/** One picture's estimated and worst cost. `from` is what it is made from: the sheet, the front, or text alone. */
export function pictureCost(model: ModelId, from: 'sheet' | 'front' | 'text'): { est: number; worst: number; how: string } {
  switch (model) {
    case 'flux2-klein-4b-edit': {
      const inMp = from === 'sheet' ? SHEET : from === 'front' ? VIEW : 0;
      return { est: 0.01 * (VIEW + inMp), worst: 0.02, how: `$0.01/MP x (${VIEW.toFixed(3)} out + ${inMp.toFixed(3)} in)` };
    }
    case 'z-image-turbo': return { est: 0.005 * SAMPLE, worst: 0.005, how: `$0.005/MP x ${SAMPLE.toFixed(3)}` };
    case 'flux2-klein-4b': return { est: 0, worst: 0, how: 'rendered locally, already made' };
    case 'gemini-3.1-flash-image': return { est: LEDGER.geminiUsd, worst: 0.09, how: 'ledger mean ($0.067 per 1K image + tokens)' };
    case 'gpt-image-2.5-sunburst': return { est: LEDGER.gptUsd, worst: 0.08, how: 'ledger mean (tokens, quality high)' };
  }
}

export const checkCost = (pictures: number) => ({ est: pictures * LEDGER.checksPerPicture * LEDGER.checkUsd, worst: pictures * 2 * 0.0015 });

export function readPlan(root: string): PlanFile {
  return JSON.parse(readFileSync(path.join(root, 'docs/starting-sheet-drafts/styles-plan.json'), 'utf8')) as PlanFile;
}

/** A stand-in body, only so closedBaseRefusal can read which models a design's pictures name. */
export const stubBody = (models: { slot: 'sample' | 'front' | 'side' | 'back'; model: string }[]) => ({
  samples: models.filter((m) => m.slot === 'sample').map((m) => ({ url: '', sha256: '', recipe: { model: m.model } })),
  views: Object.fromEntries(models.filter((m) => m.slot !== 'sample').map((m) => [m.slot, { url: '', sha256: '', recipe: { model: m.model } }])),
});

export const usd = (n: number) => `$${n.toFixed(4)}`;
