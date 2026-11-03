/**
 * The design page's "how it was made" lines, read from each picture's recipe (owner, 2026-11-01).
 *   npm run test:recipe-lines            real-shaped recipes and planted ones
 *   npm run test:recipe-lines -- --live  also every picture of every published design on production, read in a
 *                                        read-only transaction (needs STUDIO_DATABASE_URL)
 * 1. Every picture made on the site renders exactly the text the page printed before (the old JSX is kept below and
 *    rendered beside the new, text compared).
 * 2. Planted recipes the old page misdescribed (a front made from another picture, a local render, a crop, a converted
 *    sample, a first draft with no prompt check) now get lines that say what their recipe says.
 * 3. A closed model's picture (owner, 2026-11-04) names the model and its maker and, when the prompt check ran, says
 *    "Checked by gpt-oss-safeguard-20b; made by a closed model whose own safety filters we can't see."; the open lines
 *    are unchanged (--live compares every production picture).
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
void React; // the classic JSX transform tsx uses here
import postgres from 'postgres';
import { IMAGES } from '../src/lib/config';
import type { DesignPicture } from '../src/lib/element-body';
import { SAMPLE_ASSIST } from '../src/lib/images/design-rules';
import { bothChecksRan, checksLine, closedModel, howMade } from '../src/lib/images/recipe-lines';

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `\n      ${detail}` : ''}`));
type R = DesignPicture['recipe'];
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');

/** The page's line before 2026-11-01, verbatim from src/app/references/designs/[id]/page.tsx. */
const Old = ({ p }: { p: DesignPicture }) => (
  <dd className="ip-wide">
    {p.recipe.model === IMAGES.editModel.id ? IMAGES.editModel.name : IMAGES.model.name} ({p.recipe.model}), open weights, Apache-2.0, on {p.recipe.host}, endpoint{' '}
    <span className="recipe-mono">{p.recipe.endpoint}</span>. Seed {p.recipe.seed ?? 'not recorded'}, request {p.recipe.request_id ?? 'not recorded'}, cost ${p.recipe.cost_usd.toFixed(4)},{' '}
    {p.recipe.made_at.slice(0, 10)}. {p.recipe.references?.length ? 'Made from the front view. ' : ''}Checked by gpt-oss-safeguard-20b and the host&apos;s safety checker. The fixed
    subject line was drafted by the coding agent. File sha256 <span className="recipe-mono">{p.sha256}</span>.
  </dd>
);
/** The page's line now (the same JSX as the page). */
const New = ({ p, front, isFront }: { p: DesignPicture; front: string | null; isFront: boolean }) => (
  <dd className="ip-wide">
    {howMade(p.recipe, p.sha256, front, isFront).map((run, k) => (run.mono ? <span key={k} className="recipe-mono">{run.text}</span> : <span key={k}>{run.text}</span>))}
  </dd>
);
const oldText = (p: DesignPicture) => text(renderToStaticMarkup(<Old p={p} />));
const newText = (p: DesignPicture, front: string | null, isFront: boolean) => text(renderToStaticMarkup(<New p={p} front={front} isFront={isFront} />));

// ---- 1. Real-shaped recipes: exactly as the site's sample route and publish route (recipeOf) write them ----
const guard = { model: IMAGES.guardModel, verdict: 'ok' as const };
const base = (o: Partial<R>): R => ({
  prompt: 'p', model: IMAGES.model.id, endpoint: IMAGES.model.endpoint, host: 'fal.ai',
  settings: { image_size: { width: 576, height: 768 }, num_images: 1, num_inference_steps: 8, enable_safety_checker: true, enable_prompt_expansion: false, output_format: 'jpeg', sync_mode: true },
  seed: 123456, request_id: '01a19-abc', cost_usd: 0.002212, made_at: '2026-10-14T10:00:00.000Z', width: 576, height: 768,
  checks: { prompt: guard, host_safety_checker: 'passed' }, assist: SAMPLE_ASSIST as unknown as R['assist'], ...o,
});
const front: DesignPicture = { url: 'u', sha256: 'f'.repeat(64), recipe: base({ style: { version_id: 'v', title: 'core', text: 't' } }) };
const side: DesignPicture = { url: 'u', sha256: 's'.repeat(64), recipe: base({ model: IMAGES.editModel.id, endpoint: IMAGES.editModel.endpoint, cost_usd: 0.0088474, references: [{ sha256: front.sha256 }], style: { version_id: 'v', title: 'core', text: 't' } }) };
const back: DesignPicture = { ...side, sha256: 'b'.repeat(64) };
const sample: DesignPicture = { url: 'u', sha256: 'a'.repeat(64), recipe: base({ width: 1024, height: 576, seed: null, request_id: null }) };
for (const [label, p, isFront] of [['a style sample (Z-Image Turbo)', sample, false], ['a sheet front (Z-Image Turbo)', front, true], ['a sheet side (edit, from the front)', side, false], ['a sheet back (edit, from the front)', back, false]] as const) {
  const o = oldText(p), n = newText(p, front.sha256, isFront);
  check(`site-made: ${label} renders exactly as before`, o === n, `old: ${o}\n      new: ${n}`);
}

