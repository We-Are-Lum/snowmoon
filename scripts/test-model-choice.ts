/**
 * Model choice for remixers (branch remix-model-choice, IMAGES.designs.modelChoice, off). Stand-ins only: no model is
 * called and nothing is spent. Each check runs on the real inputs and on a planted violation, which it must catch.
 *
 *   npm run test:model-choice
 *
 *  M1  the picker is hidden while the switch is off (and off a character sheet's remix), and the server offers nothing
 *      but the open default;
 *  M2  the default is the open models, listed first;
 *  M3  one model per sheet: views from two choices are refused, at the side/back and at publish;
 *  M4  closed models' own count per person (6) and own site cap ($5, inside the free cap), apart from the open 10,
 *      on an in-memory Postgres with every migration, NEXT_remix_model_choice.sql included;
 *  M5  the recipe lines: the closed label, the closed safety line and the can't-be-re-run line; open lines unchanged;
 *  M6  the safety line is the agreed wording, word for word;
 *  M7  the switch can't be on without Privacy (P6t) and each maker's notice, its consent (not the consent screen);
 *  M8  a closed call sends only the prompt and pictures, asks no prompt training of both makers and zero retention of
 *      Vertex only (as the gateway offers them), pins the provider, and reads a recorded answer's picture and cost;
 *  M9  the closed models' notice shows once per maker, not per model;
 *  M10 a new notice version shows it again, and a notice's words can't change without a new version;
 *  M11 "Don't remind me again" and the 18+ answer stay on the device: no request, no request body or route reads them;
 *  M12 the picker shows each closed model's retention label always, with the open default first (rendered);
 *  M13 the 18+ confirmation is shown with the first notice, and both buttons wait for it (rendered);
 *  M14 no closed-model pick goes through before 18+ is confirmed on that device.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import sharp from 'sharp';
import { CHALLENGE, CLOSED_IMAGES, CLOSED_PROVIDERS, IMAGES, imagesDailySpendCapUsd } from '../src/lib/config';
import { MODEL_NOTICES as NOTICES, PRIVACY } from '../src/lib/legal';
const IMAGE_WORDING_OPEN = 'The site’s open models (the default)';
import { DEFAULT_SHEET_MODEL, SHEET_MODELS, oneChoice, sheetModel, sheetModelProblems, sheetModelsOffered, type SheetModel } from '../src/lib/images/sheet-models';
import { modelChoicesFor } from '../src/lib/images/model-choice-view';
import { closedChecksLine, checksLine, howMade, modelTerms, RERUN_LINE } from '../src/lib/images/recipe-lines';
import { p6tProblems, type P6tInput } from './lib/p6t';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0;
const failed: string[] = [];
/** A check on the real inputs must pass; the same check on the planted inputs must fail. */
function proven(name: string, problems: () => string[], planted: () => string[]) {
  const real = problems();
  const plant = planted();
  const ok = real.length === 0 && plant.length > 0;
  if (ok) passed++;
  else failed.push(`${name}: ${real.length ? `real: ${real.join('; ')}` : 'the planted violation was not caught'}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${real.length ? ` (${real.join('; ')})` : ''}${plant.length ? '' : ' (plant not caught)'}`);
}
const need = (cond: boolean, what: string) => (cond ? [] : [what]);

const GPT = SHEET_MODELS.find((m) => m.id === 'gpt-image-2.5-sunburst')!;
const GEMINI = SHEET_MODELS.find((m) => m.id === 'gemini-3.1-flash-image')!;
const OPEN = SHEET_MODELS.find((m) => m.id === DEFAULT_SHEET_MODEL)!;

