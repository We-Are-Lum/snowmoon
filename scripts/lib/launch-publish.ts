/**
 * The launch's bases and the owner's first remixes (2026-11-06), as published sheets: the pure part, shared by
 * scripts/publish-bases.ts and scripts/import-first-remixes.ts and tested by scripts/test-launch-publish.ts. No database,
 * no storage, no network, no model: it reads the picks (scripts/lib/launch-picks.json) and the drafts folder (branch
 * challenge-styles, docs/starting-sheet-drafts), checks every file against its pinned sha256, and builds the bodies.
 *
 * Written by the coding agent (Claude, a closed model by Anthropic), lane B of the overnight run of 2026-11-05. DRAFT.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const MAINTAINER_FID = 6786;
export const SLOTS = ['front', 'side', 'back'] as const;
export type Slot = (typeof SLOTS)[number];
/** The label of every picture the owner made with Midjourney (approved, closed-model-bases version 2, 2026-11-04/05). */
export const MIDJOURNEY_LABEL = "Made with Midjourney, a closed model by Midjourney, outside the site · recipe reported by its maker; it can't be re-run exactly";
/** The model id a Midjourney picture's recipe names. It must be on config/models.json, closed, maker Midjourney. */
export const MIDJOURNEY_MODEL = 'midjourney';
export const DRAFTS_SOURCE = 'docs/starting-sheet-drafts (branch challenge-styles)';

export const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export interface PinnedFile { file: string; sha256: string }
export interface BasePick { key: string; character: string; title: string; current_default: boolean; views: Partial<Record<Slot, PinnedFile>>; missing?: string }
export interface RemixPick { file: string; sha256: string; base: string; base_proposed_by_agent: string; owner_confirmed: boolean; title: string }
export interface Picks { about: string; drafts: string; bases: BasePick[]; first_remixes: RemixPick[] }

/** A design picture (src/lib/element-body.ts DesignPicture) with the fields the drafts' recipes carry beyond it. */
export interface Recipe {
  prompt: string; model: string; endpoint: string; host: string; settings: Record<string, unknown>; seed: number | null;
  request_id: string | null; cost_usd: number; made_at: string; width: number; height: number;
  references?: { sha256: string; what?: string }[]; style?: { version_id: string; title: string; text: string };
  checks: { prompt: { model: string; verdict: 'ok' | 'not run' }; host_safety_checker: 'passed' | 'not run' };
  assist: { model: string; drafted: string[]; source?: string } | null;
  credit?: string[];
}
export interface Picture { url: string; sha256: string; recipe: Recipe }
export interface Body {
  title: string; text: string; samples: Picture[]; views: Partial<Record<Slot, Picture>>; by_name: string | null;
  by_name_source: null; assist: { model: string; drafted: string[]; source?: string } | null; role: 'maintainer'; style: null;
}

export const readPicks = (file: string): Picks => JSON.parse(readFileSync(file, 'utf8')) as Picks;

/** The bytes of a pinned file, refused if its sha256 changed. */
export function pinned(drafts: string, p: PinnedFile): Buffer {
  const b = readFileSync(path.join(drafts, p.file));
  const s = sha(b);
  if (s !== p.sha256) throw new Error(`${p.file}: sha256 is ${s}, not the pinned ${p.sha256}: refused`);
  return b;
}

type LedgerCall = { file?: string; sha256?: string; kind?: string; recipe?: Recipe; char?: string };
export function readLedger(drafts: string): Map<string, LedgerCall> {
  const l = JSON.parse(readFileSync(path.join(drafts, 'directions/ledger.json'), 'utf8')) as { calls: LedgerCall[] };
  return new Map(l.calls.filter((c) => c.kind === 'image' && c.file).map((c) => [c.file!, c]));
}

/** What a recipe lacks before it can be published (empty when complete). */
export function recipeProblems(r: Partial<Recipe> | undefined): string[] {
  if (!r) return ['no recipe in the ledger'];
  const p: string[] = [];
  for (const k of ['prompt', 'model', 'endpoint', 'host', 'made_at'] as const) if (typeof r[k] !== 'string' || !r[k]) p.push(`${k} missing`);
  if (!r.settings || typeof r.settings !== 'object') p.push('settings missing');
  if (typeof r.cost_usd !== 'number') p.push('cost_usd missing');
  if (!r.width || !r.height) p.push('width/height missing');
  if (!('request_id' in r)) p.push('request_id missing');
  if (!r.checks?.prompt || !r.checks.host_safety_checker) p.push('checks missing');
  if (!('assist' in r)) p.push('assist missing');
  return p;
}

