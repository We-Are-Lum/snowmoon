/**
 * The Dashboard (/dashboard) and the public profile (/@<handle>), owner 2026-10-18, end to end on this
 * machine. Fails (exit 1) on any problem. Nothing touches the hosted database, Farcaster or Base.
 *
 *   npm run test:you-page                      (builds first: `next build`, then this script)
 *   npx tsx --conditions=react-server scripts/test-you-page.ts --shots=/some/dir   also saves screenshots
 *
 * - The database: every migration in an in-memory Postgres (PGlite) EXCEPT the DRAFT 0015, served on
 *   a local socket; the site reads and writes as studio_writer. 0015 is applied halfway (Y6), to check
 *   the page with and without it.
 * - Sign-in: wallet sessions signed here with a test secret (a Farcaster sign-in can't be made offline),
 *   for two accounts: A (a $5 balance, a Basename, and some of everything) and B (someone else).
 * - Base: a local stand-in (BASE_RPC_URL) that answers the Basename lookups: A is snowfan.base.eth.
 * - Farcaster's name API: a local stand-in (FARCASTER_API_URL) that knows @naaate = FID 6786.
 * - Files: REMIX_TEST_FAKES=store keeps a hidden frame's file in a local folder, never R2 (refused on Vercel).
 * - The browser: the locally installed Chrome (playwright-core). Only the local site is reached; with
 *   --shots, pictures on media.snowmoon.party (the project's own media host) load too, for the screenshots.
 *
 * Checks:
 *  Y1  signed out: /api/you answers 401 with nothing else; /dashboard as served holds no one's data; in the
 *      browser it offers sign-in and shows no account, wallet or work.
 *  Y2  signed in as A: /api/you names A by Basename (name order: Farcaster, Basename, address) and lists
 *      A's own scenes, frames, storyboards and pictures, hidden ones marked, and nothing of B's.
 *  Y3  Hide is refused for someone else's scene, frame, storyboard and picture (403), and theirs stay shown.
 *  Y4  /@<A> shows A's published work only (owner, 2026-10-29): scenes, published pictures (each with its AI
 *      label, linking to /image/<id>), frames and storyboards while the flag allows; nothing hidden, nothing of
 *      B's, no balance. An address that never signed in,
 *      and a wallet with nothing published, are both "not found". /@naaate shows Fifteen Days, and
 *      /@naaate/1 is still the scene page.
 *  Y5  Hide on one's own scene without 0015: hidden at once, gone from the profile, and "Show it again"
 *      is refused (409), since who hid it isn't recorded.
 *  Y6  With 0015 applied: a maker's own hide is recorded and undone by them; the earlier, unrecorded hide still isn't.
 *  Y7  the browser, as A at 390 wide, light and dark: the account (Basename, address, public page link,
 *      Sign out), the wallet panel (balance, price, Add funds, the transaction-hash box) and the frame
 *      price, the four lists; every picture has its AI label (button.ai-label) opening the recipe
 *      sheet; Hide on a frame from the list hides it; no sideways scroll.
 *  Y8  the menu: the signed-in name is a link to /dashboard, and tapping it opens the Dashboard.
 *  Y9  the top bar: no avatar signed out; a wallet session's drawn avatar, then Farcaster's picture
 *      (from /api/pfp, on this site), between ? and the menu, linking to /dashboard; signed in with Farcaster
 *      and a wallet, the Dashboard shows both accounts, the wallet panel and both accounts' work, and
 *      Hide on the wallet's frame uses the wallet's own token.
 */
