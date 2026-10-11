/**
 * One-on-one, end to end in two browsers: this checkout's production build (`next build` first),
 * two players signed in as different people (the sign-in mocked in the browser, as check:ui does),
 * and every /api/minpentai/* request answered by the real server code
 * (src/lib/minpentai/play-server/store.ts) against an in-memory Postgres with every migration
 * applied (PGlite). Only Quick Auth's token check and the username lookup are stood in for, by the
 * player each browser is. Nothing touches the live database.
 *
 *   npx tsx --conditions=react-server scripts/check-minpentai-live.ts
 *
 * Checks, at 390 × 844 (phone):
 * - both say they're ready; each sees the other by username; one picks the other, who accepts
 *   within 20 s; both open the same match: "You v @…", the drawn rule, START SETUP;
 * - setup: one places a glider and ends the turn, the other ends theirs; the run plays; both reach
 *   the next turn to act. Each sees themselves as Cyan (the one who is Amber on the server sees the
 *   board turned round); neither page ever receives a square its towers don't light (a leak
 *   check on every match response);
 * - resign: the resigner reads "@… wins", the other "You win"; a rematch starts only when both
 *   press, and opens a new match for both;
 * - an invite link: one copies it, the other opens and accepts it, and both land in the match;
 * - blocking: once blocked, neither sees the other in the list;
 * - floors on every screen: text 12px or more, buttons 44 px or more, no sideways scroll.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { chromium, type BrowserContext, type Page, type Route } from 'playwright-core';
import * as store from '../src/lib/minpentai/play-server/store';
import { K, W, lit, type Side } from '../src/lib/minpentai/play-game/game';
import type { MatchView } from '../src/lib/minpentai/play-game/live-types';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
const fail = (m: string) => { failures.push(m); console.log('  FAIL ' + m); };
let checks = 0;
const ok = (cond: unknown, m: string) => { checks++; if (!cond) fail(m); };

const freePort = () => new Promise<number>((res) => { const s = createServer(); s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

// --- the database ---------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const dbPort = await freePort();
const dbServer = new PGLiteSocketServer({ db: pg, port: dbPort, host: '127.0.0.1' });
await dbServer.start();
const sql = postgres(`postgres://postgres@127.0.0.1:${dbPort}/postgres`, { prepare: false, max: 1 });

// --- the site ---------------------------------------------------------------------------
const port = await freePort();
const next = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(port)], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: '' }, stdio: 'ignore' });
const BASE = `http://localhost:${port}`;
for (let i = 0; i < 60; i++) { const r = await fetch(BASE + '/minpentai/rules').catch(() => null); if (r?.ok) break; await new Promise((r2) => setTimeout(r2, 500)); }

// --- the server code, as each player --------------------------------------------------------
const PLAYERS = { ilse: { fid: 101, username: 'ilse' }, wren: { fid: 202, username: 'wren' } } as const;
type Who = keyof typeof PLAYERS;
let leaks = 0, views = 0;
function leakCheck(v: MatchView, who: Who) {
  if (!v || typeof v !== 'object' || !('board' in v) || v.phase === 'over') return;
  const side: Side = v.you;
  for (const b of [v.board, ...v.frames]) {
    views++;
    const mine = b.tw.filter(([, o]) => o === side).map(([k]) => k);
    const w = { step: 0, rock: {}, sq: {}, tw: Object.fromEntries(b.tw.filter(([, o]) => o === side)), gl: [], nid: 1, flash: [] };
    const see = lit(w as never, side, v.R, mine);
    for (const [k, o] of b.tw) if (o !== side && !see.has(k)) { leaks++; fail(`${who}: sees a hidden tower at ${k}`); }
    for (const [k, o] of b.sq) if (o !== side && !see.has(k)) { leaks++; fail(`${who}: sees a hidden square at ${k}`); }
    for (const [x, y, , , o] of b.gl) if (o !== side && !see.has(K(x, y))) { leaks++; fail(`${who}: sees a hidden glider at ${x},${y}`); }
  }
}
async function answer(route: Route, who: Who) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname.replace('/api/minpentai/', '').split('/');
  const me = PLAYERS[who], now = Date.now();
  const body = (() => { try { return JSON.parse(req.postData() || '{}'); } catch { return {}; } })();
  const reply = (status: number, j?: unknown) => route.fulfill({ status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' }, body: j === undefined ? '' : JSON.stringify(j) });
  try {
    let out: unknown;
    const m = req.method();
    if (p[0] === 'ladder' && !p[1]) out = await store.getLadder(sql, me.fid);
    else if (p[0] === 'ladder') out = await store.postLadder(sql, me.fid, body);
    else if (p[0] === 'lobby' && p[1] === 'ready') out = await store.goReady(sql, me.fid, me.username, now);
    else if (p[0] === 'lobby' && m === 'DELETE') out = await store.stopReady(sql, me.fid, now);
    else if (p[0] === 'lobby') out = await store.lobbyView(sql, me.fid, now);
    else if (p[0] === 'challenge' && !p[1]) out = await store.challenge(sql, me.fid, body.toFid, now);
    else if (p[0] === 'challenge' && p[2] === 'accept') out = await store.acceptChallenge(sql, me.fid, p[1], now);
    else if (p[0] === 'challenge' && p[2] === 'decline') out = await store.declineChallenge(sql, me.fid, p[1]);
    else if (p[0] === 'invite' && !p[1]) out = await store.createInvite(sql, me.fid, me.username, now);
    else if (p[0] === 'invite' && p[2] === 'accept') out = await store.acceptInvite(sql, me.fid, me.username, p[1], now);
    else if (p[0] === 'invite') out = await store.readInvite(sql, me.fid, p[1], now);
    else if (p[0] === 'block') out = await store.block(sql, me.fid, body.fid);
    else if (p[0] === 'match' && !p[2]) {
      const raw = url.searchParams.get('v');
      out = await store.onMatch(sql, me.fid, p[1], now, null, undefined, raw === null ? null : Number(raw));
      if (out === 'unchanged') return reply(204);
    } else if (p[0] === 'match') out = await store.onMatch(sql, me.fid, p[1], now, p[2] as never, body);
    else return reply(404, { error: 'no such route' });
    if (p[0] === 'match') leakCheck(out as MatchView, who);
    return reply(200, out);
  } catch (e) {
    const err = e as { status?: number; message: string };
    return reply(err.status ?? 500, { error: err.message });
  }
}
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function player(who: Who): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const me = PLAYERS[who];
  await ctx.addInitScript(`try{localStorage.setItem('minpentai-tutorial-done','1');localStorage.setItem('snowmoon.signin',${JSON.stringify(JSON.stringify({ token: `x.${b64({ sub: me.fid, exp: 4102444800 })}.y`, fid: me.fid, username: me.username, exp: 4102444800 }))})}catch(e){}`);
  await ctx.route('**/api/minpentai/**', (r) => answer(r, who));
  await ctx.route('**/api/auth/**', (r) => r.fulfill({ json: { fid: me.fid } }));
  // Any real 401 signs the page out (the token is not a real one): the other panels' requests are not answered.
  await ctx.route('**/api/chat/**', (r) => r.abort());
  await ctx.route('**/api/images/**', (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`${who}: page error ${e.message}`));
  return { ctx, page };
}
async function floors(page: Page, where: string) {
  const r = await page.evaluate(() => {
    const small: string[] = [], taps: string[] = [];
    for (const el of document.querySelectorAll('.mp-play *')) {
      if (!(el as HTMLElement).checkVisibility?.()) continue;
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim());
      if (own && parseFloat(getComputedStyle(el).fontSize) < 12) small.push(`${el.tagName}:${getComputedStyle(el).fontSize}`);
    }
    for (const el of document.querySelectorAll('.mp-play button:not([disabled]), .mp-play a')) {
      if (!(el as HTMLElement).checkVisibility?.()) continue;
      const q = el.getBoundingClientRect();
      if (q.height < 44 || q.width < 44) taps.push(`${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}:${Math.round(q.width)}x${Math.round(q.height)}`);
    }
    return { small, taps, wide: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  ok(!r.small.length, `${where}: text under 12px: ${r.small.slice(0, 4).join(', ')}`);
  ok(!r.taps.length, `${where}: targets under 44px: ${r.taps.slice(0, 4).join(', ')}`);
  ok(!r.wide, `${where}: scrolls sideways at 390px`);
}
const text = (page: Page, sel: string) => page.locator(sel).first().textContent().then((t) => (t ?? '').trim());
const until = async (page: Page, fn: () => Promise<boolean>, what: string, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(250); }
  // What the screen showed when it gave up: the strip, the points, any toast or sheet.
  const seen = await page.evaluate(() => ['.mp-strip', '.mp-pts', '.mp-toast', '.mp-sheet', '.mp-bar-title'].map((s) => `${s}=${JSON.stringify(document.querySelector(s)?.textContent?.trim().slice(0, 120) ?? null)}`).join(' ')).catch(() => '');
  fail(`timed out: ${what} (${seen})`); return false;
};

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const A = await player('ilse'), B = await player('wren');
  for (const { page } of [A, B]) await page.goto(BASE + '/minpentai?mode=person', { waitUntil: 'networkidle' });
  await floors(A.page, 'lobby (signed in)');
  // Ready, and pick.
  await A.page.getByRole('button', { name: "I'M READY" }).click();
  await B.page.getByRole('button', { name: "I'M READY" }).click();
  await until(A.page, async () => (await A.page.locator('.mp-person', { hasText: '@wren' }).count()) > 0, 'ilse sees @wren ready');
  await until(B.page, async () => (await B.page.locator('.mp-person', { hasText: '@ilse' }).count()) > 0, 'wren sees @ilse ready');
  await floors(A.page, 'lobby with a ready player');
  await A.page.locator('.mp-people li', { hasText: '@wren' }).getByRole('button', { name: 'PLAY' }).click();
  await until(B.page, async () => (await B.page.locator('.mp-sheet', { hasText: 'Accept the match?' }).count()) > 0, 'wren is asked to accept');
  ok(((await text(B.page, '.mp-sheet .mp-label')) ?? '').includes('@ILSE WANTS TO PLAY'), 'the offer names @ilse');
  await floors(B.page, 'the offer');
  await B.page.getByRole('button', { name: 'ACCEPT' }).click();
  // The match, for both.
  for (const [who, P, opp] of [['ilse', A, 'wren'], ['wren', B, 'ilse']] as const) {
    await until(P.page, async () => (await text(P.page, '.mp-bar-title')) === `You v @${opp}`, `${who} opens the match`);
    ok((await P.page.getByRole('button', { name: /START SETUP · \d:\d\d/ }).count()) === 1, `${who}: START SETUP with the clock`);
    ok(((await text(P.page, '.mp-rule-text')) ?? '').length > 10, `${who}: the drawn rule is shown`);
    await floors(P.page, `${who}: matched`);
    await P.page.getByRole('button', { name: /START SETUP/ }).click();
    ok(((await text(P.page, '.mp-strip')) ?? '').startsWith('STEP 0 · CYAN 2'), `${who}: sees themselves as Cyan with 2 towers`);
  }
  // Both are drawn as Cyan on the left: their own towers are in the left columns.
  for (const [who, P] of [['ilse', A], ['wren', B]] as const) {
    const left = await P.page.locator('[role="gridcell"][aria-label^="Cyan tower"]').evaluateAll((els) => els.map((e) => Number(/column (\d+)/.exec(e.getAttribute('aria-label')!)![1])));
    ok(left.length === 2 && left.every((c) => c <= 3), `${who}: their towers drawn on the left (columns ${left.join(', ')})`);
  }
  // Setup: ilse places a glider and ends; wren ends.
  await A.page.locator('[role="gridcell"]').nth(2 * W + 3).click();
  // A glider costs 4, or 3 under the drawn rule "cost3" (src/lib/minpentai/play-game/game.ts): 4 or 5 left.
  await until(A.page, async () => /^[45] OF 8/.test((await text(A.page, '.mp-pts')) ?? ''), 'ilse places a glider (4 points left, or 5 when gliders cost 3)');
  await floors(A.page, 'ilse placing');
  await A.page.getByRole('button', { name: 'END TURN' }).click();
  await until(A.page, async () => ((await text(A.page, '.mp-body .mp-label.ink')) ?? '').startsWith('TURN ENDED · WAITING FOR @WREN'), 'ilse waits for @wren');
  await floors(A.page, 'ilse waiting');
  await B.page.getByRole('button', { name: 'END TURN' }).click();
  for (const [who, P] of [['ilse', A], ['wren', B]] as const) {
    await until(P.page, async () => /^STEP ([1-9]|1\d)/.test((await text(P.page, '.mp-strip')) ?? ''), `${who}: the run plays`);
    await until(P.page, async () => (await P.page.getByRole('button', { name: 'END TURN' }).count()) > 0, `${who}: the next turn to act`, 20000);
    ok(/^STEP (8|12) /.test((await text(P.page, '.mp-strip')) ?? ''), `${who}: the next turn is at step 8 or 12 (${await text(P.page, '.mp-strip')})`);
  }
  // Resign, then rematch.
  await A.page.getByRole('button', { name: 'Match menu' }).click();
  await A.page.getByRole('button', { name: 'Resign' }).click();
  await floors(A.page, 'resign sheet');
  await A.page.getByRole('button', { name: 'RESIGN' }).click();
  await until(A.page, async () => (await text(A.page, '.mp-result')) === '@wren wins', 'ilse reads "@wren wins"');
  await until(B.page, async () => (await text(B.page, '.mp-result')) === 'You win', 'wren reads "You win"');
  await floors(B.page, 'result');
  const before = B.page.url();
  await A.page.getByRole('button', { name: 'REMATCH' }).click();
  await until(B.page, async () => ((await text(B.page, '.mp-rematch')) ?? '').includes('@ilse asked for one'), 'wren is told @ilse asked for a rematch');
  await B.page.getByRole('button', { name: 'REMATCH' }).click();
  for (const [who, P] of [['ilse', A], ['wren', B]] as const) await until(P.page, async () => (await P.page.getByRole('button', { name: /START SETUP/ }).count()) > 0, `${who}: the rematch opens`);
  ok(B.page.url() === before, 'the rematch keeps the page');
  // Leave the rematch during setup: cancelled, no result; both back in the lobby.
  await A.page.getByRole('button', { name: 'Match menu' }).click();
  await A.page.getByRole('button', { name: 'Leave' }).click();
  ok(((await text(A.page, '.mp-sheet-title')) ?? '') === 'Leave during setup?', 'leaving at setup says it is cancelled');
  await A.page.getByRole('button', { name: 'LEAVE' }).click();
  await until(A.page, async () => (await A.page.getByRole('button', { name: /I'M (NOT )?READY/ }).count()) > 0, 'ilse is back in the lobby');
  await until(B.page, async () => ((await text(B.page, '.mp-result')) ?? '') !== '' || (await B.page.getByRole('button', { name: /I'M (NOT )?READY/ }).count()) > 0, 'wren sees the match end', 20000);

  // An invite link.
  for (const { page } of [A, B]) await page.goto(BASE + '/minpentai?mode=person', { waitUntil: 'networkidle' });
  await A.page.getByRole('button', { name: 'OR SEND ONE PERSON A LINK' }).click();
  await until(A.page, async () => (await A.page.locator('.mp-link-text').count()) > 0, 'ilse gets a link');
  const link = (await text(A.page, '.mp-link-text'))!;
  ok(/\/minpentai\?invite=[A-Za-z0-9_-]{16,}$/.test(link), `the link looks right (${link})`);
  await B.page.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' });
  await until(B.page, async () => ((await text(B.page, '.mp-lead')) ?? '').includes('@ilse invited you'), 'wren sees who invited them');
  await floors(B.page, 'the invite');
  await B.page.getByRole('button', { name: 'ACCEPT' }).click();
  await until(B.page, async () => (await text(B.page, '.mp-bar-title')) === 'You v @ilse', 'wren opens the invited match');
  await until(A.page, async () => (await text(A.page, '.mp-bar-title')) === 'You v @wren', "ilse's lobby opens the invited match");
  await A.page.getByRole('button', { name: /START SETUP/ }).click();
  await A.page.getByRole('button', { name: 'Match menu' }).click();
  await A.page.getByRole('button', { name: 'Resign' }).click();
  await A.page.getByRole('button', { name: 'RESIGN' }).click();
  await until(A.page, async () => (await text(A.page, '.mp-result')) === '@wren wins', 'the invited match ends');
  await A.page.getByRole('button', { name: 'DONE' }).click();

  // Blocking.
  for (const { page } of [A, B]) await page.goto(BASE + '/minpentai?mode=person', { waitUntil: 'networkidle' });
  await A.page.getByRole('button', { name: "I'M READY" }).click();
  await B.page.getByRole('button', { name: "I'M READY" }).click();
  await until(A.page, async () => (await A.page.locator('.mp-person', { hasText: '@wren' }).count()) > 0, 'ilse sees @wren before blocking');
  await A.page.getByRole('button', { name: 'Block @wren' }).click();
  await floors(A.page, 'block sheet');
  await A.page.locator('.mp-sheet').getByRole('button', { name: 'BLOCK' }).click();
  await A.page.waitForTimeout(3500);
  ok((await A.page.locator('.mp-person', { hasText: '@wren' }).count()) === 0, 'ilse no longer sees @wren');
  await B.page.waitForTimeout(3500);
  ok((await B.page.locator('.mp-person', { hasText: '@ilse' }).count()) === 0, 'wren no longer sees @ilse');

  // Signed out: the sign-in card, no lobby.
  const C = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cp = await C.newPage();
  await C.addInitScript(`try{localStorage.setItem('minpentai-tutorial-done','1')}catch(e){}`);
  await cp.goto(BASE + '/minpentai?mode=person', { waitUntil: 'networkidle' });
  ok((await cp.locator('.mp-signin-title', { hasText: 'Sign in to play a person' }).count()) === 1, 'signed out: asked to sign in');
} finally {
  await browser.close();
  next.kill();
  await sql.end();
  await dbServer.stop();
}
ok(views > 20 && leaks === 0, `fog: ${leaks} hidden pieces in ${views} views`);
if (failures.length) { console.log(`\n${failures.length} of ${checks} checks failed`); process.exit(1); }
console.log(`one-on-one: ${checks} checks passed in two browsers (${views} match views, no hidden piece sent)`);
