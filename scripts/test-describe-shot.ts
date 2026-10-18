/**
 * "Describe the shot" end to end (branch describe-shot, 2026-10-18), against a LOCAL database only.
 * Fails (exit 1) on any problem.
 *
 *   npm run test:describe-shot              (builds first: `next build`, then this script)
 *   npx tsx --conditions=react-server scripts/test-describe-shot.ts --out=/some/dir   screenshots and results.json there
 *   … --real    also ONE real call to the model (Groq, about $0.001), to check the tool call's shape
 *
 * Set up as test:play-changes is (PGlite with every migration, a stand-in for Farcaster's name API, this
 * checkout's `next start`, the local Chrome with every request outside the site refused), with
 * DESCRIBE_TEST_FAKES=1: a stand-in for the model and for Farcaster sign-in (refused on Vercel;
 * src/lib/describe/model.ts). No paid call is made unless --real is given.
 *
 * Checks:
 *  1. The library: the request's checks; the tool offers only the editor's controls and the shot's people;
 *     out-of-range values are clamped to the editor's ranges; unknown fields and people are refused.
 *  2. Signed out: the editor's "Describe the shot" box asks to sign in; the route refuses (401).
 *  3. Signed in: the words move the camera through the editor's own path (the sliders follow, the change is
 *     kept in this browser for "Play with my changes"), and one row is counted in the assistant's daily limit.
 *  4. Undo puts the shot back as it was (and the kept change goes with it).
 *  5. Out of range: the model's answer is clamped to the editor's ranges, and the box says so.
 *  6. Unknown field or person in the answer: refused (422), the camera is unchanged.
 *  7. The daily limit (shared with the assistant): at the limit the route refuses (429) and the box says so.
 *  8. A phone (390 × 844, touch): no sideways scroll, text at least 12px, the box's buttons at least 44px.
 *  9. The words are not kept: not in the database, not in the server's log.
 */