import { PROFILE_LISTS_REMIXES, SHOW_BASENAMES } from '../src/lib/you-flags';
import path from 'node:path';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer as createHttp } from 'node:http';
import { createServer as createNet } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { failOnProtocolErrors, gatePglite } from './lib/pglite-gate';
import { decodeFunctionData, encodeFunctionResult, namehash, parseAbi } from 'viem';
import { chromium, type Browser, type Page } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const SHOTS = arg('shots') ? path.resolve(arg('shots')!) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const SECRET = 'y'.repeat(48);
process.env.IMAGES_TICKET_SECRET = SECRET;

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
};
const freePort = () => new Promise<number>((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

const A = '0x1111111111111111111111111111111111111a11';
const B = '0x2222222222222222222222222222222222222b22';
const C = '0x3333333333333333333333333333333333333c33'; // signed in once, published nothing
const BASENAME = 'snowfan.base.eth';
const IMG1 = 'https://media.snowmoon.party/images/seed/c1/c1-b013-sky-bridge-64be33275e53.jpg';
const IMG2 = 'https://media.snowmoon.party/images/seed/c1/c1-b005-toy-drone-ea7f59a8c05f.jpg';
const sha = (c: string) => c.repeat(64);

// --- the database ------------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
const migrations = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const DRAFT_0015 = migrations.find((f) => f.startsWith('0015_'));
for (const f of migrations.filter((f) => f !== DRAFT_0015)) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const account = async (addr: string) => -Number((await pg.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ($1) returning id`, [addr])).rows[0].id);
const pA = await account(A);
const pB = await account(B);
await account(C);
// A's balance: one $5 USDC payment, nothing spent.
await pg.query(`insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number) values ($1, $2, 8453, 'USDC', 5000000, 5, 1)`, ['0x' + 'a'.repeat(64), -pA]);
// A version each (remixes of version 1), on their pages; A also has a second version, hidden in Y5.
const version = async (person: number, label: string) =>
  Number((await pg.query<{ id: number }>(
    `insert into studio.adaptation_versions (adaptation_id, parent_version_id, author_person, recipe) values (1, 1, $1, $2) returning id`,
    [person, JSON.stringify({ video_url: null, poster_url: 'https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-poster-3caad9b75656.jpg', ai_label: `Pictures: AI-generated, not by the author. (${label})`, after_chapter: 14 })],
  )).rows[0].id);
const vA = await version(pA, 'A');
const vA2 = await version(pA, 'A2');
const vA3 = await version(pA, 'A3');
const vB = await version(pB, 'B');
await pg.query(`insert into studio.adaptation_pages (person, adaptation_id, version_id) values ($1, 1, $2), ($3, 1, $4)`, [pA, vA, pB, vB]);
// Remix frames: A has one shown and one hidden by A; B has one.
const frame = async (person: number, words: string, url: string, c: string, hidden = false) =>
  String((await pg.query<{ id: string }>(
    `insert into studio.remix_frames (adaptation_id, version_id, shot_id, person, own_words, prompt, recipe, image_url, image_sha256, cost_usd, by_name, hidden, hidden_by, hidden_role, hidden_at)
     values (1, 1, '48-b4-1', $1, $2, $3, $4, $5, $6, 0.05, $7, $8, $9, $10, $11) returning id`,
    [person, words, `The shot. ${words}`, JSON.stringify({ shot: { id: '48-b4-1', n: 3 }, model: { name: 'FLUX.2 [klein] 4B edit', licence: 'Apache-2.0', host: 'fal.ai' } }), url, sha(c), person === pA ? `${A.slice(0, 6)}…${A.slice(-4)}` : `${B.slice(0, 6)}…${B.slice(-4)}`, hidden, hidden ? person : null, hidden ? 'maker' : null, hidden ? new Date().toISOString() : null],
  )).rows[0].id);
const fA = await frame(pA, 'Zei laughing at the gate, morning light', IMG1, '1');
const fA2 = await frame(pA, 'A HIDDEN FRAME OF A', IMG2, '2', true);
const fB = await frame(pB, 'B OWN FRAME WORDS', IMG2, '3');
// Storyboards: A one shown and one hidden; B one.
const board = async (person: number, title: string, hidden = false) =>
  String((await pg.query<{ id: string }>(
    `insert into studio.storyboards (adaptation_id, version_id, person, title, items, hidden, hidden_by, hidden_role, hidden_at) values (1, 1, $1, $2, $3, $4, $5, $6, $7) returning id`,
    [person, title, JSON.stringify([{ shot: '48-b4-1', frame: null, seconds: 2.5 }, { shot: '48-b4-2', frame: null, seconds: 3 }]), hidden, hidden ? person : null, hidden ? 'maker' : null, hidden ? new Date().toISOString() : null],
  )).rows[0].id);
const sA = await board(pA, 'The gate at dawn');
const sA2 = await board(pA, 'A HIDDEN BOARD OF A', true);
const sB = await board(pB, 'B OWN BOARD');
// Pictures (readers' images): A one published and one hidden by A; B one.
let n = 0;
const picture = async (person: number, prompt: string, url: string, hidden = false) => {
  n++;
  const id = (k: string) => `${k}${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`;
  await pg.query(`insert into studio.recipes (id, source, provider, model, prompt, params, seed, cost_usd, created_by_fid) values ($1,'in_app','fal.ai','z-image-turbo',$2,$3,1,0.003,$4)`, [id('3'), prompt, JSON.stringify({ user_prompt: prompt, by_name: null }), person]);
  await pg.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, status) values ($1,'snowmoon','image',$2,$3)`, [id('2'), person, hidden ? 'hidden' : 'published']);
  await pg.query(`insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256, recipe_id) values ($1,$2,1,'{"lettering":[]}',$3,$4,$5)`, [id('1'), id('2'), url, sha(String(n + 4)), id('3')]);
  await pg.query(`insert into studio.anchors (version_id, work_id, chapter, start_idx, end_idx) values ($1,'snowmoon',1,3,5)`, [id('1')]);
  if (hidden) await pg.query(`insert into studio.removal_log (element_id, step, by_fid, role) values ($1,'hidden',$2,'author')`, [id('2'), person]);
  return id('1');
};
const iA = await picture(pA, 'A footbridge between two towers at dawn', IMG1);
const iA2 = await picture(pA, 'A HIDDEN PICTURE PROMPT OF A', IMG2, true);
const iB = await picture(pB, 'B OWN PICTURE PROMPT', IMG2);
await pg.exec('set role studio_writer');

// --ports=<db>,<site>: fixed ports on a shared machine (otherwise free ones).
const fixedPorts = arg('ports')?.split(',').map(Number);
const dbPort = fixedPorts?.[0] ?? (await freePort());
// The site and this test share PGlite's one session: direct queries wait for the site's Sync (scripts/lib/pglite-gate.ts).
failOnProtocolErrors(gatePglite(pg), 'test:you-page');
const dbServer = new PGLiteSocketServer({ db: pg, port: dbPort, host: '127.0.0.1' });
await dbServer.start();

// --- Farcaster's name API and Base, stood in -------------------------------------------------
const NAMES: Record<string, number> = { naaate: 6786 };
const RESOLVER = parseAbi(['function name(bytes32 node) view returns (string)', 'function addr(bytes32 node) view returns (address)']);
const reverseA = namehash(`${A.slice(2)}.80002105.reverse`);
const stub = createHttp((req, res) => {
  const send = (status: number, body: unknown) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(body)));
  const u = new URL(req.url ?? '/', 'http://stub');
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const one = (m: { id: number; method: string; params: [{ data: `0x${string}` }] }) => {
        if (m.method !== 'eth_call') return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'no' } };
        const call = decodeFunctionData({ abi: RESOLVER, data: m.params[0].data });
        const node = call.args[0];
        const result =
          call.functionName === 'name'
            ? encodeFunctionResult({ abi: RESOLVER, functionName: 'name', result: node === reverseA ? BASENAME : '' })
            : encodeFunctionResult({ abi: RESOLVER, functionName: 'addr', result: node === namehash(BASENAME) ? A : '0x0000000000000000000000000000000000000000' });
        return { jsonrpc: '2.0', id: m.id, result };
      };
      const msg = JSON.parse(body);
      send(200, Array.isArray(msg) ? msg.map(one) : one(msg));
    });
    return;
  }
  if (u.pathname === '/v2/user-by-username') {
    const name = u.searchParams.get('username') ?? '';
    return NAMES[name] ? send(200, { result: { user: { fid: NAMES[name], username: name } } }) : send(404, { errors: [{ message: 'not found' }] });
  }
  if (u.pathname === '/v2/user') {
    const fid = Number(u.searchParams.get('fid'));
    const name = Object.entries(NAMES).find(([, f]) => f === fid)?.[0];
    // @naaate's profile picture: a picture on the project's own media host stands in for it.
    return name ? send(200, { result: { user: { fid, username: name, pfp: { url: IMG1 } } } }) : send(404, {});
  }
  send(404, {});
});
await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
const stubUrl = `http://127.0.0.1:${(stub.address() as { port: number }).port}`;

