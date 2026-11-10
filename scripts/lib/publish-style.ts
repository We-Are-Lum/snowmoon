import type postgres from 'postgres';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CHALLENGE, IMAGES, WORK_ID } from '../../src/lib/config';
import { BASE_STYLE, OFFERED_STYLES, type OfferedStyle } from '../../src/lib/challenge/base-style';
import { makeDesign, styleNameTaken } from '../../src/lib/images/designs';
import type { DesignBody, DesignPicture } from '../../src/lib/element-body';
import { blockedName } from '../../src/lib/images/rules';
import { MAINTAINER_FID } from './launch-publish';

/**
 * Publishing the challenge's offered styles (src/lib/challenge/base-style.ts) as styles of FID 6786's (the maintainer,
 * as the bases are), through the site's own makeDesign. Since 2026-11-10 (owner, after P1c failed on production for
 * three styles published with no pictures) a style is published only WITH 2 to 4 sample pictures
 * (IMAGES.designs.samplesMin/samplesMax, as the design form), each with its full recipe, from a manifest
 * (readManifest below); and a style already published without samples gets them as a new version of its own
 * (makeDesign's 'version' mode, as the design form adds a version: element_versions is append-only, so the old version
 * stays as it is). The plan reads only; apply uploads the pictures to the site's storage (putPublic) and writes one
 * version. Shared by scripts/publish-style.ts and its tests (scripts/test-publish-style.ts, scripts/test-model-choice.ts
 * C19 and C24), which run it on a local database with a stand-in for the storage.
 */
type Sql = postgres.Sql;
export interface StylePlan {
  exists: { versionId: string; elementId: string; sameText: boolean; versionNo: number; samples: number; byFid: number; body: Record<string, unknown> } | null;
  nameTaken: boolean;
  /** Each base (CHALLENGE.bases), and whether its front's recipe records exactly this style's text. */
  bases: { character: string; versionId: string; matches: boolean | null }[];
  body: Record<string, unknown>;
}

export const styleBody = (byName = 'naaate', style: OfferedStyle = BASE_STYLE, samples: DesignPicture[] = []) => ({ title: style.title, text: style.text, samples, views: {}, by_name: byName, by_name_source: 'relay', assist: null, role: 'maintainer', style: null });

export async function planStyle(sql: Sql | postgres.TransactionSql, style: OfferedStyle = BASE_STYLE): Promise<StylePlan> {
  const s = sql as unknown as Sql;
  const [ex] = await s<{ version_id: string; element_id: string; text: string; version_no: number; by_fid: number; body: Record<string, unknown> }[]>`
    select v.id::text as version_id, e.id::text as element_id, coalesce(v.body->>'text', '') as text, v.version_no, e.created_by_fid::int as by_fid, v.body
    from studio.entities en join studio.elements e on e.entity_id = en.id join studio.element_versions v on v.element_id = e.id
    where en.work_id = ${WORK_ID} and en.kind = 'style' and lower(en.name) = lower(${style.title}) and e.status = 'published'
    order by v.version_no desc limit 1`;
  const bases: StylePlan['bases'] = [];
  for (const c of CHALLENGE.characters) {
    for (const id of (CHALLENGE.bases as Record<string, string[]>)[c] ?? []) {
      const [v] = await s<{ t: string | null }[]>`select body->'views'->'front'->'recipe'->'style'->>'text' as t from studio.element_versions where id::text = ${id}`;
      bases.push({ character: c, versionId: id, matches: v ? (v.t ?? '').trim() === style.text : null });
    }
  }
  const samples = (b: Record<string, unknown>) => (Array.isArray(b.samples) ? b.samples.length : 0);
  return { exists: ex ? { versionId: ex.version_id, elementId: ex.element_id, sameText: ex.text.trim() === style.text, versionNo: Number(ex.version_no), samples: samples(ex.body ?? {}), byFid: Number(ex.by_fid), body: ex.body ?? {} } : null, nameTaken: await styleNameTaken(s as never, style.title), bases, body: styleBody('naaate', style) };
}

/** Refused: a style is never written without its sample pictures (owner, 2026-11-10). */
export class StyleRefused extends Error {}

/** One sample picture ready to publish: its bytes and its recipe, checked (readManifest). */
export interface ReadySample {
  file: string;
  bytes: Buffer;
  sha256: string;
  recipe: DesignPicture['recipe'];
}