/** The sheet's text: the character descriptor of the front's prompt (the paragraph that describes the person). */
export function descriptor(prompt: string): string {
  const paras = prompt.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const d = paras.find((x) => /^(a|an) /i.test(x));
  if (!d) throw new Error('no character descriptor paragraph in the front\'s prompt');
  return d;
}

/** The style a base's views were made in isn't published: each view's recipe says so instead of a version id. */
const UNPUBLISHED_STYLE = `not published as a style on the site (its text is here; ${DRAFTS_SOURCE}, directions/plan.json)`;

/** One base's planned sheet: its pictures (bytes and recipe) and its body, once the urls are known. */
export interface BasePlan { pick: BasePick; pics: { slot: Slot; bytes: Buffer; sha256: string; recipe: Recipe; file: string }[]; text: string; missing: Slot[]; problems: string[]; body: (urls: Partial<Record<Slot, string>>) => Body }
export function planBase(drafts: string, ledger: Map<string, LedgerCall>, pick: BasePick, byName: string, textMax = 600): BasePlan {
  const problems: string[] = [];
  const pics: BasePlan['pics'] = [];
  for (const slot of SLOTS) {
    const f = pick.views[slot];
    if (!f) continue;
    const call = ledger.get(f.file);
    if (!call) { problems.push(`${f.file}: not in the drafts' ledger`); continue; }
    if (call.sha256 !== f.sha256) problems.push(`${f.file}: the ledger's sha256 is not the pinned one`);
    let bytes: Buffer;
    try { bytes = pinned(drafts, f); } catch (e) { problems.push((e as Error).message); continue; }
    const rp = recipeProblems(call.recipe);
    if (rp.length) problems.push(`${f.file}: recipe incomplete (${rp.join(', ')})`);
    const recipe = { ...call.recipe!, ...(call.recipe?.style ? { style: { ...call.recipe.style, version_id: UNPUBLISHED_STYLE } } : {}) };
    pics.push({ slot, bytes, sha256: f.sha256, recipe, file: f.file });
  }
  if (!pick.views.front) problems.push('no front view');
  let text = '';
  const front = pics.find((p) => p.slot === 'front');
  if (front) {
    try { text = descriptor(front.recipe.prompt); } catch (e) { problems.push((e as Error).message); }
    if (text.length > textMax) problems.push(`the sheet's text is ${text.length} characters, over ${textMax}`);
  }
  const missing = SLOTS.filter((s) => !pick.views[s]);
  const body = (urls: Partial<Record<Slot, string>>): Body => ({
    title: pick.title,
    text,
    samples: [],
    views: Object.fromEntries(pics.map((p) => [p.slot, { url: urls[p.slot] ?? '', sha256: p.sha256, recipe: p.recipe }])),
    by_name: byName,
    by_name_source: null,
    role: 'maintainer',
    assist: { model: 'claude-coding-agent', drafted: ['character descriptor', 'view prompts'], source: `${DRAFTS_SOURCE}, directions/ledger.json` },
    style: null,
  });
  return { pick, pics, text, missing, problems, body };
}

/** One first remix's planned sheet: the owner's Midjourney picture as its front view, converted to JPEG by the caller. */
export interface MjRecipe { file: string; sha256: string; original_filename?: string; size?: [number, number]; character: string; made_by: string; label: string; from_the_file: { prompt: string; parameters: string; job_id: string; author?: string; created: string }; references: { what_they_are?: string; style_references_in_parameters?: string[]; profiles_in_parameters?: string[]; style_reference_identified?: Record<string, string> }; publishable: string; muse_agent_added?: string }
export function readRemixRecipes(drafts: string): Map<string, MjRecipe> {
  const all = JSON.parse(readFileSync(path.join(drafts, 'first-remixes/recipes.json'), 'utf8')) as MjRecipe[];
  return new Map(all.map((r) => [r.file, r]));
}