// --- the site ------------------------------------------------------------------------------
const port = fixedPorts?.[1] ?? (await freePort());
const BASE = `http://localhost:${port}`;
const { VERCEL_ENV: _drop, ...env } = process.env;
const next = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(port)], {
  cwd: ROOT,
  env: { ...env, NODE_ENV: 'production', STUDIO_DATABASE_URL: `postgres://studio_writer@127.0.0.1:${dbPort}/postgres`, FARCASTER_API_URL: stubUrl, BASE_RPC_URL: stubUrl, IMAGES_TICKET_SECRET: SECRET, REMIX_TEST_FAKES: 'store', REMIX_TEST_STORE: mkdtempSync(path.join(tmpdir(), 'you-page-store-')) },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverErr = '';
next.stderr.on('data', (d) => (serverErr += d));
for (let i = 0; i < 80; i++) {
  if (await fetch(BASE + '/about').then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}

const { signSession } = await import('../src/lib/wallet/session');
const tokenA = signSession(-pA, A)!;
const tokenB = signSession(-pB, B)!;
const api = (p: string, token?: string, init: RequestInit = {}) =>
  fetch(BASE + p, { ...init, headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) } });
const hide = (p: string, token: string, hide = true) => api(p, token, { method: 'POST', body: JSON.stringify({ hide }) });
const html = async (p: string) => {
  const r = await fetch(BASE + p, { redirect: 'manual' });
  return { status: r.status, text: await r.text() };
};
type YouJson = { who: { kind: string; name: string; basename: string | null; address: string; handle: string }; work: { stored: boolean; scenes: { versionId: number; hidden: boolean; hiddenRole?: string | null }[]; frames: { id: string; hidden: boolean }[]; boards: { id: string; hidden: boolean }[]; pictures: { versionId: string; hidden: boolean; canUnhide: boolean }[] }; prices: { frameUsd: number } | null };

