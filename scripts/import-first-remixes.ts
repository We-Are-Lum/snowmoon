/**
 * The owner's first remixes (owner, 2026-11-04): pictures the owner makes in Midjourney from the challenge's bases,
 * each with a self-reported recipe, to be published from the owner's account as admin remixes of that base, labelled
 * "made outside the site; reported by the maker; can't be re-run exactly", each with its file's sha256. Plan:
 * docs/proposals/challenge-first-remixes.md. Template: docs/proposals/challenge-first-remix-recipe.template.json.
 *
 * With --dir: DRY RUN ONLY. This checks a folder of recipes and pictures and prints what would be written.
 * With --launch (2026-11-06, lane B): the owner's ten publishable first remixes from the drafts' recipes
 * (first-remixes/recipes.json, branch challenge-styles), dry run by default, --apply --confirm-owner-go to publish;
 * see scripts/lib/launch-first-remixes.ts for its gates.
 *
 *   npx tsx --conditions=react-server scripts/import-first-remixes.ts --dir=<folder>
 *
 * The folder holds one <name>.json recipe per picture, each naming its picture file in the same folder.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { CHALLENGE } from '../src/lib/config';
import { basesOf } from '../src/lib/challenge/rules';

export const FIRST_REMIX_LABEL = 'made outside the site; reported by the maker; can’t be re-run exactly';

export interface FirstRemixRecipe {
  /** The challenge character's slug (CHALLENGE.characters). */
  character: string;
  /** Which base it was made from: the base's design id (element or version), as in CHALLENGE.bases. */
  base: string;
  /** The picture's file name in the same folder (PNG or JPEG), as exported from the tool, unedited. */
  file: string;
  /** Its sha256 as the maker computed it (64 hex characters); must match the file. */
  sha256: string;
  /** The tool, its maker and its version, as the tool showed them (e.g. "Midjourney", "Midjourney, Inc.", "v7"). */
  tool: { name: string; maker: string; version: string };
  /** The full prompt, word for word, as submitted. */
  prompt: string;
  /** Every setting, as submitted (aspect ratio, stylize, chaos, seed, weird, raw, draft, image or style references…). */
  settings: Record<string, unknown>;
  /** What was given to the tool as a picture: the base's front (or side, back) by its sha256, and anything else. */
  inputs: { sha256: string; what: string }[];
  /** The job id and grid cell, when the tool shows them; null when it doesn't. */
  job: { id: string | null; cell: number | null };
  /** The plan it was made on (e.g. "paid, Standard"); what the tool's terms say about it is checked separately. */
  plan: string;
  /** When it was made (YYYY-MM-DD, the maker's date). */
  made_on: string;
  /** Always "self-reported": the site can't check any of it. */
  reported: 'self-reported';
}

const HEX = /^[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/** What's missing or wrong in one recipe (empty when it's complete). Pure: reads only the recipe and the bases given. */
export function recipeProblems(r: Partial<FirstRemixRecipe>, bases: (character: string) => string[] = basesOf): string[] {
  const p: string[] = [];
  if (!str(r.character) || !CHALLENGE.characters.includes(String(r.character))) p.push('character: not one of the challenge\'s characters');
  if (!str(r.base)) p.push('base: missing');
  else if (str(r.character) && !bases(String(r.character)).includes(String(r.base).toLowerCase())) p.push(`base: not ${r.character}'s base in CHALLENGE.bases (none is published yet)`);
  if (!str(r.file) || !/\.(png|jpe?g)$/i.test(String(r.file))) p.push('file: missing, or not PNG or JPEG');
  if (!str(r.sha256) || !HEX.test(String(r.sha256).toLowerCase())) p.push('sha256: missing, or not 64 hex characters');
  if (!r.tool || !str(r.tool.name) || !str(r.tool.maker) || !str(r.tool.version)) p.push('tool: name, maker and version are all needed');
  if (!str(r.prompt)) p.push('prompt: missing (the full prompt, word for word)');
  if (!r.settings || typeof r.settings !== 'object' || Object.keys(r.settings).length === 0) p.push('settings: missing (every setting as submitted)');
  if (!Array.isArray(r.inputs) || r.inputs.length === 0 || r.inputs.some((i) => !HEX.test(String(i?.sha256 ?? '').toLowerCase()) || !str(i?.what))) p.push('inputs: each picture given to the tool, by sha256 and what it is (at least the base\'s view)');
  if (!r.job || !('id' in r.job) || !('cell' in r.job)) p.push('job: id and cell (null when the tool doesn\'t show them)');
  if (!str(r.plan)) p.push('plan: missing');
  if (!str(r.made_on) || !DAY.test(String(r.made_on))) p.push('made_on: missing, or not YYYY-MM-DD');
  if (r.reported !== 'self-reported') p.push('reported: must be "self-reported"');
  return p;
}

/** The design body's front view this recipe would become (a plan; nothing is stored). */
export function plannedFront(r: FirstRemixRecipe) {
  return {
    url: '(not uploaded: publishing is not built)',
    sha256: r.sha256.toLowerCase(),
    recipe: {
      prompt: r.prompt,
      model: `${r.tool.name} ${r.tool.version}`,
      endpoint: 'outside the site',
      host: `${r.tool.maker} (outside the site)`,
      settings: { ...r.settings, self_reported: true, label: FIRST_REMIX_LABEL, job: r.job, plan: r.plan },
      seed: null,
      request_id: r.job.id,
      cost_usd: 0,
      made_at: `${r.made_on}T00:00:00.000Z`,
      width: 0,
      height: 0,
      references: r.inputs,
      checks: { prompt: { model: 'none', verdict: 'not run' as const }, host_safety_checker: 'not run' as const },
      assist: null,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--launch')) {
  // The launch's first remixes (2026-11-06): the owner's ten publishable Midjourney pictures, from the drafts' recipes.
  await import('./lib/launch-first-remixes');
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv.slice(2).find((a) => a.startsWith('--dir='))?.slice(6);
  if (process.argv.includes('--apply')) {
    console.log('Refused: --apply publishes only with --launch (the launch picks; scripts/lib/launch-first-remixes.ts). See docs/proposals/challenge-first-remixes.md for the gates.');
    process.exit(1);
  }
  if (!dir || !existsSync(dir)) {
    console.log('Usage: --dir=<folder with <name>.json recipes and their pictures>. Dry run only.');
    process.exit(1);
  }
  let bad = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const r = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Partial<FirstRemixRecipe>;
    const p = recipeProblems(r);
    if (str(r.file) && existsSync(path.join(dir, String(r.file)))) {
      const real = createHash('sha256').update(readFileSync(path.join(dir, String(r.file)))).digest('hex');
      if (real !== String(r.sha256 ?? '').toLowerCase()) p.push(`sha256: the file's is ${real}, not the one reported`);
    } else p.push('file: not found in the folder');
    if (p.length) { bad++; console.log(`${f}: NOT READY\n  - ${p.join('\n  - ')}`); continue; }
    console.log(`${f}: ready (dry run). Would publish from the owner's account as an admin remix of ${r.character}'s base ${r.base}, labelled "${FIRST_REMIX_LABEL}":`);
    console.log(JSON.stringify(plannedFront(r as FirstRemixRecipe), null, 2));
  }
  console.log(bad ? `${bad} not ready. Nothing written.` : 'Nothing written (dry run).');
}