/** What a style's pictures must be, whatever path they came by. Returns the problems (none: fine). */
export function sampleProblems(style: OfferedStyle, samples: readonly ReadySample[]): string[] {
  const p: string[] = [];
  const { samplesMin, samplesMax } = IMAGES.designs;
  if (samples.length < samplesMin || samples.length > samplesMax) p.push(`"${style.title}": ${samples.length} sample pictures; a style is published with ${samplesMin} to ${samplesMax}, each with its recipe`);
  if (new Set(samples.map((x) => x.sha256)).size !== samples.length) p.push(`"${style.title}": the same picture twice`);
  for (const x of samples) {
    const r = x.recipe;
    const at = `"${style.title}" ${path.basename(x.file)}`;
    if (createHash('sha256').update(x.bytes).digest('hex') !== x.sha256) p.push(`${at}: the file's sha256 isn't the one given`);
    if (!r?.prompt?.trim() || !r.model || !r.endpoint || !r.host || !r.made_at || !(r.width > 0) || !(r.height > 0) || typeof r.cost_usd !== 'number' || !r.checks) p.push(`${at}: the recipe needs prompt, model, endpoint, host, made_at, width, height, cost_usd and checks`);
    else if (!r.prompt.includes(style.text)) p.push(`${at}: its prompt doesn't carry the style's text, so it doesn't show what the text does`);
    if (r?.prompt && blockedName(r.prompt)) p.push(`${at}: the prompt names someone on the blocked list`);
    if (r?.prompt && NAMES.test(r.prompt)) p.push(`${at}: the prompt names an artist, studio or film ("${r.prompt.match(NAMES)![0]}")`);
  }
  if (blockedName(`${style.title} ${style.text}`) || NAMES.test(`${style.title} ${style.text}`)) p.push(`"${style.title}": its name or text names someone or someone else's work`);
  return p;
}
/** Artists, studios and films the style test's words must not name (as scripts/test-model-choice.ts C24). */
export const NAMES = /\b(studio ghibli|ghibli|disney|pixar|dreamworks|marvel|dc comics|in the style of|kirby|lichtenstein|moebius|herg[ée]|miyazaki|blade runner|star wars)\b/i;

/** The pictures go to the site's storage first (the design route's order); `put` is the site's putPublic, or a test's stand-in. */
type Put = (sha256: string, bytes: Buffer, contentType: string) => Promise<string>;
const toPicture = async (x: ReadySample, put: Put): Promise<DesignPicture> => ({ url: await put(x.sha256, x.bytes, 'image/jpeg'), sha256: x.sha256, recipe: x.recipe });

/** A new style, with its samples. Refused without 2 to 4 good samples, and when the name exists. */
export async function applyStyle(sql: Sql, byName = 'naaate', style: OfferedStyle = BASE_STYLE, samples: readonly ReadySample[] = [], put?: Put): Promise<{ versionId: string; elementId: string }> {
  const problems = sampleProblems(style, samples);
  if (problems.length) throw new StyleRefused(problems.join('; '));
  if (!put) throw new StyleRefused('no storage to put the pictures in');
  const pictures = [];
  for (const x of samples) pictures.push(await toPicture(x, put));
  return makeDesign(sql as never, { fid: MAINTAINER_FID, mode: 'create', kind: 'style', styleName: style.title, body: styleBody(byName, style, pictures) as never });
}

/**
 * Samples for a style already published without any (owner, 2026-11-10): a new version of the same style, with the
 * same title, text and byline and these pictures, as its maker adds a version on the design form (makeDesign 'version').
 * The version without samples stays as it was (append-only). Refused when the style isn't published, has samples
 * already, its text differs from the offered one, or it isn't the maintainer's.
 */