// ---- 2. Planted recipes the old page got wrong ----
const sheetSha = '76e95dd38f75d840f10c1d387230ea746722cc1e6d93809b5a4b34eecce597d5';
const v2front: DesignPicture = { url: 'u', sha256: '7'.repeat(64), recipe: base({ model: IMAGES.editModel.id, endpoint: IMAGES.editModel.endpoint, references: [{ sha256: sheetSha, what: 'the original starting sheet (cast.json#zei-sheet)' }] }) };
const v2side: DesignPicture = { url: 'u', sha256: '8'.repeat(64), recipe: base({ model: IMAGES.editModel.id, endpoint: IMAGES.editModel.endpoint, references: [{ sha256: v2front.sha256 }] }) };
const local = { model: 'flux2-klein-4b', endpoint: 'local: mflux 0.20.0, black-forest-labs/FLUX.2-klein-4B @ e7b7dc27f91d, 4-bit', host: 'local (the maintainer\'s computer)', request_id: null, cost_usd: 0, checks: { prompt: { model: 'none', verdict: 'not run' as const }, host_safety_checker: 'not run' as const } };
const localSample: DesignPicture = { url: 'u', sha256: 'c'.repeat(64), recipe: base({ ...local, settings: { steps: 4, guidance: 1, converted: { from: 'png', sha256: 'e287b2eebcae057d3621a0e49f6370bf4656eeba849dbaeea083de0d4a870e81', to: 'jpeg', quality: 92 } }, assist: { model: 'claude-coding-agent', drafted: ['style text', 'image prompt'], source: 'content/snowmoon/recipes/images/style-test-2.json' } }) };
const crop: DesignPicture = { url: 'u', sha256: 'd'.repeat(64), recipe: base({ ...local, settings: { steps: 4, guidance: 1, derived: 'Cropped from 62f2f7ce at x 0-341, padded to 432 x 576 with the sheet\'s own background; no model' }, assist: { model: 'claude-coding-agent', drafted: ['character profile', 'image prompt', 'reference choices'] } }) };
const v1: DesignPicture = { url: 'u', sha256: 'e'.repeat(64), recipe: base({ model: IMAGES.editModel.id, endpoint: IMAGES.editModel.endpoint, references: [{ sha256: sheetSha }], checks: { prompt: { model: 'none', verdict: 'not run' }, host_safety_checker: 'passed' } }) };

const n2f = newText(v2front, v2front.sha256, true);
check('planted v2 front: the old page said "Made from the front view"', oldText(v2front).includes('Made from the front view.'));
check('planted v2 front: now it names the original sheet, not the front view', !n2f.includes('Made from the front view') && n2f.includes('Made from the original starting sheet (cast.json#zei-sheet) (sha256 76e95dd38f75…).'), n2f);
check('planted v2 front: its checks really ran, so the line stays', n2f.includes('Checked by gpt-oss-safeguard-20b and the host\'s safety checker.'));
check('planted v2 side: still "Made from the front view" (its reference is the front)', newText(v2side, v2front.sha256, false).includes('Made from the front view.'));
const nls = newText(localSample, null, false);
check('planted local sample: the old page said Z-Image Turbo, fal-style host and both checks', /^Z-Image Turbo/.test(oldText(localSample)) && oldText(localSample).includes('Checked by gpt-oss-safeguard-20b'));
check('planted local sample: now FLUX.2 [klein] 4B, run locally, no checks claimed', nls.startsWith('FLUX.2 [klein] 4B (flux2-klein-4b), open weights, Apache-2.0, run locally (mflux 0.20.0, black-forest-labs/FLUX.2-klein-4B @ e7b7dc27f91d, 4-bit) on the maintainer\'s computer.') && !nls.includes('Checked by') && nls.includes('Made outside the site; no prompt check or safety checker ran.'), nls);
check('planted local sample: the conversion is said', nls.includes('Converted from PNG (sha256 e287b2eebcae…) to JPEG for the site; no model.'), nls);
check('planted local sample: who drafted what, from its recipe', nls.includes('The style text and image prompt were drafted by the coding agent.'), nls);
const nc = newText(crop, null, true);
check('planted crop: the crop line, no checks claimed, no "front view"', nc.includes('Cropped from 62f2f7ce at x 0-341') && !nc.includes('Checked by') && !nc.includes('Made from the front view'), nc);
const nv1 = newText(v1, null, true);
check('planted first draft: only the safety checker is claimed', nv1.includes('Checked by the host\'s safety checker; the site\'s prompt check did not run.') && !nv1.includes('gpt-oss'), nv1);
check('the image page keeps its sentence only when both checks are recorded', bothChecksRan({ prompt: guard, host_safety_checker: 'passed' }) && !bothChecksRan({}) && !bothChecksRan(local.checks));

