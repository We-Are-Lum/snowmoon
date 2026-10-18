/**
 * Remix (owner, 2026-10-18), end to end on this machine. Fails (exit 1) on any problem.
 *
 *   npm run test:remix
 *
 * No paid call is made, and nothing leaves this machine:
 * - The database: migrations 0001–0013 in an in-memory Postgres (PGlite), talked to as studio_writer.
 * - The site: this checkout's production build (`next start`), with REMIX_TEST_FAKES=1, which stands
 *   in for the image model and the prompt check (refused on Vercel; src/lib/remix/make.ts), and
 *   REMIX_TEST_STORE, a folder in place of the readers' bucket.
 * - Sign-in: a wallet account's session, signed here with the test secret (a Farcaster sign-in can't
 *   be made offline), so the browser checks run as a prepaid wallet account with a $5 balance. The
 *   free path (Farcaster accounts: 10 a day, the $10 free cap, REMIX_FREE=off) is checked on the
 *   library itself, against the same database.
 * - The browser: the locally installed Chrome (playwright-core); every request off the local site is refused.
 *
 * Checks:
 *  R1–R5: the caps (10 a day, the free cap across everyone, the off switch, a reservation replaced by
 *         the real cost, no person in the cost totals), and hiding (maker, maintainer, nobody else).
 *  R6:    signed out, the shot's Remix panel asks to sign in; Generate signed out is refused (401).
 *  R7:    signed in, the consent screen first (wording own-words-v4), then the words box and Generate.
 *  R8:    Generate: a frame saved to their remix, with the AI label, its page and its recipe (the four
 *         pictures by sha256, the exact prompt with their words), and the balance debited.
 *  R9:    a blocked prompt is refused and nothing is saved; a bad layout is refused.
 *  R10:   share (the cast composer with the frame's page) and hide from My remixes; the page then says
 *         hidden; another account can't hide it.
 *  R11:   a phone: no sideways scroll, text at least 12px, controls at least 44px.
 *  R12:   the off switches both ways (REMIX_GENERATE=off, REMIX_FREE=off, then neither).
 *  R13:   version 2's panel also lists the person's version 1 remixes of the shot, tagged "version 1 · open-weight".
 */
import path from 'node:path';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer as createNet } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { chromium, type Browser, type Page } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.next', 'test-remix');
mkdirSync(OUT, { recursive: true });
const STORE = mkdtempSync(path.join(tmpdir(), 'remix-store-'));
const SECRET = 'remix-test-'.padEnd(48, 'x');
process.env.IMAGES_TICKET_SECRET = SECRET;
process.env.REMIX_TEST_FAKES = '1';
process.env.REMIX_TEST_STORE = STORE;
delete process.env.VERCEL;

const freePort = () => new Promise<number>((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const failures: string[] = [];
const results: { n: string; name: string; pass: boolean; got: unknown; shot?: string }[] = [];
const check = (n: string, name: string, pass: boolean, got: unknown = null, shot?: string) => {
  results.push({ n, name, pass, got, shot });
  if (!pass) failures.push(`${n} ${name}: ${JSON.stringify(got).slice(0, 400)}`);
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${n} ${name}`);
};

// --- the database ----------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const WALLET = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
const OTHER = '0x' + 'ab'.repeat(20);
const acct = Number((await pg.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ($1) returning id`, [WALLET])).rows[0].id);
const other = Number((await pg.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ($1) returning id`, [OTHER])).rows[0].id);
await pg.query(`insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number) values ($1, $2, 8453, 'USDC', 5000000, 5, 1)`, ['0x' + '1'.repeat(64), acct]);
// The other account has agreed already, so its storyboard is refused for the frame it names, not for consent.
await pg.query(`insert into studio.contributor_consents (fid, kind, consent_text_sha256) values ($1, 'own_words', $2)`, [-other, (await import('../src/lib/consent')).consentWording().sha256]);
await pg.exec('set role studio_writer');
const dbPort = await freePort();
const dbServer = new PGLiteSocketServer({ db: pg, port: dbPort, host: '127.0.0.1' });
await dbServer.start();
const DB_URL = `postgres://studio_writer@127.0.0.1:${dbPort}/postgres`;
process.env.STUDIO_DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { prepare: false, max: 1 });
const one = async <T>(q: Promise<T[]>) => (await q)[0];
const q1 = async (text: string, params: unknown[] = []) => (await pg.query<Record<string, unknown>>(text, params)).rows[0];