export async function addSamples(sql: Sql, style: OfferedStyle, samples: readonly ReadySample[], put: Put): Promise<{ versionId: string; elementId: string; versionNo: number }> {
  const plan = await planStyle(sql, style);
  const refusal = addRefusal(style, plan);
  if (refusal) throw new StyleRefused(refusal);
  const problems = sampleProblems(style, samples);
  if (problems.length) throw new StyleRefused(problems.join('; '));
  const pictures = [];
  for (const x of samples) pictures.push(await toPicture(x, put));
  const prev = plan.exists!.body as Partial<DesignBody> & Record<string, unknown>;
  const body = { ...prev, title: style.title, text: style.text, samples: pictures, views: {} };
  const out = await makeDesign(sql as never, { fid: MAINTAINER_FID, mode: 'version', kind: 'style', fromVersionId: plan.exists!.versionId, body: body as never });
  return { ...out, versionNo: plan.exists!.versionNo + 1 };
}
/** Why samples can't be added to this style now, or null. */
export function addRefusal(style: OfferedStyle, plan: StylePlan): string | null {
  if (!plan.exists) return `"${style.title}" isn't published: publish it with its samples instead`;
  if (plan.exists.samples > 0) return `"${style.title}" already has ${plan.exists.samples} sample pictures (version ${plan.exists.versionNo}); nothing to add`;
  if (!plan.exists.sameText) return `"${style.title}"'s published text isn't the offered one; not adding samples to it`;
  if (plan.exists.byFid !== MAINTAINER_FID) return `"${style.title}" isn't the maintainer's (FID ${MAINTAINER_FID}); only its maker can add a version`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// The manifest (owner, 2026-11-10): for each style, 2 to 4 picture files and their recipes. A sample gives either its
// whole recipe, or a style-test ledger to read it from (docs/starting-sheet-drafts/style-test-2026-11-08/ledger.json):
//
// {
//   "styles": {
//     "Comic book": [
//       { "file": "/abs/path/comic-book-zei-gemini.jpg", "sha256": "d3dd…", "ledger": "docs/…/ledger.json" },
//       { "file": "/abs/path/x.jpg", "sha256": "…", "recipe": { "prompt": "…", "model": "gpt-image-2.5-sunburst",
//         "maker": "OpenAI", "endpoint": "openai/gpt-image-2.5-sunburst", "host": "Vercel AI Gateway",
//         "settings": {…}, "seed": null, "request_id": "gen_…", "cost_usd": 0.0479, "made_at": "2026-11-09T01:33:51Z",
//         "width": 1024, "height": 576, "references": [{ "sha256": "…", "what": "…" }],
//         "checks": { "prompt": { "model": "gpt-oss-safeguard-20b", "verdict": "ok" }, "host_safety_checker": "not run" },
//         "assist": { "model": "claude-coding-agent", "drafted": ["sample prompt"], "source": "…" } } }
//     ]
//   }
// }
// ---------------------------------------------------------------------------------------------------------------

export interface ManifestSample {
  file: string;
  sha256: string;
  /** The whole recipe; or `ledger` to read it from a style-test ledger (the file's name is looked up there). */
  recipe?: DesignPicture['recipe'] & { maker?: string };
  ledger?: string;
}
export interface Manifest { styles: Record<string, ManifestSample[]> }

/** The model allowlist's id for an endpoint the style test called, and its maker (config/models.json). */
const MODEL_BY_ENDPOINT: Record<string, string> = {
  'fal-ai/flux-2/klein/4b/edit': IMAGES.editModel.id,
  'openai/gpt-image-2.5-sunburst': 'gpt-image-2.5-sunburst',
  'google/gemini-3.1-flash-image': 'gemini-3.1-flash-image',
  'fal-ai/qwen-image-edit-plus': 'qwen-image-edit-2509',
};
type ModelRow = { id: string; open_weights: boolean; maker?: string };
const allowlist = (root: string): ModelRow[] => (JSON.parse(readFileSync(path.join(root, 'config/models.json'), 'utf8')) as { models: ModelRow[] }).models;
const listed = (root: string, id: string) => allowlist(root).find((m) => m.id === id || m.id === id.replace(/-edit$/, ''));

const callName = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);

/** A picture's recipe from the style test's ledger (docs/starting-sheet-drafts/style-test-2026-11-08/ledger.json). */
export function recipeFromLedger(ledger: { prompts: Record<string, string>; refs: Record<string, { sha256: string; version?: string }>; calls: Record<string, unknown>[] }, file: string, ledgerPath: string): DesignPicture['recipe'] | string {
  const c = ledger.calls.find((x) => x.kind === 'picture' && x.file === file && x.status === 'ok') as Record<string, unknown> | undefined;
  if (!c) return `${file}: not in the ledger as a picture that was made`;
  const prompt = ledger.prompts[String(c.prompt_sha256)];
  const model = MODEL_BY_ENDPOINT[String(c.endpoint)];
  if (!prompt || !model) return `${file}: the ledger has no prompt or no known model for it`;
  const guard = ledger.calls.find((x) => x.kind === 'guard' && x.prompt_sha256 === c.prompt_sha256 && x.status === 'ok') as Record<string, unknown> | undefined;
  const [w, h] = String(c.out_size ?? '1024x576').split('x').map(Number);
  const ref = ledger.refs[String(c.character)];
  return {
    // The ledger's settings, with how the picture was fitted to 1024 x 576 and the model's original, when it says.
    prompt, model, endpoint: String(c.endpoint), host: String(c.host),
    settings: { ...((c.settings as Record<string, unknown>) ?? {}), ...(c.crop ? { crop: c.crop } : {}), ...(c.original_sha256 ? { original_sha256: c.original_sha256, original_size: c.original_size } : {}) },
    seed: typeof c.seed === 'number' ? c.seed : null, request_id: (c.request_id as string) ?? null, cost_usd: Number(c.cost_usd), made_at: String(c.at), width: w, height: h,
    ...(ref ? { references: [{ sha256: ref.sha256, what: `${callName(String(c.character))}'s base front${ref.version ? ` (version ${ref.version})` : ''}` }] } : {}),
    checks: { prompt: { model: 'gpt-oss-safeguard-20b', verdict: guard ? 'ok' : 'not run' }, host_safety_checker: 'not run' },
    assist: { model: 'claude-coding-agent', drafted: ['sample prompt'], source: `${ledgerPath} (the style test of 2026-11-08)` },
  };
}