export function remixProblems(pick: RemixPick, r: MjRecipe | undefined, bases: Picks['bases']): string[] {
  const p: string[] = [];
  if (!r) return ['not in first-remixes/recipes.json'];
  if (r.sha256 !== pick.sha256) p.push('recipes.json\'s sha256 is not the pinned one');
  if (!/^yes\b/i.test(r.publishable)) p.push(`not publishable (recipes.json: "${r.publishable}")`);
  if (r.label !== MIDJOURNEY_LABEL) p.push('its label is not the approved Midjourney label');
  const base = bases.find((b) => b.key === pick.base);
  if (!base) p.push(`base ${pick.base}: not one of the picked bases`);
  else if (base.character !== r.character.toLowerCase()) p.push(`base ${pick.base} is ${base.character}'s, the picture is ${r.character}'s`);
  if (!pick.owner_confirmed) p.push(`its base (${pick.base}) is the agent's proposal; the owner confirms it (owner_confirmed: true in the picks) before --apply`);
  if (!r.from_the_file?.prompt || !r.from_the_file.parameters || !r.from_the_file.job_id || !r.from_the_file.created) p.push('prompt, parameters, job id or date missing');
  return p;
}

/** The recipe of a first remix, as its maker reported it (self-reported; the site can't check or re-run it). */
export function remixRecipe(r: MjRecipe, converted: { sha256: string; width: number; height: number }, baseFront: { sha256: string; key: string }): Recipe {
  const params = r.from_the_file.parameters;
  const version = /--v\s+([\d.]+)/.exec(params)?.[1] ?? null;
  const seed = /--seed\s+(\d+)/.exec(params)?.[1];
  const refs = r.references ?? {};
  return {
    prompt: r.from_the_file.prompt,
    model: MIDJOURNEY_MODEL,
    endpoint: `Midjourney${version ? ` v${version}` : ''}, outside the site`,
    host: 'Midjourney (outside the site, the owner\'s own account)',
    settings: {
      label: MIDJOURNEY_LABEL,
      self_reported: true,
      parameters: params,
      version,
      job_id: r.from_the_file.job_id,
      made_by: r.made_by,
      references_reported: {
        style_references: (refs.style_references_in_parameters ?? []).map((u) => ({ url: u, what: refs.style_reference_identified?.[u] ?? refs.what_they_are ?? 'not reported' })),
        profiles: (refs.profiles_in_parameters ?? []).map((x) => ({ profile: x, what: refs.what_they_are ?? 'not reported' })),
      },
      remixes_base: { key: baseFront.key, front_sha256: baseFront.sha256, note: 'which base it remixes: confirmed by the owner in the launch picks' },
      original: { file: r.original_filename ?? null, sha256: r.sha256, size: r.size ?? null },
      converted: { from: 'image/png', sha256: r.sha256, to: 'jpeg', quality: 92, note: 'converted for the site; no model', jpeg_sha256: converted.sha256 },
      cost: 'made on the owner\'s paid Midjourney plan; no per-picture cost reported',
    },
    seed: seed ? Number(seed) : null,
    request_id: r.from_the_file.job_id,
    cost_usd: 0,
    made_at: new Date(r.from_the_file.created).toISOString(),
    width: converted.width,
    height: converted.height,
    checks: { prompt: { model: 'none', verdict: 'not run' }, host_safety_checker: 'not run' },
    assist: null,
  };
}

/**
 * The gates before anything is written, as one pure function (tested): --apply needs --confirm-owner-go; the challenge
 * must still be private (bases and first remixes go up after the launch PR is live and before CHALLENGE.public is
 * turned on; this replaces seed-designs' "refuses from CHALLENGE.dates.opens"); closed-model bases wait for
 * CHALLENGE.closedBasesAllowed (closedBaseRefusal, given here as its result per base).
 */
export function applyGate(o: { apply: boolean; confirmed: boolean; isPublic: boolean; refusals: string[] }): string[] {
  const out: string[] = [];
  if (!o.apply) return out;
  if (!o.confirmed) out.push('--apply needs --confirm-owner-go (the owner\'s go)');
  if (o.isPublic) out.push('CHALLENGE.public is on: bases and first remixes go up while the challenge is still admin-only (after the launch PR is live, before the flip)');
  out.push(...o.refusals);
  return out;
}
