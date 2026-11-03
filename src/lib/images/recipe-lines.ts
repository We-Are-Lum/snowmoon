import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IMAGES } from '../config';

/**
 * "How it was made", one line at a time, read from a picture's own recipe (owner, 2026-11-01: the starting sheets'
 * pictures were made outside the site, so no line may be fixed text). Every picture made on the site gives exactly the
 * words the design page printed before (scripts/test-recipe-lines.ts checks that); a picture made elsewhere gets lines
 * that say what its recipe says. Every line's wording is the owner's (approved as written, 2026-11-02).
 */

/** The recipe fields these lines read (a sheet's or style's picture; DesignPicture['recipe'] is one). */
export interface RecipeForLines {
  model: string;
  endpoint: string;
  host: string;
  settings?: Record<string, unknown>;
  references?: { sha256: string; what?: string }[];
  checks?: { prompt?: { model?: string; verdict?: string } | null; host_safety_checker?: string | null } | null;
  assist?: { model: string; drafted: string[]; source?: string } | null;
}

type ModelEntry = { id: string; name?: string; maker?: string; license?: string; open_weights?: boolean };
let models: ModelEntry[] | null = null;
function modelList(): ModelEntry[] {
  models ??= (JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'models.json'), 'utf8')) as { models: ModelEntry[] }).models;
  return models;
}

/** The site's own names first (as the page always printed them), then the model list's; else the id itself. */
export function modelName(id: string): string {
  if (id === IMAGES.model.id) return IMAGES.model.name;
  if (id === IMAGES.editModel.id) return IMAGES.editModel.name;
  const base = id.replace(/-edit$/, '');
  const m = modelList().find((x) => x.id === id || x.id === base);
  if (m?.name) return m.name;
  if (base === 'flux2-klein-4b') return IMAGES.editModel.name;
  return id;
}

/** "open weights, Apache-2.0", or "a closed model by <maker>", from the model list. */
export function modelTerms(id: string): string {
  const base = id.replace(/-edit$/, '');
  const m = modelList().find((x) => x.id === id || x.id === base);
  if (!m) return 'not on the model list';
  if (m.open_weights === false) return `a closed model${m.maker ? ` by ${m.maker}` : ''}`;
  return `open weights, ${m.license ?? 'licence not recorded'}`;
}

/**
 * Whether the model list marks this model closed (open_weights false), and its maker. A model not on the list is
 * neither open nor closed here (null): check:principles P3b keeps every model in use on the list.
 */
export function closedModel(id: string): { closed: boolean; maker: string | null } | null {
  const base = id.replace(/-edit$/, '');
  const m = modelList().find((x) => x.id === id || x.id === base);
  if (!m) return null;
  return { closed: m.open_weights === false, maker: m.maker ?? null };
}

const isLocal = (host: string) => /^local\b/i.test(host);

/** The model line's words before the seed: "<name> (<id>), open weights, Apache-2.0, on <host>, endpoint " + the endpoint. */
export function modelLine(r: RecipeForLines): { lead: string; endpoint: string | null } {
  const head = `${modelName(r.model)} (${r.model}), ${modelTerms(r.model)}`;
  if (isLocal(r.host)) return { lead: `${head}, run locally (${r.endpoint.replace(/^local:\s*/, '')}) on ${r.host.replace(/^local\s*/i, '').replace(/^\((.*)\)$/, '$1') || 'a local computer'}.`, endpoint: null };
  return { lead: `${head}, on ${r.host}, endpoint `, endpoint: r.endpoint };
}