// --- M1: the picker hidden when the switch is off ------------------------------------------------------------
const pickerHidden = (choicesFor: typeof modelChoicesFor, offered: (on: boolean) => readonly SheetModel[]) => [
  ...need(IMAGES.designs.modelChoice === false, 'IMAGES.designs.modelChoice is committed on'),
  ...need(choicesFor('fork', 'character', false) === undefined, 'the form gets choices with the switch off'),
  ...need(choicesFor('version', 'character', true) === undefined && choicesFor('create', 'character', true) === undefined, 'a non-remix gets choices'),
  ...need(choicesFor('fork', 'location', true) === undefined && choicesFor('fork', 'style', true) === undefined, 'a place or style remix gets choices'),
  ...need(offered(false).length === 1 && offered(false)[0].id === DEFAULT_SHEET_MODEL, 'the server offers more than the open default with the switch off'),
];
const formSrc = read('src/components/design-form.tsx');
const pageSrc = read('src/app/references/designs/new/page.tsx');
proven(
  'M1 the picker is hidden while the switch is off; the server offers only the open default',
  () => [
    ...pickerHidden(modelChoicesFor, (on) => sheetModelsOffered(on)),
    ...need(sheetModel('gpt-image-2.5-sunburst', false) === null && sheetModel(undefined, false)?.id === DEFAULT_SHEET_MODEL, 'sheetModel accepts a closed id with the switch off'),
    ...need(/modelChoices=\{modelChoicesFor\(mode, kind\)\}/.test(pageSrc), 'the remix page does not take its choices from modelChoicesFor'),
    ...need(/p\.modelChoices && p\.modelChoices\.length > 1 \? p\.modelChoices : null/.test(formSrc) && /\{!style && choices && \(/.test(formSrc), 'the form shows the picker without choices'),
  ],
  () => pickerHidden((mode, kind) => modelChoicesFor(mode, kind, true), (on) => sheetModelsOffered(true || on)),
);

// --- M2: the default is open, listed first ---------------------------------------------------------------------
proven(
  'M2 the default is the open models, listed first (on and off)',
  () => [
    ...sheetModelProblems(SHEET_MODELS),
    ...sheetModelProblems(sheetModelsOffered(true, true)),
    ...need(modelChoicesFor('fork', 'character', true)?.[0]?.id === DEFAULT_SHEET_MODEL && modelChoicesFor('fork', 'character', true)?.[0]?.open === true, 'the form\'s first choice is not the open default'),
    ...need(modelTerms(OPEN.front.id) === 'open weights, Apache-2.0' && modelTerms(OPEN.views.id) === 'open weights, Apache-2.0', 'the open default is not labelled open weights, Apache-2.0'),
    ...need(modelTerms(GPT.front.id) === 'a closed model by OpenAI' && modelTerms(GEMINI.front.id) === 'a closed model by Google', 'a closed model is not labelled with its maker'),
  ],
  () => [...sheetModelProblems([GPT, OPEN, GEMINI]), ...sheetModelProblems([{ ...OPEN, open: false }])],
);

// --- M3: one model per sheet ------------------------------------------------------------------------------------
const routeSrc = read('src/app/api/designs/route.ts');
const sampleSrc = read('src/app/api/designs/sample/route.ts');
const oneModel = (views: { choice?: string }[]) => need(oneChoice(views) !== null, `views from ${[...new Set(views.map((v) => v.choice ?? 'open'))].join(' and ')}`);
proven(
  'M3 one model per sheet: the publish refuses views from two choices; a side or back must come from the front\'s',
  () => [
    ...oneModel([{}, {}, {}]),
    ...oneModel([{ choice: 'gpt-image-2.5-sunburst' }, { choice: 'gpt-image-2.5-sunburst' }]),
    ...need(/const choiceId = oneChoice\(/.test(routeSrc) && /if \(!choiceId\) return no\(IMAGE_WORDING\.designs\.models\.mixed/.test(routeSrc), 'the publish route does not refuse mixed views'),
    ...need(/x!\.t\.model !== \(slot === 'front' \? choice\.front : choice\.views\)\.id/.test(routeSrc), 'the publish route does not check each view\'s model against the choice'),
    ...need(/\(t\.choice \?\? DEFAULT_SHEET_MODEL\) !== choice\.id\) return no\(IMAGE_WORDING\.designs\.models\.changed, 409/.test(sampleSrc), 'a side or back can be made with another model than the front\'s'),
  ],
  () => [...oneModel([{}, { choice: 'gpt-image-2.5-sunburst' }]), ...oneModel([{ choice: 'gemini-3.1-flash-image' }, { choice: 'gpt-image-2.5-sunburst' }, {}])],
);

// --- M4: the closed caps, apart from the open ones ---------------------------------------------------------------
{
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  const migrations = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of migrations) await db.exec(read(`supabase/migrations/${f}`));
  const PORT = 54341;
  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
  await sql`set role studio_writer`;
  (IMAGES.designs as { modelChoice: boolean }).modelChoice = true; // the switch on, for this test only
  const { reserve, settle, generationsLeft, closedLeft, closedCapUsd } = await import('../src/lib/images/limits');
  const S = sql as unknown as Parameters<typeof reserve>[0];
  // The superuser, for what studio_writer may not do (the session is shared with the socket's, so the role is set back).
  const su = async (q: string, params: unknown[] = []) => {
    await db.exec('reset role');
    try {
      await db.query(q, params);
    } finally {
      await db.exec('set role studio_writer');
    }
  };
  const closedSpend = (m: SheetModel) => ({ model: m.views, reserveUsd: m.reserveUsd.view, pool: 'closed' as const });

  const separate = async (fid: number) => {
    const p: string[] = [];
    // Six closed pictures: each reserved, then settled at the real cost (the bases' $0.0467).
    for (let i = 0; i < CLOSED_IMAGES.perPersonPerDay; i++) {
      const r = await reserve(S, fid, closedSpend(GPT));
      if (!r.ok) p.push(`closed picture ${i + 1} refused: ${r.refusal}`);
      else await settle(S, { guard: { costUsd: 0.0001, provider: 'groq', verdict: 'ok' }, image: { costUsd: 0.0467, verdict: 'ok' } }, closedSpend(GPT));
    }
    const r7 = await reserve(S, fid, closedSpend(GPT));
    if (r7.ok || r7.refusal !== 'closed-limit') p.push(`the 7th closed picture was not stopped by the closed count (${JSON.stringify(r7)})`);
    if ((await closedLeft(S, fid)) !== 0) p.push('closed pictures left after 6');
    if ((await generationsLeft(S, fid)) !== IMAGES.generationsPerDay) p.push(`closed pictures took from the open count: ${await generationsLeft(S, fid)} open left`);
    // The open 10 still work after the closed six, and using them doesn't give closed ones back.
    for (let i = 0; i < IMAGES.generationsPerDay; i++) {
      const r = await reserve(S, fid);
      if (!r.ok) p.push(`open Generate ${i + 1} refused after the closed six: ${r.refusal}`);
      else await settle(S, {});
    }
    const r11 = await reserve(S, fid);
    if (r11.ok || r11.refusal !== 'limit') p.push('the 11th open Generate was not stopped');
    return p;
  };
  const real = await separate(1001);
  // Planted: six closed asks written as the site wrote them before this branch (no pool), so they count as open.
  for (let i = 0; i < CLOSED_IMAGES.perPersonPerDay; i++) await sql`insert into studio.image_asks (fid) values (${1002})`;
  const plantOpenLeft = await generationsLeft(S, 1002);
  proven('M4a closed pictures have their own count per person (6), apart from the open 10', () => real, () => need(plantOpenLeft === IMAGES.generationsPerDay, `closed asks without a pool took ${IMAGES.generationsPerDay - plantOpenLeft} from the open count`));

  // The site-wide closed cap: today's closed spend near its cap stops a closed picture, never an open one.
  // In the challenge window (the free cap $15, the closed cap $5), as on 12 Nov: the window moved to now, for this test only.
  const dates = CHALLENGE.dates as { opens: string; closes: string };
  const saved = { ...dates };
  const pub = CHALLENGE as { public: boolean };
  const wasPublic = pub.public;
  pub.public = true; // the owner opens the challenge (CHALLENGE.public), for this test only
  dates.opens = new Date(Date.now() - 3600_000).toISOString();
  dates.closes = new Date(Date.now() + 86400_000).toISOString();
  const cap = closedCapUsd();
  await su('delete from studio.image_costs'); // studio_writer can't delete (append-only): the superuser does
  const fill = async (usd: number, model: string) =>
    su(`insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('free', 'image', $1, 'Vercel AI Gateway', 'ok', 1, $2)`, [model, usd]);
  const siteCap = async () => {
    const p: string[] = [];
    const rc = await reserve(S, 2001, closedSpend(GPT));
    if (rc.ok || rc.refusal !== 'closed-spend') p.push(`a closed picture over the closed cap was not stopped (${JSON.stringify(rc)})`);
    const ro = await reserve(S, 2001);
    if (!ro.ok) p.push(`an open Generate was stopped by the closed cap (${ro.refusal})`);
    else await settle(S, {});
    return p;
  };
  await fill(cap - GPT.reserveUsd.view / 2, GPT.views.id);
  const capReal = await siteCap();
  await su('delete from studio.image_costs');
  await fill(cap - GPT.reserveUsd.view / 2, 'z-image-turbo'); // planted: the same spend, on an open model
  const capPlant = await siteCap();
  proven('M4b closed spend has its own site-wide cap ($5 in the window); open spend does not count in it', () => [...capReal, ...need(cap === 5, `closed cap ${cap} in the window`)], () => capPlant);
  Object.assign(dates, saved);

  // The free cap of the moment still holds over closed pictures, and the closed cap sits inside it.
  await su('delete from studio.image_costs');
  await fill(imagesDailySpendCapUsd() - GPT.reserveUsd.view / 2, 'z-image-turbo');
  const rAll = await reserve(S, 2002, closedSpend(GPT));
  const inWindow = closedCapUsd(new Date('2026-11-10T20:00:00Z'));
  proven(
    'M4c the closed cap is $5 within the challenge\'s $15, and the free cap still stops closed pictures',
    () => [
      ...need(!rAll.ok && rAll.refusal === 'spend', `a closed picture over the free cap was not stopped (${JSON.stringify(rAll)})`),
      ...need(inWindow === CLOSED_IMAGES.dailySpendCapUsd && inWindow === 5 && imagesDailySpendCapUsd(new Date('2026-11-10T20:00:00Z')) === 15, `in the window the closed cap is ${inWindow}`),
      ...need(closedCapUsd(new Date('2026-12-10T20:00:00Z')) === Math.min(5, IMAGES.dailySpendCapUsd), 'outside the window the closed cap is above the free cap'),
    ],
    () => need(Math.min(50, 15) === 50, 'a closed cap of $50 would sit above the $15 free cap'),
  );

  pub.public = wasPublic;
  // A wallet account can't use a closed model (for now); and with the switch off, no closed picture is reserved at all.
  await su('delete from studio.image_costs');
  const rw = await reserve(S, -5, closedSpend(GPT));
  const ron = await reserve(S, 3001, closedSpend(GPT)); // the plant: a Farcaster account with the switch on may
  (IMAGES.designs as { modelChoice: boolean }).modelChoice = false;
  const roff = await reserve(S, 3001, closedSpend(GPT));
  proven('M4d no closed picture for a wallet account, nor with the switch off', () => [...need(!rw.ok, 'a wallet account reserved a closed picture'), ...need(!roff.ok, 'a closed picture was reserved with the switch off')], () => need(!ron.ok, 'a closed picture was reserved (switch on, Farcaster account)'));
  await sql.end();
  await server.stop();
  await db.close();
}

// --- M5 and M6: the recipe lines ---------------------------------------------------------------------------------
const SAFETY = 'Checked by gpt-oss-safeguard-20b; made by a closed model whose own safety filters we can\'t see.';
const recipe = (model: string, endpoint: string, host: string, hostChecker: 'passed' | 'not run') => ({
  model, endpoint, host, settings: {}, references: [{ sha256: 'f'.repeat(64) }], seed: null, request_id: 'gen_x', cost_usd: 0.0467, made_at: '2026-11-12T10:00:00Z',
  checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, host_safety_checker: hostChecker },
});
const text = (r: ReturnType<typeof recipe>) => howMade(r, 'a'.repeat(64), 'f'.repeat(64), false).map((x) => x.text).join('');
const closedLines = (r: ReturnType<typeof recipe>, maker: string) => {
  const t = text(r);
  return [
    ...need(t.includes(`a closed model by ${maker}`), `no "a closed model by ${maker}"`),
    ...need(t.includes(SAFETY), 'no closed safety line'),
    ...need(t.includes(RERUN_LINE), 'no can\'t-be-re-run line'),
    ...need(t.includes('Made from the front view.'), 'no front reference'),
  ];
};
const openLines = (r: ReturnType<typeof recipe>) => {
  const t = text(r);
  return [...need(t.includes('Checked by gpt-oss-safeguard-20b and the host\'s safety checker.'), 'the open check line changed'), ...need(!t.includes(RERUN_LINE) && !t.includes('closed'), 'an open recipe says closed')];
};
proven(
  'M5 recipe lines: a closed view names its maker, the safety line and that it can\'t be re-run; an open one is unchanged',
  () => [
    ...closedLines(recipe(GPT.views.id, GPT.views.endpoint, 'Vercel AI Gateway', 'not run'), 'OpenAI'),
    ...closedLines(recipe(GEMINI.views.id, GEMINI.views.endpoint, 'Vercel AI Gateway', 'not run'), 'Google'),
    ...openLines(recipe(IMAGES.editModel.id, IMAGES.editModel.endpoint, 'fal.ai', 'passed')),
  ],
  () => [...closedLines(recipe(IMAGES.editModel.id, IMAGES.editModel.endpoint, 'fal.ai', 'not run'), 'OpenAI'), ...openLines(recipe(GPT.views.id, GPT.views.endpoint, 'Vercel AI Gateway', 'not run'))],
);
proven(
  'M6 the closed safety line is the agreed wording, word for word',
  () => [...need(closedChecksLine('gpt-oss-safeguard-20b') === SAFETY, `got "${closedChecksLine('gpt-oss-safeguard-20b')}"`), ...need(checksLine(recipe(GPT.views.id, GPT.views.endpoint, 'Vercel AI Gateway', 'not run')) === SAFETY, 'checksLine differs')],
  () => need(checksLine(recipe(IMAGES.editModel.id, IMAGES.editModel.endpoint, 'fal.ai', 'not run')) === SAFETY, 'an open recipe without the host checker does not get the closed line'),
);

// --- M7: the switch can't be on without Privacy ------------------------------------------------------------------
const today: P6tInput = {
  on: IMAGES.designs.modelChoice,
  providers: [...new Set(sheetModelsOffered(true).filter((m) => !m.open).map((m) => m.provider.name))],
  retention: Object.fromEntries(Object.entries(CLOSED_PROVIDERS).map(([k, v]) => [k, v.retentionWords as string])),
  s4: (PRIVACY.sections.find((s) => s.n === 4)?.body ?? []).flat().join(' '),
  s7: (PRIVACY.sections.find((s) => s.n === 7)?.body ?? []).flat() as string[],
  notices: Object.fromEntries(Object.entries(NOTICES).map(([k, n]) => [k, [n.label, n.title, ...n.text].join('\n')])),
};
// The draft's words (docs/legal/remix-model-choice-draft.md), as they would be in legal.ts.
const draft = read('docs/legal/remix-model-choice-draft.md');
const quoted = (label: string) => (draft.split(`<!-- ${label} -->`)[1] ?? '').split('<!-- end -->')[0].replace(/^\s*>\s?/gm, '').replace(/\s+/g, ' ').trim();
const withDraft: P6tInput = { ...today, on: true, s4: `${today.s4} ${quoted('privacy-4')}`, s7: [...today.s7, quoted('privacy-7')] };
proven(
  'M7 the switch can\'t be on without Privacy §4, §7 (with each maker\'s retention) and each maker\'s notice, its consent (P6t)',
  () => [
    ...p6tProblems(today),
    ...p6tProblems(withDraft),
    ...need(quoted('privacy-7').length > 0 && quoted('privacy-4').length > 0, 'the draft\'s quoted lines are missing'),
    // The consent screen is no longer asked to name the makers (owner, 2026-11-04, choice 6.1).
    ...need(!quoted('consent'), 'the draft still quotes a consent line (own-words-v5 was dropped)'),
    ...need(today.providers.includes('OpenAI') && today.providers.includes('Google'), `offered makers: ${today.providers.join(', ')}`),
  ],
  // Planted: the switch on with every line in place but OpenAI's retention ("up to 30 days") left out of §7.
  () => p6tProblems({ ...withDraft, s7: withDraft.s7.map((u) => u.replace(/up to 30 days/g, 'a while')) }),
);

// --- M8: a closed call, on stand-ins -----------------------------------------------------------------------------
{
  const { closedRequest, parseClosed, hasC2pa, toView } = await import('../src/lib/images/closed');
  const png = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: { r: 20, g: 30, b: 40 } } }).png().toBuffer();
  const front = await sharp({ create: { width: 576, height: 768, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
  // What the gateway offers per model (has_zdr, has_no_training): no prompt training for both; zero retention for Vertex only.
  const callProblems = (r: ReturnType<typeof closedRequest>, provider: string, zdr = provider === 'vertex') => {
    const s = JSON.stringify(r.body).replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, 'data:…');
    const g = (r.body.providerOptions as { gateway?: Record<string, unknown> } | undefined)?.gateway ?? {};
    return [
      ...need(g.disallowPromptTraining === true, 'no prompt training not asked'),
      ...need(zdr ? g.zeroDataRetention === true : g.zeroDataRetention === undefined, zdr ? 'zero data retention not asked of Vertex' : 'zero data retention asked where the gateway offers none (the call would fail)'),
      ...need(JSON.stringify(g.only) === JSON.stringify([provider]), `provider not pinned to ${provider}`),
      ...need(!/"user":|"fid"|6786|ip_address|"safety_identifier"/i.test(s), 'something about the person is sent'),
    ];
  };
  const real = [
    ...callProblems(closedRequest(GPT, 'front', 'A front view.', null), 'openai'),
    ...callProblems(closedRequest(GPT, 'side', 'A side view.', front), 'openai'),
    ...callProblems(closedRequest(GEMINI, 'back', 'A back view.', front), 'vertex'),
    ...need(closedRequest(GPT, 'front', 'p', null).url.endsWith('/images/generations') && closedRequest(GPT, 'side', 'p', front).url.endsWith('/images/edits'), 'GPT endpoints'),
  ];
  // Recorded answers' shapes (the bases ledger of 2026-11-03), with a stand-in picture.
  const gptAns = { data: [{ b64_json: png.toString('base64') }], providerMetadata: { gateway: { cost: '0.046733', generationId: 'gen_01M6G88ZEYRWQ8EFNF81AH54RC' } } };
  const gemAns = { id: 'gen_gem', choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }] } }], usage: { cost: 0.067665 } };
  const a = parseClosed(GPT, 200, gptAns), b = parseClosed(GEMINI, 200, gemAns);
  real.push(...need(a.costUsd === 0.046733 && a.requestId === 'gen_01M6G88ZEYRWQ8EFNF81AH54RC' && b.costUsd === 0.067665, 'recorded costs or ids not read'));
  const v = await sharp(await toView(a.bytes)).metadata();
  real.push(...need(v.width === IMAGES.viewSize.width && v.height === IMAGES.viewSize.height && v.format === 'jpeg', 'not converted to the view size'));
  real.push(...need(!hasC2pa(png) && hasC2pa(Buffer.concat([png, Buffer.from('caBX')])), 'C2PA presence not detected'));
  let refused = false;
  try { parseClosed(GPT, 400, { error: 'moderation_blocked' }); } catch { refused = true; }
  real.push(...need(refused, 'a refusal by the provider is not an error'));
  const planted = { ...closedRequest(GPT, 'front', 'p', null) };
  planted.body = { ...planted.body, user: 'fid:6786', providerOptions: { gateway: { disallowPromptTraining: true } } };
  proven('M8 a closed call sends only the prompt and pictures, asks what the gateway offers (no training; zero retention on Vertex), pins the provider; recorded answers read', () => real, () => callProblems(planted, 'openai'));
}