try {
  // Y1. Signed out.
  {
    const r = await api('/api/you');
    const body = await r.text();
    check('Y1 signed out: /api/you is 401 with nothing else', r.status === 401 && !/work|who|0x/.test(body), `${r.status} ${body.slice(0, 120)}`);
    const bad = await api('/api/you', 'w1.forged.token');
    check('Y1 a forged token: /api/you is 401', bad.status === 401);
    const page = await html('/dashboard');
    const leaks = [A, B, 'Zei laughing', 'snowfan', 'B OWN'].filter((s) => page.text.includes(s));
    check('Y1 /dashboard as served holds no one’s data', page.status === 200 && !leaks.length, leaks.join(', '));
  }

  // Y2. Signed in as A.
  const you = async (token: string) => (await (await api('/api/you', token)).json()) as YouJson;
  {
    const j = await you(tokenA);
    check(SHOW_BASENAMES ? 'Y2 A is named by Basename first' : 'Y2 A is named by its shortened address (Basenames off)', j.who.kind === 'wallet' && (SHOW_BASENAMES ? j.who.name === BASENAME && j.who.basename === BASENAME : j.who.name !== BASENAME && !j.who.basename && !JSON.stringify(j).includes(BASENAME)) && j.who.address === A && j.who.handle === A, JSON.stringify(j.who));
    const sceneIds = j.work.scenes.map((s) => s.versionId).sort();
    check('Y2 A’s scenes, and only A’s', JSON.stringify(sceneIds) === JSON.stringify([vA, vA2, vA3].sort()), JSON.stringify(sceneIds));
    check('Y2 A’s frames, hidden marked, none of B’s', j.work.frames.length === 2 && j.work.frames.find((f) => f.id === fA2)?.hidden === true && !j.work.frames.some((f) => f.id === fB));
    check('Y2 A’s storyboards, hidden marked, none of B’s', j.work.boards.length === 2 && j.work.boards.find((b) => b.id === sA2)?.hidden === true && !j.work.boards.some((b) => b.id === sB));
    check('Y2 A’s pictures, hidden one undoable by A, none of B’s', j.work.pictures.length === 2 && j.work.pictures.find((p) => p.versionId === iA2)?.canUnhide === true && !j.work.pictures.some((p) => p.versionId === iB));
    check('Y2 a frame’s price is given to a wallet account', (j.prices?.frameUsd ?? 0) > 0);
    const raw = JSON.stringify(j);
    check('Y2 nothing of B’s in A’s answer', !raw.includes(B) && !raw.includes('B OWN'));
    const jb = await you(tokenB);
    check('Y2 B sees only B’s', jb.work.frames.length === 1 && jb.work.frames[0].id === fB && !JSON.stringify(jb).includes(A));
  }

  // Y3. Hide refused for someone else's things.
  {
    const s = await hide(`/api/scenes/${vB}/hide`, tokenA);
    const f = await hide(`/api/remix/${fB}/hide`, tokenA);
    const b = await hide(`/api/remix/storyboard/${sB}/hide`, tokenA);
    const p = await hide(`/api/images/${iB}/hide`, tokenA);
    check('Y3 A can’t hide B’s scene, frame, storyboard or picture (403)', [s.status, f.status, b.status, p.status].every((x) => x === 403), [s.status, f.status, b.status, p.status].join(','));
    const none = await hide(`/api/scenes/${vB}/hide`, '');
    check('Y3 signed out, Hide is 401', none.status === 401);
    const jb = await you(tokenB);
    check('Y3 B’s things are still shown', jb.work.scenes[0]?.hidden === false && jb.work.frames[0]?.hidden === false && jb.work.boards[0]?.hidden === false && jb.work.pictures[0]?.hidden === false);
  }

  // Y4. The public profile.
  {
    const p = await html(`/@${A}`);
    const has = (s: string) => p.text.includes(s);
    check('Y4 /@A is a page', p.status === 200, String(p.status));
    check(PROFILE_LISTS_REMIXES ? 'Y4 /@A shows A’s scene, frame and storyboard' : 'Y4 /@A shows A’s scenes, and no frames or storyboards (they wait for consent v5)', has(`/@${A}/1`) && (PROFILE_LISTS_REMIXES ? has(`/remix/${fA}`) && has(`/storyboard/${sA}`) : !has(`/remix/`) && !has(`/storyboard/`)));
    check('Y4 /@A shows nothing hidden', !has(fA2) && !has(sA2) && !has('A HIDDEN'));
    check('Y4 /@A shows nothing of B’s', !has(fB) && !has(sB) && !has('B OWN') && !has(B));
    check('Y4 /@A shows A’s published picture, linked to its page', has(`/image/${iA}`));
    check('Y4 /@A shows no hidden picture, nothing of B’s pictures, no balance', !has(iA2) && !has('A HIDDEN PICTURE') && !has(iB) && !has('B OWN PICTURE') && !/Balance|wallet_payments/.test(p.text));
    check(SHOW_BASENAMES ? 'Y4 /@A names A by Basename' : 'Y4 /@A shows no Basename (off)', SHOW_BASENAMES ? has(BASENAME) : !has(BASENAME));
    check('Y4 /@A is not offered to search engines', /<meta name="robots" content="noindex/.test(p.text));
    const nobody = await html(`/@0x${'9'.repeat(40)}`);
    const quiet = await html(`/@${C}`);
    check('Y4 an unknown address and a wallet with nothing published are both not found', nobody.status === 404 && quiet.status === 404, `${nobody.status} ${quiet.status}`);
    const checksum = await html(`/@${A.toUpperCase().replace('0X', '0x')}`);
    check('Y4 an address in other case redirects to lowercase', [307, 308].includes(checksum.status));
    const owner = await html('/@naaate');
    check('Y4 /@naaate shows Fifteen Days', owner.status === 200 && owner.text.includes('Fifteen Days') && owner.text.includes('/@naaate/1'), String(owner.status));
    const scene = await html('/@naaate/1');
    check('Y4 /@naaate/1 is still the scene page', scene.status === 200 && scene.text.includes('scene-video'));
    check('Y4 the scene page’s byline links to the profile', scene.text.includes('href="/@naaate"'));
    const fr = await html(`/remix/${fA}`);
    check('Y4 a frame’s byline links to its maker’s profile', fr.text.includes(`href="/@${A}"`));
    const sb = await html(`/storyboard/${sA}`);
    check('Y4 a storyboard’s byline links to its maker’s profile', sb.text.includes(`href="/@${A}"`));
  }

  // Y5. Hiding one's own scene, without 0015.
  {
    const r = await hide(`/api/scenes/${vA2}/hide`, tokenA);
    const j = (await r.json()) as { hidden: boolean; canUnhide: boolean };
    check('Y5 A hides A’s own scene at once', r.ok && j.hidden && !j.canUnhide, JSON.stringify(j));
    const back = await hide(`/api/scenes/${vA2}/hide`, tokenA, false);
    check('Y5 without 0015, "Show it again" is refused (409)', back.status === 409, String(back.status));
    const fixed = await html(`/@${A}/1/v/${vA2}`);
    check('Y5 the hidden version’s page shows nothing', !fixed.text.includes('(A2)'));
    const you2 = await you(tokenA);
    check('Y5 the Dashboard marks it hidden, who hid it unrecorded', you2.work.scenes.find((s) => s.versionId === vA2)?.hidden === true && !('hiddenRole' in (you2.work.scenes.find((s) => s.versionId === vA2) ?? {})));
  }

  // Y6. With 0015 applied (as postgres, then back to the site's role).
  if (DRAFT_0015) {
    await pg.exec('reset role');
    await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', DRAFT_0015), 'utf8'));
    await pg.exec('set role studio_writer');
    const r = await hide(`/api/scenes/${vA3}/hide`, tokenA);
    const j = (await r.json()) as { hidden: boolean; by: string; canUnhide: boolean };
    check('Y6 with 0015, a maker’s hide is recorded', r.ok && j.by === 'maker' && j.canUnhide, JSON.stringify(j));
    const otherBack = await hide(`/api/scenes/${vA3}/hide`, tokenB, false);
    check('Y6 someone else can’t bring it back (403)', otherBack.status === 403, String(otherBack.status));
    const back = await hide(`/api/scenes/${vA3}/hide`, tokenA, false);
    check('Y6 its maker brings it back', back.ok && !((await back.json()) as { hidden: boolean }).hidden);
    const old = await hide(`/api/scenes/${vA2}/hide`, tokenA, false);
    check('Y6 the hide from before 0015 still can’t be undone from the site (409)', old.status === 409, String(old.status));
  } else failures.push('Y6: no 0015 migration file');

  // Y7, Y8. The browser.
  const browser: Browser = await chromium.launch({ channel: 'chrome', args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessForNavigations'] });
  try {
    const plant = (token: string, address: string) =>
      `try{localStorage.setItem('snowmoon.seen-intro','1');localStorage.setItem('snowmoon.intro','seen');localStorage.setItem('snowmoon.wallet',${JSON.stringify(JSON.stringify({ token, address, short: `${address.slice(0, 6)}…${address.slice(-4)}`, exp: Math.floor(Date.now() / 1000) + 86400 }))})}catch(e){}`;
    // A Farcaster session in storage, as the website keeps it. The server can't verify a made-up token,
    // so with it the page's own /api/you call is answered in the browser (see Y9): Farcaster can't be signed into offline.
    const plantFarcaster = `try{localStorage.setItem('snowmoon.signin',${JSON.stringify(JSON.stringify({ token: `x.${Buffer.from(JSON.stringify({ sub: 6786, exp: 4102444800 })).toString('base64url')}.y`, fid: 6786, username: 'naaate', nameProof: null, exp: 4102444800 }))})}catch(e){}`;
    const newPage = async (scheme: 'light' | 'dark', token?: string, farcaster = false) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, hasTouch: true, isMobile: true });
      await ctx.route('**/*', (r) => {
        const u = r.request().url();
        return u.startsWith(BASE) || (SHOTS && u.startsWith('https://media.snowmoon.party/')) ? r.continue() : r.abort();
      });
      // The site's own theme switch decides light or dark (src/lib/theme.ts), as check:ui sets it.
      await ctx.addInitScript(`try{localStorage.setItem('snowmoon.theme','${scheme}')}catch(e){}`);
      if (token) await ctx.addInitScript(plant(token, token === tokenA ? A : B));
      if (farcaster) {
        await ctx.addInitScript(plantFarcaster);
        // The assistant's status would answer the made-up Farcaster token with 401, which signs it out (as check:ui does).
        await ctx.route('**/api/chat/**', (r) => r.abort());
      }
      const page = await ctx.newPage();
      page.on('pageerror', (e) => failures.push(`page error on ${page.url()}: ${e.message}`));
      return page;
    };
    const shot = async (page: Page, name: string, fullPage = false) => {
      if (!SHOTS) return;
      // Pictures in view, loaded (lazy ones off screen never load: at most three seconds).
      await page.evaluate(() => Promise.race([Promise.all(Array.from(document.images).map((i) => (i.complete ? null : new Promise((r) => ((i.onload = r), (i.onerror = r)))))), new Promise((r) => setTimeout(r, 3000))]));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
    };
    const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

    for (const scheme of ['light', 'dark'] as const) {
      // Signed out.
      {
        const page = await newPage(scheme);
        await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
        await page.locator('.you-sign-in button', { hasText: 'Sign in with Farcaster' }).waitFor({ timeout: 10000 }).catch(() => {});
        const t = await page.locator('main.you').innerText();
        check(`Y1 (${scheme}) /dashboard signed out offers sign-in and shows no account, wallet or work`, /Sign in with Farcaster/i.test(t) && /Sign in with a wallet/i.test(t) && !/Your account|Your work|Balance \$/.test(t), t.slice(0, 200));
        await shot(page, `you-signed-out-${scheme}`);
        await page.context().close();
      }
      // Signed in as A.
      {
        const page = await newPage(scheme, tokenA);
        await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
        await page.locator('.wallet-balance').waitFor({ timeout: 15000 }).catch(() => {});
        const t = await page.locator('main.you').innerText();
        check(`Y7 (${scheme}) the account: Basename, address, public page, Sign out`, (SHOW_BASENAMES ? t.includes(BASENAME) : !t.includes(BASENAME)) && t.includes(A) && t.includes(`/@${A}`) && /Sign out/i.test(t));
        check(`Y7 (${scheme}) the wallet: balance, price, Add funds, transaction-hash box, frame price`, /Balance \$5/.test(t) && /an image/.test(t) && /Add funds/i.test(t) && /Add a payment by its transaction hash/.test(t) && /a Remix frame/.test(t), t.slice(0, 600));
        check(`Y7 (${scheme}) the four lists`, /Scenes · 3/i.test(t) && /Remix frames · 2/i.test(t) && /Storyboards · 2/i.test(t) && /Pictures · 2/i.test(t), t.match(/(Scenes|Remix frames|Storyboards|Pictures) · \d/gi)?.join(', '));
        const unlabeled = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLImageElement>('main img')).filter((i) => !i.closest('figure')?.querySelector('button.ai-label')).length,
        );
        const imgs = await page.locator('main img').count();
        check(`Y7 (${scheme}) every picture carries its AI label`, imgs >= 4 && unlabeled === 0, `${imgs} pictures, ${unlabeled} without a label`);
        check(`Y7 (${scheme}) no sideways scroll`, await noSideways(page));
        await shot(page, `you-signed-in-${scheme}`, true);
        if (scheme === 'light') {
          await page.locator('main.you button.ai-label').first().click();
          await page.locator('.recipe-sheet').waitFor({ timeout: 5000 }).catch(() => {});
          const sheet = (await page.locator('.recipe-sheet').textContent().catch(() => '')) ?? '';
          check('Y7 an AI label opens the recipe sheet, which says "not by the author"', /not by the author/i.test(sheet));
          await page.keyboard.press('Escape');
          // Hide a frame from the list.
          const row = page.locator('#you-frames + ul li', { hasText: 'Zei laughing' });
          await row.getByRole('button', { name: 'Hide this' }).click();
          await row.getByRole('button', { name: 'Show it again' }).waitFor({ timeout: 10000 }).catch(() => {});
          const j = await you(tokenA);
          check('Y7 Hide on a frame from the Dashboard hides it', j.work.frames.find((f) => f.id === fA)?.hidden === true);
          await row.getByRole('button', { name: 'Show it again' }).click().catch(() => {});
          await page.waitForTimeout(800);
          check('Y7 and "Show it again" brings it back', (await you(tokenA)).work.frames.find((f) => f.id === fA)?.hidden === false);
        }
        await page.context().close();
      }
      // The menu: the name links to /dashboard.
      {
        const page = await newPage(scheme, tokenA);
        await page.goto(BASE + '/about', { waitUntil: 'networkidle' });
        await page.click('.topbar-icon[aria-label="Menu"]');
        await page.waitForSelector('.menu-sheet');
        const name = page.locator('.menu-sheet a.menu-account-name');
        await name.waitFor({ timeout: 10000 }).catch(() => {});
        await name.scrollIntoViewIfNeeded().catch(() => {});
        check(`Y8 (${scheme}) the menu’s name is a link to /dashboard`, (await name.getAttribute('href').catch(() => null)) === '/dashboard');
        await shot(page, `menu-name-${scheme}`);
        await name.click().catch(() => {});
        await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});
        check(`Y8 (${scheme}) tapping it opens the Dashboard`, page.url().endsWith('/dashboard'));
        await page.context().close();
      }
      // Y9. The top bar's avatar: none signed out; a wallet's drawn avatar; Farcaster's picture, served from this site.
      {
        const out = await newPage(scheme);
        await out.goto(BASE + '/about', { waitUntil: 'networkidle' });
        check(`Y9 (${scheme}) signed out: no avatar in the top bar`, (await out.locator('.topbar-avatar').count()) === 0);
        await out.context().close();
        const w = await newPage(scheme, tokenA);
        await w.goto(BASE + '/about', { waitUntil: 'networkidle' });
        const av = w.locator('.topbar-avatar');
        await av.waitFor({ timeout: 10000 }).catch(() => {});
        const label = await av.getAttribute('aria-label').catch(() => null);
        check(`Y9 (${scheme}) a wallet session: the avatar links to /dashboard, named`, (await av.getAttribute('href').catch(() => null)) === '/dashboard' && label === `Dashboard: ${A.slice(0, 6)}…${A.slice(-4)}`, String(label));
        const order = await w.evaluate(() => Array.from(document.querySelectorAll('.topbar-end > *')).map((e) => e.getAttribute('aria-label') ?? ''));
        check(`Y9 (${scheme}) the avatar sits between ? and the menu`, order.length === 3 && order[0] === 'About' && order[1].startsWith('Dashboard:') && order[2] === 'Menu', order.join(' | '));
        await w.context().close();

        // Farcaster and a wallet, both signed in. /api/you is answered in the browser for the Farcaster half
        // (the server can't verify a made-up Farcaster token), from the real wallet answer plus @naaate's
        // Fifteen Days versions as the database holds them; the wallet's balance and every Hide go to the real server.
        const both = await newPage(scheme, tokenA, true);
        const realWallet = (await (await api('/api/you', tokenA)).json()) as YouJson & { prices: unknown };
        const owner = (await pg.query<{ id: number; created_at: Date; recipe: { poster_url?: string; ai_label?: string; recipe_url?: string } }>(`select id, created_at, recipe from studio.adaptation_versions where author_person = 6786 order by id desc`)).rows;
        await both.route('**/api/you', (r) =>
          r.fulfill({
            json: {
              who: { kind: 'farcaster', name: '@naaate', handle: 'naaate', fid: 6786, username: 'naaate' },
              work: {
                stored: true,
                scenes: owner.map((v) => ({ versionId: v.id, adaptationId: 1, title: 'Fifteen Days', createdAt: new Date(v.created_at).toISOString().slice(0, 10), hidden: false, hiddenRole: null, poster: v.recipe.poster_url ?? null, aiLabel: v.recipe.ai_label ?? null, recipeUrl: v.recipe.recipe_url ?? null, path: `/@naaate/1/v/${v.id}`, parentId: null })),
                frames: [], boards: [], pictures: [],
              },
              maintainer: true,
              prices: null,
              wallet: { who: realWallet.who, work: realWallet.work, prices: realWallet.prices },
            },
          }),
        );
        await both.goto(BASE + '/about', { waitUntil: 'networkidle' });
        const img = both.locator('.topbar-avatar img');
        await img.waitFor({ timeout: 10000 }).catch(() => {});
        const loaded = await img.evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).catch(() => false);
        check(`Y9 (${scheme}) Farcaster: the avatar is the profile picture, from this site`, (await img.getAttribute('src').catch(() => null)) === '/api/pfp/6786' && loaded && (await both.locator('.topbar-avatar').getAttribute('aria-label')) === 'Dashboard: @naaate');
        await shot(both, `topbar-avatar-${scheme}`);
        await both.locator('.topbar-avatar').click();
        await both.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});
        await both.locator('.wallet-balance').waitFor({ timeout: 15000 }).catch(() => {});
        const t = await both.locator('main.you').innerText();
        check(`Y9 (${scheme}) both signed in: both accounts, and the wallet panel`, t.includes('@naaate') && t.includes('6786') && t.includes(A) && (SHOW_BASENAMES ? t.includes(BASENAME) : !t.includes(BASENAME)) && /Balance \$5/.test(t) && /Add funds/i.test(t) && /Add a payment by its transaction hash/.test(t) && /Sign out of this wallet/i.test(t), t.slice(0, 400));
        check(`Y9 (${scheme}) both signed in: the work of both is listed`, /Scenes · 5/i.test(t) && /Remix frames · 2/i.test(t), t.match(/(Scenes|Remix frames) · \d/gi)?.join(', '));
        await shot(both, `you-both-signed-in-${scheme}`, true);
        if (scheme === 'light') {
          // Hide on the wallet's frame goes with the wallet's own token, though Farcaster is signed in.
          const row = both.locator('#you-frames + ul li', { hasText: 'Zei laughing' });
          await row.getByRole('button', { name: 'Hide this' }).click();
          await both.waitForTimeout(1000);
          check('Y9 both signed in: Hide on the wallet\u2019s frame works (its own token)', (await you(tokenA)).work.frames.find((f) => f.id === fA)?.hidden === true);
          await hide(`/api/remix/${fA}/hide`, tokenA, false);
          const still = await both.evaluate(() => localStorage.getItem('snowmoon.signin') !== null && localStorage.getItem('snowmoon.wallet') !== null);
          check('Y9 both signed in: neither session was signed out', still);
        }
        await both.context().close();
      }
      // The public profiles.
      {
        const page = await newPage(scheme);
        await page.goto(BASE + '/@naaate', { waitUntil: 'networkidle' });
        const unlabeled = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>('main img')).filter((i) => !i.closest('figure')?.querySelector('button.ai-label')).length);
        check(`Y4 (${scheme}) /@naaate: every picture carries its AI label; no sideways scroll`, unlabeled === 0 && (await noSideways(page)));
        await shot(page, `profile-naaate-${scheme}`, true);
        await page.goto(BASE + `/@${A}`, { waitUntil: 'networkidle' });
        const unl2 = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>('main img')).filter((i) => !i.closest('figure')?.querySelector('button.ai-label')).length);
        check(`Y4 (${scheme}) /@A: every picture carries its AI label; no sideways scroll`, unl2 === 0 && (await noSideways(page)));
        await shot(page, `profile-wallet-${scheme}`, true);
        await page.context().close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  next.kill();
  stub.close();
  await dbServer.stop();
}

if (/Error|error:/.test(serverErr)) console.log('server stderr:\n' + serverErr.slice(0, 3000));
if (failures.length) {
  console.log(`\n${passed} passed, ${failures.length} FAILED:\n` + failures.map((f) => '- ' + f).join('\n'));
  process.exit(1);
}
console.log(`\ntest:you-page: all ${passed} checks pass${SHOTS ? `; screenshots in ${SHOTS}` : ''}`);
process.exit(0);