const guardName = (m: string) => m.replace(/^openai\//, '');

/** The checks the recipe records, and only those. */
export function checksLine(r: RecipeForLines): string {
  const prompt = r.checks?.prompt?.verdict === 'ok' && r.checks.prompt.model && r.checks.prompt.model !== 'none' ? guardName(r.checks.prompt.model) : null;
  const host = r.checks?.host_safety_checker === 'passed';
  // A closed model's picture (owner, 2026-11-04): its maker's own filters may have run, but nothing records them.
  if (prompt && closedModel(r.model)?.closed) return `Checked by ${prompt}; made by a closed model whose own safety filters we can't see.`; // the owner's wording (approved 2026-11-04)
  if (prompt && host) return `Checked by ${prompt} and the host's safety checker.`;
  if (prompt) return `Checked by ${prompt}; no safety checker ran.`; // the owner's wording (approved 2026-11-02)
  if (host) return 'Checked by the host\'s safety checker; the site\'s prompt check did not run.'; // the owner's wording (approved 2026-11-02)
  return 'Made outside the site; no prompt check or safety checker ran.'; // the owner's wording (approved 2026-11-02)
}

/** Is everything the image page's fixed sentence claims recorded in these checks? */
export function bothChecksRan(checks: unknown): boolean {
  const c = (checks ?? {}) as RecipeForLines['checks'];
  return c?.prompt?.verdict === 'ok' && Boolean(c.prompt.model) && c.prompt.model !== 'none' && c.host_safety_checker === 'passed';
}

/**
 * What the picture was made from. "Made from the front view." only when its reference is this design's front view;
 * otherwise the recipe's own words (a reference's `what`, a conversion, a crop). Empty when it was made from text alone.
 */
export function madeFromLine(r: RecipeForLines, frontSha256: string | null, isFront: boolean): string {
  const parts: string[] = [];
  const refs = r.references ?? [];
  if (refs.length) {
    if (!isFront && frontSha256 && refs.length === 1 && refs[0].sha256 === frontSha256) parts.push('Made from the front view.');
    else parts.push(...refs.map((x) => `Made from ${x.what ?? 'a reference picture'} (sha256 ${x.sha256.slice(0, 12)}…).`)); // the owner's wording (approved 2026-11-02)
  }
  const s = r.settings ?? {};
  const conv = s.converted as { from?: string; sha256?: string; to?: string } | undefined;
  if (conv?.sha256) parts.push(`Converted from ${String(conv.from ?? '').toUpperCase()} (sha256 ${conv.sha256.slice(0, 12)}…) to ${String(conv.to ?? '').toUpperCase()} for the site; no model.`); // the owner's wording (approved 2026-11-02)
  if (typeof s.derived === 'string') parts.push(`${s.derived.replace(/\.?$/, '.')}`);
  return parts.join(' ');
}

/** Who drafted which words of the prompt, from the recipe's assist. */
export function draftedLine(r: RecipeForLines): string {
  const a = r.assist;
  if (!a) return '';
  const who = a.model === 'claude-coding-agent' ? 'the coding agent' : a.model;
  if (a.drafted.length === 1 && a.drafted[0] === 'sample subject or view line') return `The fixed subject line was drafted by ${who}.`;
  const list = a.drafted.length > 1 ? `${a.drafted.slice(0, -1).join(', ')} and ${a.drafted[a.drafted.length - 1]}` : a.drafted[0];
  return `The ${list} ${a.drafted.length > 1 ? 'were' : 'was'} drafted by ${who}.`; // the owner's wording (approved 2026-11-02)
}

/** The whole "how it was made" line for one picture of a design, as text runs (mono: shown in the code font). */
export function howMade(
  r: RecipeForLines & { seed: number | null; request_id: string | null; cost_usd: number; made_at: string },
  sha256: string,
  frontSha256: string | null,
  isFront: boolean,
): { text: string; mono?: boolean }[] {
  const m = modelLine(r);
  const runs: { text: string; mono?: boolean }[] = [{ text: m.lead }];
  if (m.endpoint !== null) runs.push({ text: m.endpoint, mono: true }, { text: '.' });
  const from = madeFromLine(r, frontSha256, isFront);
  const drafted = draftedLine(r);
  runs.push({ text: ` Seed ${r.seed ?? 'not recorded'}, request ${r.request_id ?? 'not recorded'}, cost $${r.cost_usd.toFixed(4)}, ${r.made_at.slice(0, 10)}. ${from ? `${from} ` : ''}${checksLine(r)} ${drafted ? `${drafted} ` : ''}File sha256 ` });
  runs.push({ text: sha256, mono: true }, { text: '.' });
  return runs;
}