import path from 'node:path';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer as createHttp } from 'node:http';
import { createServer as createNet } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { chromium, type Browser, type Page } from 'playwright-core';
import { applyChange, BadRequest, parseRequest, RANGES, toolFor, halfExtent, type DescribeRequest } from '../src/lib/describe/shot';
import { CHAT } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const REAL = process.argv.includes('--real');
const OUT = path.resolve(arg('out') ?? path.join(ROOT, '.next', 'test-describe-shot'));
mkdirSync(OUT, { recursive: true });
const PUBLIC = 'https://snowmoon.party';
const freePort = () => new Promise<number>((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

type Result = { n: string; name: string; pass: boolean; got: unknown; screenshot?: string };
const results: Result[] = [];
const failures: string[] = [];
const check = (n: string, name: string, pass: boolean, got: unknown = null, screenshot?: string) => {
  results.push({ n, name, pass, got, screenshot });
  if (!pass) failures.push(`${n} ${name}: ${JSON.stringify(got).slice(0, 600)}`);
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${n} ${name}`);
};

// --- 1. the library ------------------------------------------------------------------------------
const base = {
  words: 'lower, from behind Zei',
  set: 'courtyard',
  ground: 30,
  camera: { cam: [2.374, 1.316, 0.021], look: [0, 1.2246, -0.95], fov: 32, people: { Z: { at: [1.5, 0], face: -122.3, pose: 'seated' }, D: { at: [0, -0.95], face: 57.7, pose: 'seated' }, B: { at: [0, 0.95], face: 'N', pose: 'seated' } } },
  places: [{ name: 'table4', kind: 'table', at: [0, 0], what: 'the long rectangular wooden table' }],
  size: 'OTS',
  setup: 'OTS-Z',
};
const req: DescribeRequest = parseRequest(base);
{
  const refused = (b: unknown) => { try { parseRequest(b); return false; } catch (e) { return e instanceof BadRequest; } };
  const bad = {
    noWords: refused({ ...base, words: '  ' }),
    tooLong: refused({ ...base, words: 'x'.repeat(301) }),
    unknownPerson: refused({ ...base, camera: { ...base.camera, people: { Q: { at: [0, 0], face: 0 } } } }),
    badNumber: refused({ ...base, camera: { ...base.camera, fov: 'wide' } }),
    badPlace: refused({ ...base, places: [{ name: '<script>', kind: 'table', at: [0, 0] }] }),
  };
  check('1a', 'the request is checked (words, people, numbers, places)', Object.values(bad).every(Boolean) && req.camera.people.B.face === 180, bad);
  const tool = toolFor(req);
  const params = tool.function.parameters;
  check('1b', 'the tool offers only the editor’s controls and this shot’s people', tool.function.name === 'set_shot' && params.additionalProperties === false && Object.keys(params.properties).join() === 'cam,look,fov,people' && Object.keys(params.properties.people.properties).sort().join() === 'B,D,Z', params);
  const half = halfExtent(30);
  const c = applyChange(req, { cam: [999, 50, -999], look: [0, -9, 0], fov: 500, people: { Z: { at: [-500, 3], face: 725, pose: 'standing' } } });
  check('1c', 'out-of-range values are clamped to the editor’s ranges', c.ok && c.camera.cam.join() === `${half},${RANGES.height.max},${-half}` && c.camera.fov === RANGES.fov.max && c.camera.look[1] === RANGES.lookHeight.min && c.camera.people.Z.at[0] === -half && c.camera.people.Z.face === 5 && c.camera.people.Z.pose === 'standing' && c.clamped.length >= 6, c);
  const unknown = [applyChange(req, { fov: 30, zoom: 2 }), applyChange(req, { people: { Q: { at: [0, 0] } } }), applyChange(req, { people: { Z: { at: [0, 0], height: 2 } } }), applyChange(req, { cam: [1, 2] }), applyChange(req, { people: { Z: { pose: 'flying' } } }), applyChange(req, null)];
  check('1d', 'unknown fields, unknown people and wrong types are refused', unknown.every((u) => !u.ok), unknown);
  const same = applyChange(req, {});
  const robot = applyChange(parseRequest({ ...base, camera: { ...base.camera, people: { R: { at: [0, 0], face: 0, pose: 'robot' } } } }), { people: { R: { pose: 'standing' } } });
  check('1e', 'an empty answer changes nothing; the robot keeps its shape', same.ok && !same.changed && robot.ok && robot.camera.people.R.pose === 'robot', { same, robot });
}

// --- the database --------------------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec('set role studio_writer');
const dbPort = await freePort();
const dbServer = new PGLiteSocketServer({ db: pg, port: dbPort, host: '127.0.0.1' });
await dbServer.start();
const asks = async (fid: number) => Number((await pg.query<{ n: number }>(`select count(*)::int as n from studio.chat_calls where fid = $1`, [fid])).rows[0].n);

// --- Farcaster's name API, stood in ----------------------------------------------------------------
const stub = createHttp((rq, res) => {
  const u = new URL(rq.url ?? '/', 'http://stub');
  const send = (status: number, body: unknown) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(body)));
  if (u.pathname === '/v2/user-by-username' && u.searchParams.get('username') === 'naaate') return send(200, { result: { user: { fid: 6786, username: 'naaate' } } });
  if (u.pathname === '/v2/user' && u.searchParams.get('fid') === '6786') return send(200, { result: { user: { fid: 6786, username: 'naaate' } } });
  send(404, {});
});
await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
const stubPort = (stub.address() as { port: number }).port;

// --- the site ------------------------------------------------------------------------------------
const port = await freePort();
const BASE = `http://localhost:${port}`;
const { VERCEL_ENV: _a, VERCEL: _b, ...env } = process.env;
const next = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(port)], {
  cwd: ROOT,
  env: { ...env, NODE_ENV: 'production', NEXT_PUBLIC_URL: PUBLIC, DESCRIBE_TEST_FAKES: '1', STUDIO_DATABASE_URL: `postgres://studio_writer@127.0.0.1:${dbPort}/postgres`, FARCASTER_API_URL: `http://127.0.0.1:${stubPort}`, SNOWMOON_ALERT_URL: 'http://127.0.0.1:9/never' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
next.stdout!.on('data', (d) => (serverLog += d));
next.stderr!.on('data', (d) => (serverLog += d));
for (let i = 0; i < 80; i++) {
  if ((await fetch(BASE + '/about').catch(() => null))?.ok) break;
  await new Promise((r) => setTimeout(r, 500));
}

const ED = '/@naaate/1/shot/48-b4-1';
const CHANGES = 'snowmoon.changes.v1.1.v1';
const FID = 4242;
const outside: string[] = [];
const WORDS = ['lower and tighter, a test phrase 7f3a', 'test: beyond the set 7f3a', 'test: unknown field 7f3a', 'test: unknown person 7f3a'];

async function newPage(browser: Browser, viewport = { width: 1440, height: 1000 }, opts: { touch?: boolean; fid?: number } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: opts.touch, isMobile: opts.touch });
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    // The test's stand-in sign-in is accepted only by /api/describe-shot; the assistant's panel would answer 401
    // and sign the page out, so its status is answered here as the assistant being closed.
    if (opts.fid && u.startsWith(BASE + '/api/chat/status')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, reason: 'not-configured', left: 0, perDay: CHAT.messagesPerDay, model: CHAT.modelName, provider: CHAT.providerName, host: null, route: CHAT.route }) });
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (!/^https:\/\/([a-z0-9-]+\.)?snowmoon\.party\//.test(u)) outside.push(u);
    return r.abort();
  });
  if (opts.fid) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    await ctx.addInitScript(([fid, e]) => localStorage.setItem('snowmoon.signin', JSON.stringify({ token: `describe-test.${fid}`, fid, username: 'tester', exp: e })), [opts.fid, exp] as const);
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`page error on ${page.url()}: ${e.message}`));
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500 && !r.url().includes('/api/describe-shot')) failures.push(`${r.status()} from ${r.url().replace(BASE, '')}`); });
  return page;
}
const shot = async (page: Page, name: string, full = false) => {
  const f = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: f, fullPage: full });
  return f;
};
const box = (page: Page) => page.locator('.ed-describe');
const stageCam = (page: Page) => page.evaluate(() => (document.querySelector('canvas.ed-orbit') as HTMLCanvasElement & { edStage?: { camera: { cam: number[]; look: number[]; fov: number; people: Record<string, { face: number }> } } }).edStage?.camera ?? null);
const kept = (page: Page) => page.evaluate((k) => { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw).shots?.['48-b4-1'] ?? null) : null; }, CHANGES);
async function openEditor(page: Page) {
  await page.goto(BASE + ED);
  await page.locator('canvas.ed-layout').waitFor({ timeout: 20000 });
  await box(page).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
}
async function describe(page: Page, words: string) {
  await page.locator('#ed-describe').fill(words);
  const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/describe-shot') && r.request().method() === 'POST'), page.getByRole('button', { name: 'Move it' }).click()]);
  await page.waitForTimeout(900);
  return res.status();
}