// --- M9 to M14: the closed models' notice, the label and the 18+ box (src/lib/images/model-notice.ts) -------------------
{
  const { noticeFor, answerNotice, mayPick, NOTICE_KEY, ADULT_KEY, noticeWordsText } = await import('../src/lib/images/model-notice');
  const { createHash } = await import('node:crypto');
  const { execFileSync } = await import('node:child_process');
  // Rendered in a child process without --conditions=react-server (scripts/lib/model-choice-render.tsx).
  const R = JSON.parse(execFileSync(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'scripts/lib/model-choice-render.tsx')], { cwd: ROOT, encoding: 'utf8' })) as {
    choices: { open: boolean; maker: string | null; name: string }[]; picker: string; pickerNoLabels: string; noticeFirst: string; noticeLater: string;
  };
  const { MODEL_NOTICES, ADULT_CONFIRM } = await import('../src/lib/legal');
  const memStore = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), m };
  };
  // Every network door counted while the notice logic runs: none may open.
  let requests = 0;
  const g = globalThis as unknown as { fetch: typeof fetch; XMLHttpRequest?: unknown };
  const realFetch = g.fetch;
  g.fetch = (async () => {
    requests++;
    return new Response('{}');
  }) as typeof fetch;

  // M9: once per maker. Two picks of models by one maker, then the first again: one notice.
  const shows = (keyOf: (maker: string, model: string) => string) => {
    const st = memStore({ [ADULT_KEY]: '1' });
    const seen = new Set<string>();
    let n = 0;
    for (const [maker, model] of [['OpenAI', 'gpt-image-2.5-sunburst'], ['OpenAI', 'gpt-image-stand-in'], ['OpenAI', 'gpt-image-2.5-sunburst'], ['Google', 'gemini-3.1-flash-image']]) {
      const k = keyOf(maker, model);
      if (noticeFor(k, st, seen).show) {
        n++;
        answerNotice(k, 'ok', false, st, seen);
      }
    }
    return need(n === 2, `${n} notices for two makers`);
  };
  proven('M9 the notice shows once per maker (provider), not per model', () => shows((maker) => maker), () => shows((_maker, model) => model));

  // M10: "Don't remind me again" holds until the maker's notice version goes up; and the words match that version.
  const vProblems = (bump: number) => {
    const st = memStore({ [ADULT_KEY]: '1' });
    const seen = new Set<string>();
    answerNotice('OpenAI', 'never', false, st, seen);
    const p = need(!noticeFor('OpenAI', st, new Set()).show, 'shown again after "Don\'t remind me again", same version');
    const prov = CLOSED_PROVIDERS.OpenAI as { noticeVersion: number };
    const was = prov.noticeVersion;
    prov.noticeVersion = was + bump;
    p.push(...need(noticeFor('OpenAI', st, new Set()).show, 'not shown again after the version went up'));
    prov.noticeVersion = was;
    return p;
  };
  const sha12 = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 12);
  const wordsMatch = (text: (p: string) => string) => Object.entries(CLOSED_PROVIDERS).flatMap(([p, v]) => need(sha12(text(p)) === v.noticeWords, `${p}'s notice words changed without a new noticeVersion (now ${sha12(text(p))})`));
  proven(
    'M10 a new notice version shows it again; its words are the ones that version covers',
    () => [...vProblems(1), ...wordsMatch(noticeWordsText)],
    () => [...vProblems(0), ...wordsMatch((p) => `${noticeWordsText(p)} (changed)`)],
  );

  // M11: answers stay on the device. Nothing is requested, and no request body or route reads them.
  const sentProblems = (body: string) => {
    const before = requests;
    const st = memStore();
    answerNotice('Google', 'never', true, st, new Set());
    return [
      ...need(requests === before, `${requests - before} requests while answering the notice`),
      ...need(st.m.get(ADULT_KEY) === '1' && st.m.get(NOTICE_KEY('Google')) === String(CLOSED_PROVIDERS.Google.noticeVersion), 'the answers were not kept on the device'),
      ...need(!/adult|model-notice|NOTICE_KEY|ADULT_KEY/.test(body), 'a request body carries the notice answers'),
    ];
  };
  const noticeSrc = read('src/lib/images/model-notice.ts') + read('src/components/model-picker.tsx');
  const bodies = [...formSrc.matchAll(/body: JSON\.stringify\(([\s\S]*?)\),\n/g)].map((m) => m[1]).join('\n');
  const routes = sampleSrc + routeSrc;
  proven(
    'M11 "Don\'t remind me again" and the 18+ answer are kept on the device only: no request, and no code that could send them',
    () => [...sentProblems(bodies + routes), ...need(!/\bfetch\(|authFetch|sendBeacon|XMLHttpRequest|WebSocket/.test(noticeSrc), 'the notice code can make a request')],
    () => sentProblems(`${bodies} { adult: store.get(ADULT_KEY) }`),
  );

  // M12: the label beside each closed model, always; and the open default listed first (rendered).
  const labelProblems = (html: string) => {
    const p: string[] = [];
    for (const m of R.choices.filter((c) => !c.open)) p.push(...need(html.includes(MODEL_NOTICES[m.maker as keyof typeof MODEL_NOTICES].label), `no retention label for ${m.name}`));
    const first = html.indexOf('<li>'), open = html.indexOf(IMAGE_WORDING_OPEN);
    p.push(...need(first >= 0 && open > first && open < html.indexOf('<li>', first + 1), 'the first row is not the open default'));
    return p;
  };
  proven('M12 the picker shows each closed model\'s retention label always, with the open default first', () => [...labelProblems(R.picker), ...need(R.choices.some((c) => c.maker === 'OpenAI') && R.choices.some((c) => c.maker === 'Google'), 'both closed makers offered')], () => labelProblems(R.pickerNoLabels));

  // M13: the 18+ box shows with the first notice a device sees, and both buttons wait for it.
  const firstNotice = (store: ReturnType<typeof memStore>) => {
    const n = noticeFor('OpenAI', store, new Set());
    const html = n.askAdult ? R.noticeFirst : R.noticeLater;
    return [...need(n.show && n.askAdult, 'the first notice does not ask 18+'), ...need(html.includes(ADULT_CONFIRM.box.replace(/'/g, '&#x27;')) && (html.match(/disabled=""/g) ?? []).length === 2, 'the box is missing, or a button works without it')];
  };
  proven('M13 the 18+ confirmation is shown with the first closed-model notice', () => firstNotice(memStore()), () => firstNotice(memStore({ [ADULT_KEY]: '1' })));

  // M14: no closed pick before the box is ticked on this device, even if the notice was dismissed before.
  const gate = (answer: typeof answerNotice) => {
    const st = memStore({ [NOTICE_KEY('OpenAI')]: String(CLOSED_PROVIDERS.OpenAI.noticeVersion) });
    const seen = new Set<string>();
    const p = need(!mayPick('OpenAI', st, seen), 'a closed model can be picked before 18+ is confirmed');
    answer('OpenAI', 'ok', false, st, seen);
    p.push(...need(!mayPick('OpenAI', st, seen) && st.m.get(ADULT_KEY) !== '1', 'answering without the box let the pick through'));
    answer('OpenAI', 'ok', true, st, seen);
    p.push(...need(mayPick('OpenAI', st, seen), 'ticked and answered, still not allowed'));
    p.push(...need(/disabled=\{[^}]*!modelReady\}/.test(formSrc) && /if \(!answerNotice\(/.test(formSrc), 'the form does not hold Generate until the notice is answered'));
    return p;
  };
  // Planted: an answer that skips the 18+ box.
  const skipping: typeof answerNotice = (pr, b, _t, st, seen) => answerNotice(pr, b, true, st, seen);
  proven('M14 no closed-model pick goes through before 18+ is confirmed on that device', () => gate(answerNotice), () => gate(skipping));
  g.fetch = realFetch;
}

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