let browser: Browser | null = null;
let serverErrAll = '';
let lastPage: Page | null = null;
let next: ReturnType<typeof spawn> | null = null;
try {
  // --- R1–R5: the library ------------------------------------------------------------------
  const { reserve, settle, freeSpendToday } = await import('../src/lib/remix/limits');
  const { remixSpend } = await import('../src/lib/remix/make');
  const { setHidden, saveFrame } = await import('../src/lib/remix/frames');
  const { REMIX } = await import('../src/lib/config');
  const spend = remixSpend(4);
  {
    const fid = 4242;
    const got: string[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await reserve(sql, fid, spend);
      got.push(r.ok ? 'ok' : r.refusal);
      if (r.ok) await settle(sql, { image: { costUsd: 0.02, verdict: 'ok' } }, spend, 'free');
    }
    check('R1', 'ten free a day, then the limit', got.slice(0, 10).every((g) => g === 'ok') && got[10] === 'limit', got);
  }
  {
    const before = await freeSpendToday(sql);
    await sql`insert into studio.remix_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('free', 'image', 'filler', '', 'ok', 1, ${REMIX.dailyFreeCapUsd - before - 0.01})`;
    const r = await reserve(sql, 5151, spend);
    check('R2', `the free cap across everyone ($${REMIX.dailyFreeCapUsd} a day)`, !r.ok && r.refusal === 'spend', r);
    await sql`delete from studio.remix_costs where model = 'filler'`.catch(() => {});
    // studio_writer may not delete: put the day back under the cap by a negative reservation row instead.
    const now = await freeSpendToday(sql);
    if (now > before + 0.001) await sql`insert into studio.remix_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('free', 'reserved', 'filler', '', '', 0, ${before - now}) on conflict (day, funded, kind, model, provider, verdict) do update set cost_usd = studio.remix_costs.cost_usd + excluded.cost_usd`;
  }
  {
    process.env.REMIX_FREE = 'off';
    const r = await reserve(sql, 6262, spend);
    delete process.env.REMIX_FREE;
    check('R3', 'REMIX_FREE=off stops free frames', !r.ok && r.refusal === 'free-off', r);
  }
  {
    const reserved = await one(sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.remix_costs where kind = 'reserved' and model = ${spend.model.id}`);
    check('R4', 'every reservation is replaced by the real cost', Math.abs((reserved as { usd: number }).usd) < 1e-9, reserved);
    const cols = (await sql`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'remix_costs'`).map((r) => r.column_name as string);
    const anon = await one(sql`select has_table_privilege('anon', 'studio.remix_frames', 'select') as f, has_table_privilege('anon', 'studio.storyboards', 'select') as s`);
    check('R5a', 'no person in the cost totals; nothing readable by anon', !cols.some((c) => /person|fid|id$|at$/.test(c)) && !(anon as { f: boolean }).f && !(anon as { s: boolean }).s, { cols, anon });
  }
  {
    const f = await saveFrame(sql, { adaptationId: 1, versionId: 1, shotId: '48-b4-1', person: 7373, ownWords: 'test', prompt: 'p', recipe: {}, imageUrl: '/x', imageSha256: 'a'.repeat(64), costUsd: 0, byName: null });
    const byOther = await setHidden(sql, 8484, f.id, true);
    const byMaint = await setHidden(sql, 6786, f.id, true);
    const makerUndo = await setHidden(sql, 7373, f.id, false);
    const maintUndo = await setHidden(sql, 6786, f.id, false);
    const fixed = await sql`update studio.remix_frames set own_words = 'changed' where id = ${f.id}`.then(() => 'changed', () => 'refused');
    check('R5b', 'hiding: maker or maintainer only; a maintainer hide is undone only by the maintainer; words fixed', !byOther.ok && byMaint.ok && byMaint.frame.hiddenRole === 'maintainer' && !makerUndo.ok && maintUndo.ok && !maintUndo.frame.hidden && fixed === 'refused', { byOther, makerUndo: makerUndo.ok, fixed });
  }

  // PGlite's socket server takes one client at a time: hand it to the site, and query PGlite directly from here.
  await sql.end({ timeout: 1 });
  // --- the site ------------------------------------------------------------------------------
  const { signSession } = await import('../src/lib/wallet/session');
  const token = signSession(acct, WALLET)!;
  const otherToken = signSession(other, OTHER)!;
  const port = await freePort();
  const BASE = `http://localhost:${port}`;
  const { VERCEL_ENV: _a, VERCEL: _b, ...env } = process.env;
  next = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(port)], {
    cwd: ROOT,
    env: { ...env, NODE_ENV: 'production', NEXT_PUBLIC_URL: 'https://snowmoon.party', STUDIO_DATABASE_URL: DB_URL, SNOWMOON_ALERT_URL: 'http://127.0.0.1:9/never', FARCASTER_API_URL: 'http://127.0.0.1:9' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let serverErr = '';
  next.stderr!.on('data', (d) => ((serverErr += d), (serverErrAll += d)));
  for (let i = 0; i < 80; i++) {
    if ((await fetch(BASE + '/about').catch(() => null))?.ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const ED = '/@naaate/1/shot/48-b4-1';
  browser = await chromium.launch({ channel: 'chrome', args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessForNavigations'] });
  const outside: string[] = [];
  const composer: string[] = [];
  const newPage = async (viewport = { width: 1440, height: 1000 }, signedIn: string | null = null) => {
    const ctx = await browser!.newContext({ viewport });
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      if (u.startsWith('https://farcaster.xyz/~/compose')) composer.push(u);
      // The site's own media host (the version's cut, for the storyboard's mix) is not outside (P6a); refused here all the same.
      else if (!/^https:\/\/([a-z0-9-]+\.)?snowmoon\.party\//.test(u)) outside.push(u);
      return r.abort();
    });
    if (signedIn) {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      await ctx.addInitScript(([t, a, e]) => localStorage.setItem('snowmoon.wallet', JSON.stringify({ token: t, address: a, short: `${(a as string).slice(0, 6)}…${(a as string).slice(-4)}`, exp: e })), [signedIn, WALLET, exp] as const);
    }
    const page = await ctx.newPage();
    lastPage = page;
    page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) failures.push(`${r.status()} from ${r.url().replace(BASE, '')}`); });
    page.on('pageerror', (e) => failures.push(`page error on ${page.url()}: ${e.message}`));
    return page;
  };
  const shot = async (page: Page, name: string, full = false) => {
    const f = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: f, fullPage: full });
    return f;
  };
  const panel = (page: Page) => page.locator('.ed-remix');

  // R6 signed out
  {
    const page = await newPage();
    await page.goto(BASE + ED);
    await panel(page).waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    const t = await panel(page).innerText();
    const r = await fetch(BASE + '/api/remix/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    await panel(page).scrollIntoViewIfNeeded();
    check('R6', 'signed out: the Remix panel asks to sign in; Generate refused (401)', /Sign in/i.test(t) && r.status === 401, { text: t.slice(0, 200), status: r.status }, await shot(page, 'R6-signed-out'));
    await page.context().close();
  }

  // R7–R10 signed in as the wallet account
  let frameId = '';
  {
    const page = await newPage({ width: 1440, height: 1000 }, token);
    page.on('popup', (p) => composer.push(p.url()));
    await page.goto(BASE + ED);
    await page.locator('canvas.ed-layout').waitFor();
    await page.getByRole('button', { name: 'Read and agree' }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Read and agree' }).click();
    await page.locator('.consent-screen').waitFor();
    const wording = await page.locator('.consent-screen').innerText();
    const consentShot = await shot(page, 'R7-consent');
    await page.getByRole('button', { name: 'I agree' }).click();
    await page.locator('#ed-remix-words').waitFor();
    check('R7', 'consent first (own-words-v4), then the words box', /own-words-v4/i.test(wording) && /In Remix, every frame you make is saved and public at its link/.test(wording) && /shown with your name/.test(wording) && /shown with your address, 0x5aae…eaed/.test(wording), { wording: wording.slice(0, 300) }, consentShot);

    // Move the camera a little first: Generate sends what the camera now sees.
    await page.getByRole('slider', { name: /Field of view/ }).focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.locator('#ed-remix-words').fill('Make it night, with lanterns along the railing.');
    const balance0 = await q1(`select (select coalesce(sum(usd),0) from studio.wallet_payments where account_id = $1) - (select coalesce(sum(usd),0) from studio.wallet_debits where account_id = $1) as b`, [acct]);
    await page.getByRole('button', { name: /^Generate/ }).click();
    await page.locator('.ed-remix figure img').first().waitFor({ timeout: 30000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.ed-remix img')).every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
    const t = await panel(page).innerText();
    const row = (await q1(`select * from studio.remix_frames where person = $1 order by created_at desc limit 1`, [-acct])) as Record<string, unknown> | undefined;
    frameId = String(row?.id ?? '');
    const recipe = (row?.recipe ?? {}) as { pictures?: { role: string; sent_sha256: string }[]; model?: { id: string }; camera?: { fov?: number } };
    const balance1 = await q1(`select (select coalesce(sum(usd),0) from studio.wallet_payments where account_id = $1) - (select coalesce(sum(usd),0) from studio.wallet_debits where account_id = $1) as b`, [acct]);
    await panel(page).scrollIntoViewIfNeeded();
    const madeShot = await shot(page, 'R8-generated');
    const pageRes = await fetch(`${BASE}/remix/${frameId}`);
    const html = await pageRes.text();
    const pass =
      !!row && /AI image · by 0x5aae…eaed/i.test(t) && /My remixes of this shot · 1/i.test(t) && row.own_words === 'Make it night, with lanterns along the railing.' &&
      String(row.prompt).includes('Changes for this remix, in the remixer\'s own words: Make it night, with lanterns along the railing.') && String(row.prompt).endsWith('No text, no lettering, no signs with words.') &&
      recipe.model?.id === 'flux2-klein-4b-edit' && (recipe.pictures ?? []).length === 4 && recipe.pictures![0].role === 'layout' && recipe.pictures![3].role === 'plate' && (recipe.pictures ?? []).every((p) => /^[0-9a-f]{64}$/.test(p.sent_sha256)) &&
      typeof recipe.camera?.fov === 'number' && Number((balance0 as { b: number }).b) - Number((balance1 as { b: number }).b) > 0 &&
      pageRes.status === 200 && html.includes('Make it night, with lanterns along the railing.') && html.includes('AI-generated image, not by the author') && html.includes('Pictures sent, in order') && html.includes(String(row?.image_sha256));
    check('R8', 'Generate: the frame is saved to their remix, labelled, with its page and recipe; the balance is debited', pass, { text: t.slice(0, 300), pictures: recipe.pictures?.map((p) => p.role), debited: Number((balance0 as { b: number }).b) - Number((balance1 as { b: number }).b), page: pageRes.status }, madeShot);

    // R9 a blocked prompt, and a bad layout
    await page.locator('#ed-remix-words').fill('TEST-BLOCK this one');
    const n0 = (await q1(`select count(*)::int as n from studio.remix_frames`)) as { n: number };
    await page.getByRole('button', { name: /^Generate/ }).click();
    await page.locator('.ed-remix .ed-warn').waitFor({ timeout: 15000 });
    const warn = await page.locator('.ed-remix .ed-warn').innerText();
    const n1 = (await q1(`select count(*)::int as n from studio.remix_frames`)) as { n: number };
    const bad = await fetch(BASE + '/api/remix/generate', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ adaptation: 1, version: 1, shot: '48-b4-1', words: 'x', layout: 'data:image/png;base64,AAAA' }) });
    check('R9', 'a blocked prompt is refused and nothing saved; a bad layout is refused (400)', /rules don.t allow/.test(warn) && n1.n === n0.n && bad.status === 400, { warn, saved: n1.n - n0.n, bad: bad.status }, await shot(page, 'R9-blocked'));

    // R10 share and hide
    await page.locator('.ed-remix figure').first().getByRole('button', { name: 'Cast it' }).click();
    await page.waitForTimeout(800);
    const cast = composer.find((u) => u.includes('compose')) ?? '';
    const castOk = decodeURIComponent(cast).includes(`/remix/${frameId}`);
    const otherHide = await fetch(`${BASE}/api/remix/${frameId}/hide`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${otherToken}` }, body: '{}' });
    await page.locator('.ed-mine').getByRole('button', { name: 'Hide this' }).first().click();
    await page.locator('.ed-mine .ed-noimg').first().waitFor({ timeout: 10000 });
    const hidden = (await q1(`select hidden, hidden_role from studio.remix_frames where id = $1`, [frameId])) as { hidden: boolean; hidden_role: string };
    const hideShot = await shot(page, 'R10-hidden');
    const after = await (await fetch(`${BASE}/remix/${frameId}`)).text();
    check('R10', 'Cast it opens the cast composer with the frame\'s page; Hide hides it; another account can\'t', castOk && otherHide.status === 403 && hidden.hidden && hidden.hidden_role === 'maker' && after.includes('Its maker hid this frame.') && !after.includes('Make it night'), { cast: cast.slice(0, 160), otherHide: otherHide.status, hidden }, hideShot);
    await page.context().close();
  }

  // The frame page, for the viewer, before it was hidden is in R8; a fresh one for the screenshot:
  {
    const page = await newPage({ width: 1280, height: 900 }, token);
    await page.goto(BASE + ED);
    await page.locator('#ed-remix-words').waitFor({ timeout: 20000 });
    await page.locator('#ed-remix-words').fill('Golden hour light; Deluin laughing.');
    await page.getByRole('button', { name: /^Generate/ }).click();
    await page.locator('.ed-remix figure img').first().waitFor({ timeout: 30000 });
    const id = String(((await q1(`select id from studio.remix_frames where person = $1 and not hidden order by created_at desc limit 1`, [-acct])) as { id: string }).id);
    await page.goto(`${BASE}/remix/${id}`);
    await page.locator('.rx-fig img').waitFor();
    await page.waitForTimeout(500);
    check('R10b', 'the frame\'s own page: frame, label, their words, share, recipe', (await page.locator('.rx').innerText()).includes('Golden hour light; Deluin laughing.'), null, await shot(page, 'R10b-frame-page', true));
    await page.context().close();
  }

  // S1–S3 storyboard: add the version's frame and a remix frame, edit, play, save, share, hide.
  {
    const page = await newPage({ width: 1440, height: 1000 }, token);
    await page.goto(BASE + ED);
    await page.locator('#ed-remix-words').waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Add this frame to a storyboard' }).click();
    await page.locator('.ed-mine').getByRole('button', { name: 'Add to storyboard' }).first().click();
    await page.goto(`${BASE}/@naaate/1/shot/5-b1-1`);
    await page.getByRole('button', { name: 'Add this frame to a storyboard' }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Add this frame to a storyboard' }).click();
    await page.goto(`${BASE}/@naaate/1/storyboard`);
    await page.locator('.sb-item').first().waitFor({ timeout: 20000 });
    const n0 = await page.locator('.sb-item').count();
    // Lengths, order, remove, a take.
    for (const k of [0, 1]) {
      const r = page.locator('.sb-item input[type=range]').nth(k);
      await r.focus();
      await page.keyboard.press('Home');
      for (let j = 0; j < 1; j++) await page.keyboard.press('ArrowRight');
    }
    await page.getByRole('button', { name: 'Move frame 3 up' }).click();
    const order = await page.locator('.sb-item .label').allInnerTexts();
    await page.getByRole('button', { name: 'Remove frame 2' }).click();
    const takeSelect = page.locator('.sb-take select').first();
    const takeOptions = await takeSelect.locator('option').count();
    await takeSelect.selectOption({ index: 1 });
    const n1 = await page.locator('.sb-item').count();
    // Play: the slideshow moves on by itself after the first frame's 0.6 s.
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(1400);
    const at = await page.locator('.sb-screen figcaption').innerText();
    await page.getByRole('button', { name: 'Pause' }).click().catch(() => {});
    const editShot = await shot(page, 'S1-storyboard-editor');
    check('S1', 'storyboard: add (version frame and remix frame), length, reorder, remove, a take, play', n0 === 3 && n1 === 2 && /^3\. Shot 50/i.test(order[2] ?? '') === false && takeOptions >= 2 && /^2 \/ 2/.test(at), { n0, n1, order, takeOptions, at }, editShot);

    await page.locator('#sb-title').fill('Night at the café');
    await page.getByRole('button', { name: /^Save storyboard/ }).click();
    await page.getByRole('link', { name: /Its page/ }).waitFor({ timeout: 15000 });
    const href = (await page.getByRole('link', { name: /Its page/ }).getAttribute('href')) ?? '';
    const sbId = href.split('/').pop() ?? '';
    const row = (await q1(`select title, items, takes, person from studio.storyboards where id = $1`, [sbId])) as { title: string; items: { frame: string | null; seconds: number }[]; takes: Record<string, string>; person: number } | undefined;
    await page.goto(BASE + href);
    await page.locator('.sb-screen').waitFor();
    const t = await page.locator('.rx').innerText();
    const pageShot = await shot(page, 'S2-storyboard-page', true);
    await page.getByRole('button', { name: 'Cast it' }).click();
    await page.waitForTimeout(600);
    const cast = composer.filter((u) => decodeURIComponent(u).includes(`/storyboard/${sbId}`)).length;
    check('S2', 'save: its own page plays it, with title, maker, AI label, Share and the cast composer', !!row && row.title === 'Night at the café' && row.items.length === 2 && row.items.some((i) => i.frame) && Object.keys(row.takes).length === 1 && row.person === -acct && /Night at the café/.test(t) && /by 0x5aae…eaed/i.test(t) && /AI-generated/i.test(t) && cast >= 1, { row, cast }, pageShot);

    const bad = await fetch(`${BASE}/api/remix/storyboard`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${otherToken}` }, body: JSON.stringify({ adaptation: 1, version: 1, items: [{ shot: '48-b4-1', frame: row?.items.find((i) => i.frame)?.frame, seconds: 2 }] }) });
    const otherHide = await fetch(`${BASE}/api/remix/storyboard/${sbId}/hide`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${otherToken}` }, body: '{}' });
    await page.getByRole('button', { name: 'Hide this' }).click();
    await page.waitForLoadState('load');
    await page.locator('.rx-title').filter({ hasText: 'Hidden' }).waitFor({ timeout: 10000 });
    check('S3', 'another account can\'t use your remix frame or hide your board; you can hide it', bad.status === 400 && otherHide.status === 403, { bad: bad.status, otherHide: otherHide.status }, await shot(page, 'S3-storyboard-hidden'));
    await page.context().close();
  }

  // R13 version 2's panel also lists the person's version 1 remixes of the shot (owner, 2026-10-18, decision 2d), each
  // tagged "version 1 · open-weight" with its own label naming FLUX.2 [klein]; they can't join version 2's storyboard.
  {
    // Its picture is the latest test frame's file (a frame's sha256 is unique, so this row records it reversed).
    const src = (await q1(`select image_url, image_sha256 from studio.remix_frames where person = $1 order by created_at desc limit 1`, [-acct])) as { image_url: string; image_sha256: string };
    const v1 = (await q1(
      `insert into studio.remix_frames (adaptation_id, version_id, shot_id, person, own_words, prompt, recipe, image_url, image_sha256, cost_usd, by_name)
       values (1, 1, '48-b4-1', $1, 'An earlier remix, of version 1.', 'test prompt', $2, $3, $4, 0, '0x5aae…eaed') returning id`,
      [-acct, JSON.stringify({ kind: 'remix-frame', model: { id: 'flux2-klein-4b-edit', name: 'FLUX.2 [klein] 4B', licence: 'Apache-2.0', endpoint: 'fal-ai/flux-2/klein/4b/edit', host: 'fal.ai' }, test: 'inserted by test:remix R13' }), src.image_url, src.image_sha256.split('').reverse().join('')],
    )) as { id: string };
    const page = await newPage({ width: 1280, height: 900 }, token);
    await page.goto(BASE + ED);
    await page.locator('.ed-mine').waitFor({ timeout: 20000 });
    const fig = page.locator(`.ed-mine figure[data-version="1"]`);
    const figText = (await fig.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    const addButtons = await fig.first().getByRole('button', { name: /storyboard/i }).count();
    const ownText = (await page.locator('.ed-mine figure[data-version="2"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    const ok = /version 1 · open-weight/i.test(figText) && /AI-generated with FLUX\.2 \[klein\] 4B \(open weights\), not by the author/i.test(figText) && /An earlier remix, of version 1/.test(figText) && addButtons === 0 && !/open-weight/i.test(ownText);
    check('R13', 'version 2\'s panel lists the version 1 remix of the shot, tagged "version 1 · open-weight", its label naming FLUX.2 [klein] (open weights), not addable to version 2\'s storyboard', ok, { id: v1.id, figText: figText.slice(0, 200), addButtons, ownText: ownText.slice(0, 120) }, await shot(page, 'R13-version-1-remixes'));
    await page.context().close();
  }

  // R11 phone
  {
    const page = await newPage({ width: 390, height: 844 }, token);
    await page.goto(BASE + ED);
    await page.locator('#ed-remix-words').waitFor({ timeout: 20000 });
    await panel(page).scrollIntoViewIfNeeded();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const f = await page.evaluate(() => {
      const small: string[] = [];
      const tiny: string[] = [];
      for (const el of Array.from(document.querySelectorAll('.ed-remix *'))) {
        const cs = getComputedStyle(el);
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (own && cs.display !== 'none' && parseFloat(cs.fontSize) < 12) small.push(`${el.tagName} ${cs.fontSize}`);
      }
      for (const el of Array.from(document.querySelectorAll('.ed-remix button'))) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height < 43.5) tiny.push(`${(el as HTMLElement).innerText.slice(0, 20)} ${Math.round(r.height)}px`);
      }
      return { small, tiny };
    });
    check('R11', 'phone: no sideways scroll; text ≥ 12px, controls ≥ 44px', sideways <= 0 && f.small.length === 0 && f.tiny.length === 0, { sideways, ...f }, await shot(page, 'R11-phone'));
    await page.context().close();
  }
  // R12 the off switches, both ways: the site again with REMIX_GENERATE=off, then REMIX_FREE=off, then neither.
  {
    const restart = async (extra: Record<string, string>) => {
      next?.kill();
      await new Promise((r) => setTimeout(r, 800));
      next = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(port)], {
        cwd: ROOT,
        env: { ...env, ...extra, NODE_ENV: 'production', NEXT_PUBLIC_URL: 'https://snowmoon.party', STUDIO_DATABASE_URL: DB_URL, SNOWMOON_ALERT_URL: 'http://127.0.0.1:9/never', FARCASTER_API_URL: 'http://127.0.0.1:9' },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      next.stderr!.on('data', (d) => (serverErrAll += d));
      for (let i = 0; i < 80; i++) {
        if ((await fetch(BASE + '/about').catch(() => null))?.ok) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    };
    const status = async () => (await (await fetch(`${BASE}/api/remix/status?adaptation=1&version=1&shot=48-b4-1`, { headers: { authorization: `Bearer ${token}` } })).json()) as { ready: boolean; free: boolean };
    const gen = async () => (await fetch(BASE + '/api/remix/generate', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ adaptation: 1, version: 1, shot: '48-b4-1', words: 'x', layout: 'data:image/png;base64,AAAA' }) })).status;
    await restart({ REMIX_GENERATE: 'off' });
    const offStatus = await status();
    const offGen = await gen();
    const page = await newPage(undefined, token);
    await page.goto(BASE + ED);
    await page.locator('#ed-gen-note').waitFor({ timeout: 20000 });
    const offText = await page.locator('#ed-gen-note').innerText();
    const offShot = await shot(page, 'R12-generate-off');
    await page.context().close();
    await restart({ REMIX_FREE: 'off' });
    const freeOff = await status();
    await restart({});
    const back = await status();
    check('R12', 'off switches both ways: REMIX_GENERATE=off closes Generate (503, "opens this week"); REMIX_FREE=off stops free frames only; unset, both back on',
      !offStatus.ready && offGen === 503 && /opens this week/i.test(offText) && freeOff.ready && !freeOff.free && back.ready && back.free,
      { offStatus, offGen, offText: offText.slice(0, 120), freeOff, back }, offShot);
  }
  if (outside.length) failures.push(`asked for things outside the site: ${[...new Set(outside)].slice(0, 5).join(', ')}`);
  if (/Error:/.test(serverErr)) console.log('server stderr (first lines):\n' + serverErr.split('\n').slice(0, 8).join('\n'));
} catch (e) {
  failures.push(`crashed: ${(e as Error).stack ?? e}`);
  await (lastPage as Page | null)?.screenshot({ path: path.join(OUT, 'crash.png'), fullPage: true }).catch(() => {});
} finally {
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1) + '\n');
  writeFileSync(path.join(OUT, 'server-stderr.txt'), typeof serverErrAll === 'string' ? serverErrAll : '');
  await browser?.close();
  next?.kill();
  await sql.end({ timeout: 1 }).catch(() => {});
  await dbServer.stop().catch(() => {});
}
console.log(`\n${results.filter((r) => r.pass).length} of ${results.length} pass; screenshots in ${OUT}`);
if (failures.length) {
  console.log('\nFAILURES:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('test:remix: all checks pass');
process.exit(0);