const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessForNavigations'] });
try {
  // 2. Signed out.
  {
    const page = await newPage(browser);
    await openEditor(page);
    const t = await box(page).innerText();
    const r = await fetch(BASE + '/api/describe-shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(base) });
    const fake = await fetch(BASE + '/api/describe-shot', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer not-a-token' }, body: JSON.stringify(base) });
    await box(page).scrollIntoViewIfNeeded();
    check('2', 'signed out: the box asks to sign in; the route refuses (401)', /Sign in/i.test(t) && (await page.locator('#ed-describe').count()) === 0 && r.status === 401 && fake.status === 401, { text: t.slice(0, 200), status: r.status, fake: fake.status }, await shot(page, '2-signed-out-desktop'));
    await page.context().close();
  }

  // 3–7. Signed in.
  {
    const page = await newPage(browser, undefined, { fid: FID });
    await openEditor(page);
    const start = await stageCam(page);
    const before = await asks(FID);
    const status = await describe(page, WORDS[0]);
    const after = await stageCam(page);
    const fovSlider = await page.getByRole('slider', { name: /Field of view/ }).inputValue();
    const k = await kept(page);
    const note = await box(page).innerText();
    await box(page).scrollIntoViewIfNeeded();
    const pass3 = status === 200 && !!start && !!after && after.cam[1] < start.cam[1] - 0.4 && after.fov === start.fov - 10 && +fovSlider === after.fov && !!k?.layout?.src && JSON.stringify(k.camera.cam) === JSON.stringify(after.cam) && (await asks(FID)) === before + 1 && /Done\./.test(note) && /left today/i.test(note);
    check('3', 'signed in: the words move the camera through the editor (sliders, kept change); one count in the daily limit', pass3, { status, start, after, fovSlider, kept: k ? { camera: k.camera, layout: !!k.layout } : null, asks: [before, await asks(FID)] }, await shot(page, '3-applied-desktop'));

    // 4. Undo.
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(1200);
    const undone = await stageCam(page);
    const k2 = await kept(page);
    check('4', 'Undo puts the shot back (and the kept change goes)', JSON.stringify(undone) === JSON.stringify(start) && k2 === null && (await page.getByRole('button', { name: 'Undo' }).isDisabled()), { undone, kept: k2 });

    // 5. Out of range: clamped.
    const s5 = await describe(page, WORDS[1]);
    const c5 = await stageCam(page);
    const half = halfExtent(30);
    const n5 = await box(page).innerText();
    check('5', 'out-of-range answers are clamped to the editor’s ranges, and the box says so', s5 === 200 && !!c5 && c5.cam[0] === half && c5.cam[1] === RANGES.height.max && c5.cam[2] === -half && c5.fov === RANGES.fov.max && /within the editor/.test(n5) && +(await page.getByRole('slider', { name: /Field of view/ }).inputValue()) === RANGES.fov.max, { s5, c5, note: n5 }, await shot(page, '5-clamped-desktop'));
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(600);

    // 6. Unknown field / person: refused.
    const c6a = await stageCam(page);
    const s6a = await describe(page, WORDS[2]);
    const s6b = await describe(page, WORDS[3]);
    const c6b = await stageCam(page);
    const n6 = await box(page).innerText();
    check('6', 'an answer with an unknown field or person is refused (422); the camera is unchanged', s6a === 422 && s6b === 422 && JSON.stringify(c6a) === JSON.stringify(c6b) && /couldn.t be used/.test(n6), { s6a, s6b, note: n6 });

    // 7. The limit (shared with the assistant).
    const used = await asks(FID);
    for (let i = used; i < CHAT.messagesPerDay; i++) await pg.query(`insert into studio.chat_calls (fid, kind, model) values ($1, 'ask', $2)`, [FID, CHAT.model]);
    const s7 = await describe(page, WORDS[0]);
    const n7 = await box(page).innerText();
    const c7 = await stageCam(page);
    check('7', `the daily limit (${CHAT.messagesPerDay}, shared with the assistant): refused (429), the box says so`, s7 === 429 && new RegExp(`today’s ${CHAT.messagesPerDay}: shared with the assistant`, "i").test(n7) && JSON.stringify(c7) === JSON.stringify(c6b) && (await asks(FID)) === CHAT.messagesPerDay, { s7, note: n7 }, await shot(page, '7-limit-desktop'));
    await page.context().close();
  }

  // 8. A phone.
  {
    const page = await newPage(browser, { width: 390, height: 844 }, { touch: true, fid: FID + 1 });
    await openEditor(page);
    await describe(page, WORDS[0]);
    await box(page).scrollIntoViewIfNeeded();
    const m = await page.evaluate(() => {
      const out: string[] = [];
      const root = document.querySelector('.ed-describe')!;
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (own && parseFloat(getComputedStyle(el).fontSize) < 12) out.push(`${el.tagName}.${el.className} under 12px`);
      }
      for (const el of Array.from(root.querySelectorAll('button, textarea'))) if (el.getBoundingClientRect().height < 43.5) out.push(`${el.tagName} ${(el as HTMLElement).innerText} under 44px (${el.getBoundingClientRect().height})`);
      const r = root.getBoundingClientRect();
      return { small: out, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, left: r.left, right: r.right };
    });
    check('8', 'a phone (390 × 844): no sideways scroll, text 12px+, the box’s controls 44px+', m.sideways <= 0 && m.small.length === 0 && m.left >= 0 && m.right <= 390, m, await shot(page, '8-phone'));
    await page.locator('.ed-describe').screenshot({ path: path.join(OUT, '8-phone-box.png') });
    await page.context().close();
  }

  // 9. The words are not kept.
  {
    const dump = JSON.stringify((await pg.query(`select * from studio.chat_calls`)).rows) + JSON.stringify((await pg.query(`select * from studio.chat_costs`)).rows);
    const inDb = dump.includes('7f3a');
    const inLog = serverLog.includes('7f3a');
    check('9', 'the words are not kept: not in the database, not in the server’s log', !inDb && !inLog, { inDb, inLog });
  }
} finally {
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1) + '\n');
  await browser.close();
  next.kill();
  stub.close();
  await dbServer.stop();
}