// ---- 2b. Closed models (owner, 2026-11-04): bases and references may be made by closed models, labelled as now ----
const CLOSED_LINE = 'Checked by gpt-oss-safeguard-20b; made by a closed model whose own safety filters we can\'t see.';
const gpt: DesignPicture = { url: 'u', sha256: '9'.repeat(64), recipe: base({ model: 'gpt-image-2.5-sunburst', endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway', cost_usd: 0.0467, references: [{ sha256: sheetSha, what: 'the original starting sheet (cast.json#zei-sheet)' }], checks: { prompt: guard, host_safety_checker: 'not run' } }) };
const gem: DesignPicture = { url: 'u', sha256: '6'.repeat(64), recipe: base({ model: 'gemini-3.1-flash-image', endpoint: 'google/gemini-3.1-flash-image', host: 'Vercel AI Gateway', cost_usd: 0.0677, checks: { prompt: guard, host_safety_checker: 'not run' } }) };
const ngpt = newText(gpt, null, true), ngem = newText(gem, null, true);
check('closed: the safety line for a closed model\'s picture, exactly as the owner wrote it', ngpt.includes(` ${CLOSED_LINE} `) && ngem.includes(` ${CLOSED_LINE} `), `${ngpt}\n      ${ngem}`);
check('closed: the model and its maker are named first, as now', ngpt.startsWith('GPT Image 2.5 Sunburst (gpt-image-2.5-sunburst), a closed model by OpenAI, on Vercel AI Gateway, endpoint openai/gpt-image-2.5-sunburst.') && ngem.startsWith('Gemini 3.1 Flash Image (gemini-3.1-flash-image), a closed model by Google, on Vercel AI Gateway, endpoint google/gemini-3.1-flash-image.'), `${ngpt}\n      ${ngem}`);
check('closed: no open-model claim and no "no safety checker ran" for a closed model', !/open weights|no safety checker ran/.test(ngpt + ngem));
check('closed: even with a host checker recorded, a closed model\'s picture gets the closed line', checksLine({ ...gpt.recipe, checks: { prompt: guard, host_safety_checker: 'passed' } }) === CLOSED_LINE);
check('closed: without the prompt check, a closed model\'s picture is not said to be checked', checksLine({ ...gpt.recipe, checks: { prompt: { model: 'none', verdict: 'not run' }, host_safety_checker: 'not run' } }) === 'Made outside the site; no prompt check or safety checker ran.');
check('closed: the edit model and Z-Image are open (their lines are unchanged)', closedModel(IMAGES.editModel.id)?.closed === false && closedModel(IMAGES.model.id)?.closed === false && closedModel('gpt-image-2.5-sunburst')?.closed === true && closedModel('gemini-3.1-flash-image')?.maker === 'Google' && closedModel('not-a-model') === null);
check('open: a prompt check alone on an open model still reads as before', checksLine({ ...front.recipe, checks: { prompt: guard, host_safety_checker: 'not run' } }) === 'Checked by gpt-oss-safeguard-20b; no safety checker ran.');
check('open: both checks on an open model still read as before', checksLine(front.recipe) === 'Checked by gpt-oss-safeguard-20b and the host\'s safety checker.');
// A planted mistake: the closed line on an open model's picture would change the open lines.
const planted = (r: R) => (r.model === 'z-image-turbo' ? CLOSED_LINE : checksLine(r));
check('proof: the closed line on an open model\'s picture is caught', planted(front.recipe) !== checksLine(front.recipe) && oldText(front) !== oldText(front).replace('Checked by gpt-oss-safeguard-20b and the host\'s safety checker.', CLOSED_LINE));

// ---- 3. Optional: every picture of every published design on production, read-only ----
if (process.argv.includes('--live')) {
  const url = process.env.STUDIO_DATABASE_URL;
  if (!url) failures.push('--live needs STUDIO_DATABASE_URL');
  else {
    const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
    const rows = await sql.begin('read only', (tx) => tx`select v.id, v.body from studio.element_versions v join studio.elements e on e.id = v.element_id where e.element_type = 'design'`);
    await sql.end();
    let n = 0;
    for (const r of rows) {
      const b = r.body as { samples?: DesignPicture[]; views?: Record<string, DesignPicture | undefined> };
      const pics: [DesignPicture, boolean][] = [...(b.samples ?? []).map((p) => [p, false] as [DesignPicture, boolean]), ...(['front', 'side', 'back'] as const).flatMap((k) => (b.views?.[k] ? [[b.views[k]!, k === 'front'] as [DesignPicture, boolean]] : []))];
      for (const [p, isFront] of pics) {
        n++;
        const o = oldText(p), nw = newText(p, b.views?.front?.sha256 ?? null, isFront);
        check(`production ${r.id} ${p.sha256.slice(0, 8)} renders exactly as before`, o === nw, `old: ${o}\n      new: ${nw}`);
      }
    }
    console.log(`  production: ${rows.length} design versions, ${n} pictures compared (read-only transaction)`);
  }
}

console.log(`test:recipe-lines: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
