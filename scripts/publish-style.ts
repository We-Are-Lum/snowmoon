/**
 * Publish the challenge's offered styles (src/lib/challenge/base-style.ts) WITH their sample pictures, or add sample
 * pictures to one already published without any (owner, 2026-11-10: three styles published on 2026-11-09 with no
 * pictures failed check:principles P1c, "every version of a published element has a recipe").
 * A style is written only with 2 to 4 sample pictures (IMAGES.designs.samplesMin/samplesMax, as on the design form),
 * each with its full recipe, through the site's own makeDesign: a new style ('create'), or, for a style published
 * without samples, a new version of it with the samples ('version', as its maker adds one on the design form; the old
 * version stays as it is: element_versions is append-only). The pictures go to the site's storage (putPublic) first.
 * Written by the coding agent (Claude, a closed model by Anthropic). DRAFT.
 *
 * Runs ONLY on the owner's machine, with his own env file, read in place (never copied). Dry run first:
 *
 *   npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local scripts/publish-style.ts --manifest=<file>
 *   npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local scripts/publish-style.ts --manifest=<file> --apply --confirm-owner-go
 *
 * The manifest (format in scripts/lib/publish-style.ts, readManifest): for each style title, 2 to 4 picture files, each
 * with its sha256 and its recipe (or the style-test ledger to read the recipe from). The dry run reads the files and,
 * in one read-only transaction, the database, and prints for each style what it would do: publish it with these
 * samples, add them as a new version, or refuse (and why). It writes nothing and uploads nothing. --apply refuses
 * without --confirm-owner-go, without a manifest, and when the manifest has any problem; it never publishes a style
 * without samples, never writes a style twice, and never adds samples to a style that has some.
 * Options: --db=<url> (a local test database), --name=<byline>, --only=<title>.
 */
import path from 'node:path';
import postgres from 'postgres';
import { OFFERED_STYLES } from '../src/lib/challenge/base-style';
import { addRefusal, addSamples, applyStyle, planStyle, readManifest, StyleRefused } from './lib/publish-style';

const arg = (k: string) => {
  const a = process.argv.findLast((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  return a ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : '') : null;
};
const has = (k: string) => process.argv.includes(`--${k}`);
const APPLY = has('apply');
const ROOT = path.resolve(import.meta.dirname, '..');
const url = arg('db') || process.env.STUDIO_DATABASE_URL;
if (!url) { console.error('No database: set STUDIO_DATABASE_URL or --db. Nothing done.'); process.exit(2); }
const say = (s = '') => console.log(s);
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const finish = async (code: number) => { await sql.end(); process.exit(code); };

say(`publish-style: ${APPLY ? 'APPLY' : 'DRY RUN (reads only; nothing written, nothing uploaded)'}; database ${new URL(url).hostname}`);
const only = arg('only');
const styles = OFFERED_STYLES.filter((s) => !only || s.title.toLowerCase() === only.toLowerCase());
if (!styles.length) { say(`No offered style is called "${only}". Nothing done.`); await finish(2); }
const manifestPath = arg('manifest');
const m = manifestPath ? await readManifest(path.resolve(manifestPath), ROOT, styles) : null;
if (!m) say('No --manifest: a style is published only with 2 to 4 sample pictures and their recipes, so nothing can be written without one.');
for (const p of m?.problems ?? []) say(`  PROBLEM: ${p}`);

type Step = { title: string; kind: 'create' | 'add' | 'skip'; why: string };
const steps: Step[] = [];
for (const style of styles) {
  const plan = await sql.begin('read only', (tx) => planStyle(tx, style));
  const samples = m?.ready.get(style.title) ?? [];
  const state = plan.exists ? `published, version ${plan.exists.versionNo} (${plan.exists.versionId}), ${plan.exists.samples} sample pictures, ${plan.exists.sameText ? 'same text' : 'DIFFERENT TEXT'}` : plan.nameTaken ? 'the name is taken by a style that is not published' : 'not published yet';
  say(`style "${style.title}": ${state}`);
  say(`  text: ${style.text}`);
  for (const x of samples) say(`  sample ${path.basename(x.file)}: sha256 ${x.sha256}, ${x.recipe.model} via ${x.recipe.host} (${x.recipe.endpoint}), seed ${x.recipe.seed ?? 'none'}, request ${x.recipe.request_id ?? 'none'}, $${x.recipe.cost_usd}, ${x.recipe.made_at}`);
  let step: Step;
  if (!samples.length) step = { title: style.title, kind: 'skip', why: plan.exists?.samples ? 'has samples; nothing to do' : 'no samples in the manifest: not written' };
  else if (!plan.exists && !plan.nameTaken) step = { title: style.title, kind: 'create', why: `publish it with ${samples.length} samples` };
  else if (plan.exists && !addRefusal(style, plan)) step = { title: style.title, kind: 'add', why: `add ${samples.length} samples as version ${plan.exists.versionNo + 1}` };
  else step = { title: style.title, kind: 'skip', why: plan.exists ? addRefusal(style, plan)! : 'the name is taken by a style that is not published' };
  say(`  -> ${step.kind === 'skip' ? 'SKIP' : step.kind === 'create' ? 'PUBLISH' : 'ADD SAMPLES'}: ${step.why}`);
  steps.push(step);
}
if (!APPLY) { say('Dry run: nothing written, nothing uploaded.'); await finish(0); }
if (!has('confirm-owner-go')) { say('Refusing --apply without --confirm-owner-go. Nothing done.'); await finish(3); }
if (!m) { say('Refusing --apply without --manifest. Nothing done.'); await finish(3); }
if (m!.problems.length) { say(`Refusing --apply: the manifest has ${m!.problems.length} problem(s), above. Nothing done.`); await finish(3); }
const { putPublic } = await import('../src/lib/images/store');
let refused = 0;
for (const s of steps) {
  const style = styles.find((x) => x.title === s.title)!;
  const samples = m!.ready.get(s.title) ?? [];
  try {
    if (s.kind === 'create') {
      const out = await applyStyle(sql, arg('name') || 'naaate', style, samples, putPublic);
      say(`"${s.title}": published with ${samples.length} samples, version ${out.versionId} (element ${out.elementId})`);
    } else if (s.kind === 'add') {
      const out = await addSamples(sql, style, samples, putPublic);
      say(`"${s.title}": ${samples.length} samples added as version ${out.versionNo}, ${out.versionId} (element ${out.elementId})`);
    } else if (samples.length) {
      say(`"${s.title}": refused: ${s.why}. Not written.`);
      refused++;
    }
  } catch (e) {
    if (!(e instanceof StyleRefused)) throw e;
    say(`"${s.title}": refused: ${e.message}. Not written.`);
    refused++;
  }
}
await finish(refused ? 3 : 0);