/** Reads and checks a manifest: every file read, its sha256 and size checked, every recipe complete. Reads only. */
export async function readManifest(file: string, root: string, styles: readonly OfferedStyle[] = OFFERED_STYLES): Promise<{ ready: Map<string, ReadySample[]>; problems: string[] }> {
  const problems: string[] = [];
  const ready = new Map<string, ReadySample[]>();
  let m: Manifest;
  try {
    m = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
  } catch (e) {
    return { ready, problems: [`the manifest can't be read: ${(e as Error).message}`] };
  }
  const ledgers = new Map<string, Parameters<typeof recipeFromLedger>[0]>();
  for (const [title, list] of Object.entries(m.styles ?? {})) {
    const style = styles.find((s) => s.title === title);
    if (!style) { problems.push(`"${title}" isn't one of the offered styles (${styles.map((s) => s.title).join(', ')})`); continue; }
    const out: ReadySample[] = [];
    for (const x of Array.isArray(list) ? list : []) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(path.isAbsolute(x.file) ? x.file : path.join(root, x.file));
      } catch {
        problems.push(`"${title}": can't read ${x.file}`);
        continue;
      }
      let recipe = x.recipe as (DesignPicture['recipe'] & { maker?: string }) | undefined;
      if (!recipe && x.ledger) {
        const lp = path.isAbsolute(x.ledger) ? x.ledger : path.join(root, x.ledger);
        if (!ledgers.has(lp)) {
          try { ledgers.set(lp, JSON.parse(readFileSync(lp, 'utf8'))); } catch { problems.push(`"${title}": can't read the ledger ${x.ledger}`); continue; }
        }
        const r = recipeFromLedger(ledgers.get(lp)!, path.basename(x.file), x.ledger);
        if (typeof r === 'string') { problems.push(`"${title}": ${r}`); continue; }
        const lc = ledgers.get(lp)!.calls.find((c) => c.file === path.basename(x.file) && c.kind === 'picture') as { sha256?: string } | undefined;
        if (lc?.sha256 && lc.sha256 !== x.sha256) problems.push(`"${title}" ${x.file}: the ledger records sha256 ${lc.sha256}, not ${x.sha256} (use the full-size picture, not the 560 px copy)`);
        recipe = r;
      }
      if (!recipe) { problems.push(`"${title}" ${x.file}: no recipe and no ledger`); continue; }
      // The maker and the label come from the model list (the site shows "a closed model by …" from it): checked, not stored.
      const row = listed(root, recipe.model);
      if (!row) problems.push(`"${title}" ${x.file}: model ${recipe.model} isn't on config/models.json`);
      else if (recipe.maker && row.maker && recipe.maker !== row.maker) problems.push(`"${title}" ${x.file}: maker ${recipe.maker}, but config/models.json says ${row.maker}`);
      const meta = await sharp(bytes).metadata().catch(() => null);
      if (!meta || meta.format !== 'jpeg') problems.push(`"${title}" ${x.file}: not a JPEG`);
      else if (meta.width !== recipe.width || meta.height !== recipe.height) problems.push(`"${title}" ${x.file}: ${meta.width} x ${meta.height}, but the recipe says ${recipe.width} x ${recipe.height}`);
      const { maker: _maker, ...clean } = recipe;
      void _maker;
      out.push({ file: x.file, bytes, sha256: x.sha256, recipe: clean });
    }
    problems.push(...sampleProblems(style, out));
    ready.set(title, out);
  }
  return { ready, problems };
}