// --- optional: one real call, to check the tool call's shape -------------------------------------------
if (REAL) {
  const { callTool } = await import('../src/lib/describe/model');
  const { promptFile } = await import('../src/lib/chat/model');
  const { stateFor } = await import('../src/lib/describe/shot');
  const real = parseRequest({ ...base, words: 'lower, from behind Zei, tighter on Deluin' });
  const t0 = Date.now();
  const reply = await callTool(null, [
    { role: 'system', content: promptFile('describe-shot.md') },
    { role: 'user', content: `The shot now:\n${JSON.stringify(stateFor(real))}\n\nThe person's words:\n${real.words}` },
  ], toolFor(real));
  const applied = applyChange(real, reply.args);
  console.log(`  real call: ${Date.now() - t0} ms, ${reply.promptTokens} in / ${reply.completionTokens} out, $${reply.costUsd.toFixed(5)}`);
  console.log('  real answer:', JSON.stringify(reply.args));
  check('R', 'one real call: the model answers through set_shot, and the answer applies', applied.ok && applied.changed, { args: reply.args, applied, cost: reply.costUsd });
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1) + '\n');
}

if (outside.length) failures.push(`requests outside the site: ${[...new Set(outside)].slice(0, 5).join(', ')}`);
console.log(`\n${results.filter((r) => r.pass).length} of ${results.length} pass; results and screenshots in ${OUT}`);
if (failures.length) {
  if (/Error|error:/.test(serverLog)) console.log('server log:\n' + serverLog.slice(0, 3000));
  console.log('\nFAILURES:\n' + failures.map((f) => '- ' + f).join('\n'));
  process.exit(1);
}
console.log('test:describe-shot: all checks pass');
process.exit(0);
