/**
 * Adaptation pages end to end, against a LOCAL database only (docs/proposals/adaptation-urls.md).
 * Fails (exit 1) on any problem. Nothing touches the hosted database or Farcaster.
 *
 *   npm run test:adaptation-pages              (builds first: `next build`, then this script)
 *   npx tsx scripts/test-adaptation-pages.ts --out=/some/dir   screenshots and results.json there
 *
 * - The database: every migration (0012 included) in an in-memory Postgres (PGlite), served on a
 *   local socket, as test:images-gate and check:minpentai-live do. Rows are seeded as postgres;
 *   then the session is set to studio_writer, so the site reads and writes as the production role.
 * - Farcaster's name API: a local stand-in (FARCASTER_API_URL, honoured off production only)
 *   that knows @naaate = FID 6786 and says "no such name" for @oldnaaate (a rename).
 * - The site: this checkout's production build (`next start`), with NEXT_PUBLIC_URL as production
 *   has it, so the links it copies and casts read as they will on snowmoon.party. The pages are
 *   shown because VERCEL_ENV is unset here (adaptationPagesShown in src/lib/config.ts);
 *   ADAPTATION_PAGES.live stays false.
 * - The browser: the locally installed Chrome (playwright-core). Every request that isn't to the
 *   local site is refused, so no page reaches out.
 *
 * Checks: /@naaate/1 (version 2, the GPT cut), /@naaate/1/v/1 (version 1, the open-weight cut), /1, a renamed name, a slug, a wallet address (and its
 * checksum case), "nothing here yet", SHARE and copy link, the cast composer (website and inside a
 * Farcaster client), the phone width, and the live shot editor (13-17: loading, playing (nothing is saved:
 * no fork file, no download), the layers, a phone with a touch drag, and the scene page's links into it, REMIX and the recipe; on /@naaate/1 the editor
 * shows version 2's own GPT frames and labels), and 18: version 1's own editor at /@naaate/1/v/1/shot/<shot>. Version 1's video
 * and poster are named on media.snowmoon.party (uploaded in publish step (b)); the browser here is
 * refused anything outside the local site, so the check reads the player's src and poster rather than playing it.
 */
import path from 'node:path';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer as createHttp } from 'node:http';
import { createServer as createNet } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { failOnProtocolErrors, gatePglite } from './lib/pglite-gate';
import { build } from 'esbuild';
import { chromium, type Browser, type Frame, type Page } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const OUT = path.resolve(arg('out') ?? path.join(ROOT, '.next', 'test-adaptation-pages'));
mkdirSync(OUT, { recursive: true });
const PUBLIC = 'https://snowmoon.party';

const freePort = () => new Promise<number>((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

// The wallet account: EIP-55's own example address, so its checksum case is known.
const WALLET_CHECKSUM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const WALLET = WALLET_CHECKSUM.toLowerCase();

// --- the database ----------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
}
// Seed (as postgres): a wallet account with its own version of adaptation 1 (a remix of version 1)
// on its page; the owner's old name, seen before a rename; a second adaptation with no versions.
const w = await pg.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ($1) returning id`, [WALLET]);
const walletPerson = -Number(w.rows[0].id);
await pg.query(
  `insert into studio.adaptation_versions (adaptation_id, parent_version_id, author_person, recipe) values (1, 1, $1, $2)`,
  [walletPerson, JSON.stringify({ video_url: null, ai_label: 'Pictures: AI-generated, not by the author.', after_chapter: 14 })],
);
const v2 = (await pg.query<{ id: number }>(`select id from studio.adaptation_versions where author_person = $1`, [walletPerson])).rows[0].id;
await pg.query(`insert into studio.adaptation_pages (person, adaptation_id, version_id) values ($1, 1, $2)`, [walletPerson, v2]);
await pg.exec(`insert into studio.account_names (fname, person) values ('oldnaaate', 6786)`);
const a2 = (await pg.query<{ id: number }>(`insert into studio.adaptations (owner_person, title) values (6786, 'Second Scene') returning id`)).rows[0].id;
// A third adaptation by FID 7777, whose name we saw as @zeiwriter, for when Farcaster doesn't answer.
const a3 = (await pg.query<{ id: number }>(`insert into studio.adaptations (owner_person, title) values (7777, 'Third Scene') returning id`)).rows[0].id;
await pg.query(`insert into studio.adaptation_versions (adaptation_id, author_person, recipe) values ($1, 7777, '{"video_url": null}')`, [a3]);
await pg.exec(`insert into studio.account_names (fname, person) values ('zeiwriter', 7777)`);
// A fourth by FID 8888, @oldie, who renames to @newie during the test (check 12).
const a4 = (await pg.query<{ id: number }>(`insert into studio.adaptations (owner_person, title) values (8888, 'Fourth Scene') returning id`)).rows[0].id;
await pg.query(`insert into studio.adaptation_versions (adaptation_id, author_person, recipe) values ($1, 8888, '{"video_url": null}')`, [a4]);
await pg.exec(`insert into studio.account_names (fname, person) values ('oldie', 8888)`);
// From here on the site talks to the database as the production role.
await pg.exec('set role studio_writer');

const dbPort = await freePort();
// The site and this test share PGlite's one session: direct queries wait for the site's Sync (scripts/lib/pglite-gate.ts).
failOnProtocolErrors(gatePglite(pg), 'test:adaptation-pages');
const dbServer = new PGLiteSocketServer({ db: pg, port: dbPort, host: '127.0.0.1' });
await dbServer.start();

// --- Farcaster's name API, stood in ------------------------------------------------------
const NAMES: Record<string, number> = { naaate: 6786, oldie: 8888 };
const asked: string[] = [];
let farcasterDown = false;
const stub = createHttp((req, res) => {
  const u = new URL(req.url ?? '/', 'http://stub');
  asked.push(u.pathname + u.search);
  if (farcasterDown) return (res.writeHead(503), res.end());
  const send = (status: number, body: unknown) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(body)));
  if (u.pathname === '/v2/user-by-username') {
    const name = u.searchParams.get('username') ?? '';
    return NAMES[name] ? send(200, { result: { user: { fid: NAMES[name], username: name } } }) : send(404, { errors: [{ message: 'not found' }] });
  }
  if (u.pathname === '/v2/user') {
    const fid = Number(u.searchParams.get('fid'));
    const name = Object.entries(NAMES).find(([, f]) => f === fid)?.[0];
    return name ? send(200, { result: { user: { fid, username: name } } }) : send(404, { errors: [{ message: 'not found' }] });
  }
  send(404, {});
});
await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
const stubPort = (stub.address() as { port: number }).port;

// --- the site ------------------------------------------------------------------------------
const port = await freePort();
const BASE = `http://localhost:${port}`;
const { VERCEL_ENV: _drop, ...env } = process.env;
const next = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(port)], {
  cwd: ROOT,
  env: {
    ...env,
    NODE_ENV: 'production',
    NEXT_PUBLIC_URL: PUBLIC,
    STUDIO_DATABASE_URL: `postgres://studio_writer@127.0.0.1:${dbPort}/postgres`,
    FARCASTER_API_URL: `http://127.0.0.1:${stubPort}`,
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverErr = '';
next.stderr.on('data', (d) => (serverErr += d));
for (let i = 0; i < 80; i++) {
  const r = await fetch(BASE + '/about').catch(() => null);
  if (r?.ok) break;
  await new Promise((r2) => setTimeout(r2, 500));
}

// --- the checks ------------------------------------------------------------------------------
type Result = { n: number; name: string; url: string; expected: string; got: { status: number | null; finalUrl: string; text: string; [k: string]: unknown }; pass: boolean; screenshot: string };
const results: Result[] = [];
const failures: string[] = [];

/** The first response, unfollowed: status and where it points. */
async function head(p: string) {
  const r = await fetch(BASE + p, { redirect: 'manual' });
  const loc = r.headers.get('location');
  return { status: r.status, location: loc ? new URL(loc, BASE).pathname : null };
}

const mainText = (page: Page | Frame) => page.locator('main, body').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim());
const short = (t: string, n = 400) => (t.length > n ? t.slice(0, n) + '…' : t);
const local = (u: string) => u.replace(BASE, '');

async function newPage(browser: Browser, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  // No page reaches outside this machine.
  await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`page error on ${local(page.url())}: ${e.message}`));
  return page;
}

async function record(n: number, name: string, url: string, expected: string, page: Page, got: { status: number | null; text?: string; [k: string]: unknown }, pass: boolean) {
  const file = `${String(n).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  const text = got.text ?? short(await mainText(page));
  results.push({ n, name, url, expected, got: { ...got, finalUrl: local(page.url()), text }, pass, screenshot: path.join(OUT, file) });
  if (!pass) failures.push(`${n} ${name}: expected ${expected}; got ${JSON.stringify({ ...got, finalUrl: local(page.url()), text: short(text, 200) })}`);
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${n} ${name}`);
}

// 11 (run first, before the site has cached any name). Farcaster isn't answering: /<id> still finds
// the owner's page under the name we last saw on them, and that page still shows.
{
  farcasterDown = true;
  const h = await head(`/${a3}`);
  const h2 = await head(`/@zeiwriter/${a3}`);
  farcasterDown = false;
  const pass = h.status === 307 && h.location === `/@zeiwriter/${a3}` && h2.status === 200;
  results.push({ n: 11, name: 'Farcaster not answering', url: `/${a3}`, expected: `307 to /@zeiwriter/${a3} (the name last seen on FID 7777), and that page 200`, got: { status: h.status, finalUrl: h.location ?? '', text: '', pageStatus: h2.status }, pass, screenshot: '' });
  if (!pass) failures.push(`11 Farcaster not answering: /${a3} gave ${h.status} ${h.location}; /@zeiwriter/${a3} gave ${h2.status}`);
  console.log(`  ${pass ? 'PASS' : 'FAIL'} 11 Farcaster not answering`);
}

// 12. A rename while the site still holds the old name for that FID (cached a day in names.ts):
// /<id> is visited first (the site caches FID 8888 = @oldie), then @oldie renames to @newie.
// A link with the old name must redirect to the new one, not 404 until the cache expires.
{
  const before = await head(`/${a4}`);
  delete NAMES.oldie;
  NAMES.newie = 8888;
  const h = await head(`/@oldie/${a4}`);
  const pass = before.location === `/@oldie/${a4}` && [307, 308].includes(h.status) && h.location === `/@newie/${a4}`;
  results.push({ n: 12, name: 'rename with a warm name cache', url: `/@oldie/${a4}`, expected: `redirect to /@newie/${a4}`, got: { status: h.status, finalUrl: h.location ?? '', text: '', before: before.location }, pass, screenshot: '' });
  if (!pass) failures.push(`12 rename with a warm cache: /${a4} went to ${before.location}; /@oldie/${a4} gave ${h.status} ${h.location}`);
  console.log(`  ${pass ? 'PASS' : 'FAIL'} 12 rename with a warm name cache`);
}

const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessForNavigations'] });
try {
  // 1. The owner's page: version 2, the GPT cut (owner, 2026-10-18; migration 0014).
  {
    const url = '/@naaate/1';
    const h = await head(url);
    const page = await newPage(browser);
    const res = await page.goto(BASE + url);
    // The AI label shows short, its full wording and the recipe closed until tapped (owner, 2026-10-18: "too much text").
    const summary = await page.locator('.scene-ai > summary').innerText().then((x) => x.replace(/\s+/g, ' ').trim()).catch(() => '');
    const shut = !(await page.locator('.scene-ai-body').isVisible());
    await page.locator('.scene-ai > summary').click();
    const t = await mainText(page);
    const player = await page
      .locator('video.scene-video')
      .evaluate((v) => ({ src: v.getAttribute('src') ?? v.getAttribute('data-cut'), poster: v.getAttribute('poster'), sources: [...v.querySelectorAll('source')].map((s) => `${s.getAttribute('media') ?? 'any'} ${s.getAttribute('src')}`) }))
      .catch(() => null);
    // The delivery copies (src/lib/scene-delivery.ts): the 720p one for phones, the re-wrapped cut, then the cut itself.
    const sourcesOk =
      JSON.stringify(player?.sources) ===
      JSON.stringify([
        '(max-width: 800px) https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-phone-3f91cf56859f.mp4',
        'any https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-wide-b64332cf553c.mp4',
        'any https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4',
      ]);
    // The closed model is named with its maker, the date and that it is closed, in the label and the recipe line;
    // the shot strip shows version 2's own GPT pictures (2026-10-18), so no "version 1's shots" note is left.
    const strip = await page.locator('.scene-shots h2').innerText({ timeout: 10000 }).catch(() => '');
    const thumbs = await page.locator('.scene-shot img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute('src') ?? ''));
    const closedOk =
      /AI-generated with GPT Image \(OpenAI, a closed model\), not by the author/i.test(t) &&
      /Inputs open, model closed: the pictures by GPT Image 2\.5 Sunburst \(OpenAI, a closed model\), 2026-10-18/i.test(t) &&
      /Read the recipe/i.test(t) && !/version 1.s shots/i.test(t) && /^Every shot/i.test(strip) &&
      /^AI pictures: GPT Image \(OpenAI, closed model\), not by the author i$/i.test(summary) && shut &&
      thumbs.length > 70 && thumbs.every((u) => u.startsWith('/editor/1/v2/thumbs/')) &&
      !/remixed from/i.test(t);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href').catch(() => null);
    const embedRaw = await page.locator('meta[name="fc:miniapp"]').getAttribute('content').catch(() => null);
    const embed = embedRaw ? (JSON.parse(embedRaw) as { button?: { title?: string; action?: { url?: string } } }) : null;
    const headOk = canonical === `${PUBLIC}/@naaate/1` && embed?.button?.action?.url === `${PUBLIC}/@naaate/1` && embed?.button?.title === 'Watch it';
    const pass = headOk && sourcesOk && h.status === 200 && res?.status() === 200 && /Fifteen Days/i.test(t) && /@naaate.s chosen version/i.test(t) && player?.src === 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4' && player?.poster === 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-shown-4fc80109065b.jpg' && /Version 2 /i.test(t) && closedOk;
    await record(1, 'owner page', url, `200; title Fifteen Days; @naaate's chosen version; version 2 (the GPT cut, no parent); its AI label shown short ("AI pictures: GPT Image (OpenAI, closed model), not by the author i"), closed until tapped, then naming GPT Image (OpenAI, a closed model); "Inputs open, model closed" with the model, maker and date; the shot strip shows version 2's own GPT pictures and the recipe link reads "Read the recipe" (no "version 1's shots" note); the player plays v2's cut from media.snowmoon.party (its 720p copy on phones, its re-wrapped copy wider, the cut last) with the no-text GPT triptych as its poster; canonical and fc:miniapp embed point at ${PUBLIC}/@naaate/1`, page, { status: h.status, player, strip, thumbs: thumbs.slice(0, 2), canonical, embedUrl: embed?.button?.action?.url ?? null, summary, shut }, pass);
    await page.context().close();
  }

  // 2. A fixed version: version 1, the open-weight cut, still at its own link.
  {
    const url = '/@naaate/1/v/1';
    const h = await head(url);
    const page = await newPage(browser);
    await page.goto(BASE + url);
    await page.locator('.scene-ai > summary').click();
    const t = await mainText(page);
    const player = await page
      .locator('video.scene-video')
      .evaluate((v) => ({ src: v.getAttribute('data-cut') ?? v.getAttribute('src'), poster: v.getAttribute('poster'), sources: [...v.querySelectorAll('source')].map((s) => `${s.getAttribute('media') ?? 'any'} ${s.getAttribute('src')}`) }))
      .catch(() => null);
    const strip = await page.locator('.scene-shots h2').innerText({ timeout: 10000 }).catch(() => '');
    // Its own editor: every shot, the recipe and Remix open /@naaate/1/v/1/shot/<shot>, with version 1's own frames.
    const links = await page.locator('.scene-shot').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''));
    const thumbs = await page.locator('.scene-shot img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute('src') ?? ''));
    const recipeHref = await page.locator('.scene-ai a').getAttribute('href');
    const ownEditor = links.length === 85 && links.every((h) => /^\/@naaate\/1\/v\/1\/shot\/[\w-]+$/.test(h)) && thumbs.every((u) => u.startsWith('/editor/1/v1/thumbs/')) && recipeHref === '/@naaate/1/v/1/shot/first#recipe';
    const v1Ok =
      player?.src === 'https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-9391f90d6dca.mp4' &&
      player?.poster === 'https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-poster-3caad9b75656.jpg' &&
      JSON.stringify(player?.sources) ===
        JSON.stringify([
          '(max-width: 800px) https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-phone-6a5de81bbece.mp4',
          'any https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-wide-3e425205b1a4.mp4',
          'any https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-9391f90d6dca.mp4',
        ]) &&
      /Version 1 /i.test(t) && /Pictures: AI-generated, not by the author/i.test(t) && !/closed model/i.test(t) && /^Every shot/i.test(strip) && /Read the recipe/i.test(t);
    const pass = h.status === 200 && /this version, fixed/i.test(t) && /See @naaate.s latest chosen version/i.test(t) && v1Ok && ownEditor;
    await record(2, 'fixed version', url, "200; 'this version, fixed'; a link to the latest chosen version; it plays version 1, the open-weight cut (its copies, its poster, its own AI label, no closed model named), with every shot of its own under it, each (and the recipe link) opening version 1's own editor at /@naaate/1/v/1/shot/<shot>", page, { status: h.status, player, strip, shotLinks: links.length, firstLink: links[0] ?? null, recipeHref }, pass);
    await page.context().close();
  }

  // 3. /1 goes to the page of the person who started adaptation 1.
  {
    const url = '/1';
    const h = await head(url);
    const page = await newPage(browser);
    await page.goto(BASE + url);
    const pass = h.status === 307 && h.location === '/@naaate/1' && local(page.url()) === '/@naaate/1';
    await record(3, 'id redirect', url, '307 to /@naaate/1', page, { status: h.status, location: h.location }, pass);
    await page.context().close();
  }

  // 4. A name Farcaster no longer knows, seen on FID 6786 before a rename.
  {
    const url = '/@oldnaaate/1';
    const h = await head(url);
    const page = await newPage(browser);
    await page.goto(BASE + url);
    const pass = [307, 308].includes(h.status) && h.location === '/@naaate/1' && local(page.url()) === '/@naaate/1';
    await record(4, 'renamed fname redirect', url, 'redirect to /@naaate/1 (the new name)', page, { status: h.status, location: h.location }, pass);
    await page.context().close();
  }

  // 5. Words after the id redirect to the title's slug.
  {
    const url = '/@naaate/1-anything';
    const h = await head(url);
    const page = await newPage(browser);
    await page.goto(BASE + url);
    const t = await mainText(page);
    const pass = [307, 308].includes(h.status) && h.location === '/@naaate/1-fifteen-days' && local(page.url()) === '/@naaate/1-fifteen-days' && /Fifteen Days/i.test(t);
    await record(5, 'slug redirect', url, 'redirect to /@naaate/1-fifteen-days, which shows the scene', page, { status: h.status, location: h.location }, pass);
    await page.context().close();
  }

  // 6. A wallet account's page, and its checksum-case address redirecting to lowercase.
  {
    const url = `/@${WALLET}/1`;
    const h = await head(url);
    const hc = await head(`/@${WALLET_CHECKSUM}/1`);
    const page = await newPage(browser);
    await page.goto(BASE + `/@${WALLET_CHECKSUM}/1`);
    const t = await mainText(page);
    // The address as shown, after CSS: lowercase in the capitals label too (owner, 2026-10-17).
    const where = await page.evaluate(() => (document.querySelector('.scene-where') as HTMLElement | null)?.innerText ?? '');
    // The 42-character handle stays inside its column (desktop here, phone below).
    const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('.scene-facts dd, .scene-where, .scene-btn-sub')).filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > (document.querySelector('.scene') as HTMLElement).getBoundingClientRect().right + 1).map((e) => e.className || e.tagName));
    const phone = await newPage(browser, { width: 390, height: 844 });
    await phone.goto(BASE + url);
    const phoneSideways = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await phone.screenshot({ path: path.join(OUT, '06b-wallet-address-phone.png') });
    await phone.context().close();
    const pass =
      overflow.length === 0 && phoneSideways <= 0 &&
      h.status === 200 && [307, 308].includes(hc.status) && hc.location === url && local(page.url()) === url &&
      new RegExp(`Version ${v2} .*remixed from version 1`, 'i').test(t) && t.includes(`@${WALLET}`) && where.includes(`/@${WALLET}/1`) && where.includes(`@${WALLET}`);
    await record(6, 'wallet address', `/@${WALLET_CHECKSUM}/1 and ${url}`, `checksum case redirects to ${url}; that page shows the wallet's version ${v2}, remixed from version 1; the address shows lowercase, in the capitals label too; it stays inside its column (desktop) and the page has no sideways scroll at 390px`, page, { status: h.status, checksumStatus: hc.status, checksumLocation: hc.location, label: where, overflowing: overflow, phoneSidewaysPx: phoneSideways }, pass);
    await page.context().close();
  }

  // 7. An adaptation with no version to show.
  {
    const url = `/@naaate/${a2}`;
    const h = await head(url);
    const page = await newPage(browser);
    await page.goto(BASE + url);
    const t = await mainText(page);
    const pass = h.status === 200 && /Nothing here yet/i.test(t) && /Second Scene/i.test(t) && /@naaate has no version of this to show/i.test(t);
    await record(7, 'nothing here yet', url, "'Nothing here yet', the title, '@naaate has no version of this to show'", page, { status: h.status }, pass);
    await page.context().close();
  }

  // 8. SHARE, then both copy buttons; read the clipboard back.
  {
    const url = '/@naaate/1';
    const page = await newPage(browser);
    await page.goto(BASE + url);
    await page.getByRole('button', { name: /^Share/ }).click();
    await page.locator('.scene-share-panel').waitFor();
    const copyButtons = page.locator('.scene-share-panel').getByRole('button', { name: 'Copy link' });
    await copyButtons.first().click();
    await page.getByRole('button', { name: 'Copied' }).first().waitFor({ timeout: 5000 }).catch(() => undefined);
    const copiedLatest = await page.evaluate(() => navigator.clipboard.readText());
    const labelAfter = await page.locator('.scene-share-panel .scene-small-solid').innerText();
    await page.screenshot({ path: path.join(OUT, '08-share-copy-link.png') });
    await page.locator('.scene-fixed button').click();
    const copiedFixed = await page.evaluate(() => navigator.clipboard.readText());
    const panel = (await page.locator('.scene-share-panel').innerText()).replace(/\s+/g, ' ');
    const pass = copiedLatest === `${PUBLIC}/@naaate/1` && copiedFixed === `${PUBLIC}/@naaate/1/v/2` && labelAfter.toLowerCase() === 'copied';
    results.push({
      n: 8, name: 'SHARE and copy link', url, expected: `the panel opens; Copy link copies ${PUBLIC}/@naaate/1 and says Copied; the fixed link of the version on screen (2) copies ${PUBLIC}/@naaate/1/v/2`,
      got: { status: 200, finalUrl: local(page.url()), text: panel, copiedLatest, copiedFixed, labelAfter }, pass, screenshot: path.join(OUT, '08-share-copy-link.png'),
    });
    if (!pass) failures.push(`8 SHARE: copied ${copiedLatest} / ${copiedFixed}, label ${labelAfter}`);
    console.log(`  ${pass ? 'PASS' : 'FAIL'} 8 SHARE and copy link`);
    await page.context().close();
  }

  // 9. Cast it: on the website it opens Farcaster's composer in a new tab; inside a Farcaster
  //    client it asks the client's composer (sdk.actions.composeCast).
  {
    const url = '/@naaate/1';
    const page = await newPage(browser);
    await page.addInitScript(() => {
      (window as unknown as { __opened: string[] }).__opened = [];
      window.open = ((u: string) => ((window as unknown as { __opened: string[] }).__opened.push(String(u)), null)) as typeof window.open;
    });
    await page.goto(BASE + url);
    await page.getByRole('button', { name: /^Share/ }).click();
    await page.getByRole('button', { name: 'Cast it' }).click();
    await page.waitForFunction(() => (window as unknown as { __opened: string[] }).__opened.length > 0, null, { timeout: 5000 }).catch(() => undefined);
    const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
    const web = opened[0] ? new URL(opened[0]) : null;
    const webOk = !!web && web.origin + web.pathname === 'https://farcaster.xyz/~/compose' && web.searchParams.get('text') === 'Fifteen Days, a scene from Snowmoon' && web.searchParams.getAll('embeds[]').join() === `${PUBLIC}/@naaate/1`;
    await page.context().close();

    // Inside a stand-in Farcaster client (as check:miniapp does), recording what composeCast is asked.
    const HOST = 'http://localhost:3199/';
    const hostCode = `
      import { exposeToIframe } from '@farcaster/miniapp-host';
      const target = new URLSearchParams(location.search).get('url');
      const iframe = document.createElement('iframe');
      iframe.src = target; iframe.style.cssText = 'width:424px;height:695px;border:0';
      document.body.appendChild(iframe);
      window.__host = { composed: [], other: [] };
      const impl = {
        context: { user: { fid: 6786, username: 'naaate' }, client: { clientFid: 9152, added: false, safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 } }, location: { type: 'launcher' }, features: { haptics: false } },
        ready: () => {},
        composeCast: async (o) => { window.__host.composed.push(o); return { cast: null }; },
        getCapabilities: async () => ['actions.ready', 'actions.composeCast'],
        getChains: async () => [],
      };
      const sdk = new Proxy(impl, { get: (t, k) => (k in t ? t[k] : () => { window.__host.other.push(String(k)); return undefined; }) });
      exposeToIframe({ iframe, sdk, miniAppOrigin: new URL(target).origin });`;
    const bundle = (await build({ stdin: { contents: hostCode, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'error' })).outputFiles[0].text;
    const ctx = await browser.newContext({ viewport: { width: 480, height: 1000 } });
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(HOST)) return r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0"><script>${bundle.replace(/<\/script>/g, '<\\/script>')}</script></body>` });
      return u.startsWith(BASE) ? r.continue() : r.abort();
    });
    const hp = await ctx.newPage();
    await hp.goto(`${HOST}?url=${encodeURIComponent(BASE + url)}`);
    const frame = await new Promise<Frame>((resolve) => {
      const t = setInterval(() => {
        const f = hp.frames().find((x) => x !== hp.mainFrame() && x.url().startsWith(BASE));
        if (f) (clearInterval(t), resolve(f));
      }, 100);
    });
    await frame.getByRole('button', { name: /^Share/ }).click();
    await frame.getByRole('button', { name: 'Cast it' }).click();
    await hp.waitForFunction(() => (window as unknown as { __host: { composed: unknown[] } }).__host.composed.length > 0, null, { timeout: 8000 }).catch(() => undefined);
    const composed = await hp.evaluate(() => (window as unknown as { __host: { composed: unknown[] } }).__host.composed);
    const c = composed[0] as { text?: string; embeds?: string[] } | undefined;
    const appOk = !!c && c.text === 'Fifteen Days, a scene from Snowmoon' && (c.embeds ?? []).join() === `${PUBLIC}/@naaate/1`;
    await hp.evaluate((shown) => {
      const pre = document.createElement('pre');
      pre.style.cssText = 'margin:8px;white-space:pre-wrap;font:12px monospace';
      pre.textContent = shown;
      document.body.appendChild(pre);
    }, `Stand-in Farcaster client. composeCast was asked:\n${JSON.stringify(c ?? null, null, 1)}\n\nOn the website, Cast it opens:\n${opened[0] ?? '(nothing)'}`);
    await hp.screenshot({ path: path.join(OUT, '09-cast-composer.png'), fullPage: true });
    const pass = webOk && appOk;
    results.push({
      n: 9, name: 'cast composer', url,
      expected: `website: opens https://farcaster.xyz/~/compose?text=Fifteen Days, a scene from Snowmoon&embeds[]=${PUBLIC}/@naaate/1 in a new tab; in a Farcaster client: composeCast({ text, embeds: [${PUBLIC}/@naaate/1] })`,
      got: { status: 200, finalUrl: url, text: 'see website and miniapp', website: opened[0] ?? null, miniapp: c ?? null }, pass, screenshot: path.join(OUT, '09-cast-composer.png'),
    });
    if (!pass) failures.push(`9 cast: website ${opened[0]}; miniapp ${JSON.stringify(c)}`);
    console.log(`  ${pass ? 'PASS' : 'FAIL'} 9 cast composer`);
    await ctx.close();
  }

  // 10. Phone width.
  {
    const url = '/@naaate/1';
    const page = await newPage(browser, { width: 390, height: 844 });
    await page.goto(BASE + url);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const share = await page.getByRole('button', { name: /^Share/ }).boundingBox();
    const t = await mainText(page);
    const pass = sideways <= 0 && !!share && share.height >= 44 && share.x >= 0 && share.x + share.width <= 390 && /Fifteen Days/i.test(t);
    await record(10, 'phone width', url, 'at 390x844: no sideways scroll; SHARE in view horizontally and at least 44px tall', page, { status: 200, sidewaysScrollPx: sideways, shareBox: share }, pass);
    await page.context().close();
  }

  // --- The live editor (owner, 2026-10-17): read and play only, from the version's committed files.
  const ED = '/@naaate/1/shot/48-b4-1';
  const outside: string[] = [];
  // The site's own media domain (version 1's video and poster) is the site's, as P6a allows; anything else is outside.
  const ownMedia = (u: string) => /^https:\/\/([a-z0-9-]+\.)?snowmoon\.party\//.test(u);
  const watchOutside = (page: Page) => page.on('request', (r) => !r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && !ownMedia(r.url()) && outside.push(r.url()));
  type Stage = { screenOf(k: string): { x: number; y: number } | null };
  const handleAt = async (page: Page, kind: string) => {
    const box = await page.locator('canvas.ed-orbit').boundingBox();
    const p = await page.locator('canvas.ed-orbit').evaluate((c, k) => (c as HTMLCanvasElement & { edStage?: Stage }).edStage?.screenOf(k) ?? null, kind);
    return box && p ? { x: box.x + p.x, y: box.y + p.y } : null;
  };
  /** Text under 12px and controls under 44px tall, inside the editor. */
  const floors = (page: Page) =>
    page.evaluate(() => {
      const small = new Set<string>();
      const tiny: string[] = [];
      for (const el of Array.from(document.querySelectorAll('.ed *'))) {
        const cs = getComputedStyle(el);
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (own && cs.display !== 'none' && parseFloat(cs.fontSize) < 12) small.add(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className} ${cs.fontSize}`);
      }
      for (const el of Array.from(document.querySelectorAll('.ed button, .ed select, .ed-nav a, .ed input[type=range]'))) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height < 43.5) tiny.push(`${el.tagName.toLowerCase()} "${(el as HTMLElement).innerText?.slice(0, 20)}" ${Math.round(r.height)}px`);
      }
      return { small: [...small], tiny };
    });

  // 13. The editor loads one shot: 3D set and live layout drawn, the frame and its set frame, the labels.
  {
    const page = await newPage(browser, { width: 1440, height: 1000 });
    watchOutside(page);
    const res = await page.goto(BASE + ED);
    await page.locator('canvas.ed-layout').waitFor();
    await page.waitForTimeout(1500);
    const layoutDrawn = await page.locator('canvas.ed-layout').evaluate((c) => {
      const d = (c as HTMLCanvasElement).toDataURL('image/png');
      return d.length > 20000;
    });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.ed-pair img')).every((i) => (i as HTMLImageElement).complete), null, { timeout: 10000 }).catch(() => {});
    const imgs = await page.locator('.ed-pair img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).naturalWidth));
    const frameSrc = await page.locator('.ed-pair img').first().getAttribute('src');
    const recipe = await page.getByRole('link', { name: /The recipe/ }).getAttribute('href');
    const github = await page.locator('.ed a[href*="github.com"]').count();
    const proto = await page.getByRole('link', { name: /where it.s going/i }).count();
    const gen = await page.getByRole('button', { name: 'Generate' }).getAttribute('aria-disabled');
    const t = await mainText(page);
    const f = await floors(page);
    const pass =
      res?.status() === 200 && layoutDrawn && imgs.length === 2 && imgs.every((w) => w > 0) &&
      recipe === '#recipe' && github === 0 && proto === 0 && gen === 'true' &&
      /Remixing opens this week/.test(t) && !/fork/i.test(t) && /Remix makes an AI frame from your camera/i.test(t) &&
      // /@naaate/1 is version 2, the GPT cut: its own GPT frame, its AI label, the recipe line and the frame's own label name the closed model.
      frameSrc === '/editor/1/v2/frames/cov-cafe-OTS-Z-talk-K7-g1.jpg' && /in version 2\b/i.test(t) &&
      /Pictures: AI-generated with GPT Image \(OpenAI, a closed model\), not by the author/i.test(t) &&
      /Inputs open, model closed: the pictures by GPT Image 2\.5 Sunburst \(OpenAI, a closed model\), 2026-10-18/i.test(t) &&
      /The shot.s frame · version 2 · AI-generated with GPT Image 2\.5 Sunburst \(OpenAI, a closed model\), not by the author/i.test(t) &&
      /why does Dzego like Minpentai so much/.test(t) && f.small.length === 0 && f.tiny.length === 0;
    await record(13, 'editor loads a shot', ED, 'the 3D set and the live layout draw; the frame and its set frame load; Generate is disabled ("Remixing opens this week.") where Remix is not set up, as in this test (no image key); the banner names Remix; no "fork" anywhere; version 2\'s own GPT frame, with its AI label, "Inputs open, model closed" with the model, maker and date, and the frame\'s own label naming the closed model; the recipe link (on the site, #recipe; no GitHub link) and the prototype link as "where it\'s going"; no text under 12px, no control under 44px', page, { status: res?.status() ?? null, layoutDrawn, images: imgs, frameSrc, recipe, githubLinks: github, proto, generateDisabled: gen, under12px: f.small, under44px: f.tiny }, pass);
    await page.context().close();
  }

  // 14. Play with it: drag a person and the camera, a slider, a preset, edit the prompt and the line; nothing is saved or downloaded.
  {
    const page = await newPage(browser, { width: 1440, height: 1000 });
    watchOutside(page);
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    await page.goto(BASE + ED);
    await page.locator('canvas.ed-layout').waitFor();
    await page.waitForTimeout(1200);
    const before = await page.locator('canvas.ed-layout').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    const d0 = await handleAt(page, 'B'); // Bai: Deluin has the look ring on him in this shot
    if (d0) {
      await page.mouse.move(d0.x, d0.y);
      await page.mouse.down();
      await page.mouse.move(d0.x + 40, d0.y + 25, { steps: 8 });
      await page.mouse.up();
    }
    const c0 = await handleAt(page, 'cam');
    if (c0) {
      await page.mouse.move(c0.x, c0.y);
      await page.mouse.down();
      await page.mouse.move(c0.x - 30, c0.y + 20, { steps: 8 });
      await page.mouse.up();
    }
    const fov = page.getByRole('slider', { name: /Field of view/ });
    await fov.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: 'Turn ⟳' }).click().catch(() => {});
    await page.waitForTimeout(300);
    const after = await page.locator('canvas.ed-layout').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    const caption = await page.locator('.ed-look figcaption').first().innerText();
    await page.getByRole('tab', { name: 'Prompt' }).click();
    await page.locator('#ed-prompt').fill('A test prompt, edited here only.');
    await page.getByRole('tab', { name: 'Line' }).click();
    await page.locator('.ed-line textarea').first().fill('A test line, edited here only.');
    const promptLabel = await page.getByRole('tab', { name: 'Prompt' }).click().then(() => page.locator('label[for="ed-prompt"]').innerText());
    const forkControls = await page.getByRole('button', { name: /fork/i }).count();
    const pass =
      !!d0 && !!c0 && before !== after && /changed/i.test(caption) && /edited/i.test(promptLabel) && forkControls === 0 && downloads.length === 0;
    // A preset, then reset: back to version 2 (the page's chosen version).
    await page.getByRole('button', { name: /^MASTER-wave/ }).click();
    await page.getByRole('button', { name: /^Reset to version 2/ }).click();
    const resetCaption = await page.locator('.ed-look figcaption').first().innerText();
    await record(14, 'editor play, nothing saved', ED, 'dragging Bai and the camera, the field of view and a turn change the live layout; the prompt and the line edit in the browser; no fork control and no download; Reset returns to version 2', page, { status: 200, dragged: { bai: d0, camera: c0 }, layoutChanged: before !== after, caption, promptLabel, forkControls, downloads: downloads.length, resetCaption }, pass && /as version 2/i.test(resetCaption));
    await page.context().close();
  }

  // 15. VOICE plays the converted line (never a raw take); PICTURE shows the plate and cast cards; RECIPE lists hashes, models, licences, seeds and cost.
  {
    const page = await newPage(browser, { width: 1280, height: 900 });
    watchOutside(page);
    await page.goto(BASE + ED);
    await page.getByRole('tab', { name: 'Voice' }).click();
    const src = await page.locator('.ed-pane audio').first().getAttribute('src');
    const a = src ? await fetch(BASE + src) : null;
    const played = await page.locator('.ed-pane audio').first().evaluate(async (el) => {
      const au = el as HTMLAudioElement;
      au.muted = true;
      await au.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
      return { duration: au.duration, time: au.currentTime };
    });
    const voiceText = await page.locator('.ed-pane').innerText();
    await page.getByRole('tab', { name: 'Picture' }).click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.ed-pane img')).every((i) => (i as HTMLImageElement).complete), null, { timeout: 10000 }).catch(() => {});
    const pics = await page.locator('.ed-pane img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).naturalWidth));
    await page.getByRole('tab', { name: 'Recipe' }).click();
    const rt = await page.locator('.ed-pane').innerText();
    const pass =
      !!src && /\/voice\/b4-1\.wav$/.test(src) && a?.status === 200 && /audio/.test(a.headers.get('content-type') ?? '') && played.duration > 1 && played.time > 0 &&
      /raw take stays private/i.test(voiceText) && pics.length >= 2 && pics.every((w) => w > 0) &&
      // Version 2's frame: its GPT picture's sha256 (as in its recipe and the cut), the closed model with its maker, its licence, the date and the cost.
      /d8ad958b2e1377f8bac125b1cb93627a3ac01ab532b358591eb3bf9118d406e9/.test(rt) && /GPT Image 2\.5 Sunburst \(OpenAI, a closed model\) · proprietary \(OpenAI\); weights not published/.test(rt) &&
      /2026-10-18/.test(rt) && /Inputs open, model closed/.test(rt) && /\$0\.\d{4}/.test(rt) && /adaptations\/fifteen-days\/preprod\/gpt\/frames\/cov-cafe-OTS-Z-talk-K7-g1\.png/.test(rt);
    await record(15, 'editor layers', `${ED} (Voice, Picture, Recipe)`, 'VOICE plays the converted line b4-1 from this site; PICTURE shows the plate and the cast cards; RECIPE gives the GPT frame\'s sha256 and committed file, the closed model with its maker and licence, the date and cost', page, { status: 200, voice: src, voiceStatus: a?.status ?? null, played, pictures: pics }, pass);
    await page.context().close();
  }

  // 16. Phone: the same page stacked; the 3D set takes a touch drag.
  {
    const page = await newPage(browser, { width: 390, height: 844 });
    watchOutside(page);
    await page.goto(BASE + ED);
    await page.locator('canvas.ed-layout').waitFor();
    await page.waitForTimeout(1200);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.locator('canvas.ed-orbit').scrollIntoViewIfNeeded();
    const b0 = await handleAt(page, 'B');
    const cdp = await page.context().newCDPSession(page);
    if (b0) {
      const pt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(b0.x, b0.y) });
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(b0.x + i * 4, b0.y + i * 3) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await page.waitForTimeout(300);
    const caption = await page.locator('.ed-look figcaption').first().innerText();
    const order = await page.evaluate(() => ['.ed-orbit', '.ed-layout', '.ed-pair', '.ed-generate', '.ed-tabs'].map((s) => Math.round(document.querySelector(s)!.getBoundingClientRect().top + scrollY)));
    const f = await floors(page);
    const pass = sideways <= 0 && !!b0 && /changed/i.test(caption) && order.every((y, i) => i === 0 || y > order[i - 1]) && f.small.length === 0 && f.tiny.length === 0;
    await page.screenshot({ path: path.join(OUT, '16b-editor-phone-full.png'), fullPage: true });
    await record(16, 'editor on a phone', `${ED} at 390x844`, 'no sideways scroll; set, layout, frames, Generate and the layers stacked in that order; a touch drag moves Bai; no text under 12px, no control under 44px', page, { status: 200, sidewaysScrollPx: sideways, touched: b0, caption, order, under12px: f.small, under44px: f.tiny }, pass);
    await page.context().close();
  }

  // 17. The scene page reaches the editor: every shot links to it, and so do REMIX and the recipe (on the site, no GitHub).
  {
    const page = await newPage(browser, { width: 1280, height: 900 });
    watchOutside(page);
    await page.goto(BASE + '/@naaate/1');
    await page.locator('.scene-shot').first().waitFor();
    const links = await page.locator('.scene-shot').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')));
    const remixHref = await page.getByRole('link', { name: /^Remix/ }).getAttribute('href');
    const recipeHref = await page.locator('.scene-ai a').getAttribute('href');
    const github = await page.locator('main a[href*="github.com"]').count();
    const sceneText = await mainText(page);
    await page.getByRole('link', { name: /^Remix/ }).click();
    await page.locator('canvas.ed-layout').waitFor();
    await page.waitForTimeout(300);
    const landed = local(page.url());
    const pass = links.length === 85 && links.every((h) => /^\/@naaate\/1\/shot\/[\w-]+$/.test(h ?? '')) && remixHref === '/@naaate/1/shot/first' && recipeHref === '/@naaate/1/shot/first#recipe' && github === 0 && !/\bfork/i.test(sceneText) && /^\/@naaate\/1\/shot\/(?!first)[\w-]+$/.test(landed);
    await record(17, 'scene page to the editor', '/@naaate/1', 'all 85 shots link to /@naaate/1/shot/<shot>; REMIX opens the editor on the first shot with a camera and a line, and the address shows that shot; the Recipe link opens its RECIPE tab on the site; no GitHub link and no "fork" in the page', page, { status: 200, shotLinks: links.length, remixHref, recipeHref, githubLinks: github, landed }, pass);
    await page.context().close();
  }
  // 18. Version 1's fixed link keeps its own editor: version 1's open-weight frames, its label, no closed model named.
  {
    const url = '/@naaate/1/v/1/shot/48-b4-1';
    const page = await newPage(browser, { width: 1280, height: 900 });
    watchOutside(page);
    const res = await page.goto(BASE + url);
    await page.locator('canvas.ed-layout').waitFor();
    await page.waitForTimeout(800);
    const frameSrc = await page.locator('.ed-pair img').first().getAttribute('src');
    const t = await mainText(page);
    const back = await page.getByRole('link', { name: /^Next|^Shot \d+/ }).first().getAttribute('href').catch(() => null);
    await page.getByRole('tab', { name: 'Recipe' }).click();
    const rt = await page.locator('.ed-pane').innerText();
    const pass =
      res?.status() === 200 && frameSrc === '/editor/1/v1/frames/cov-cafe-OTS-Z-talk-K7.jpg' && /in version 1\b/i.test(t) &&
      /Pictures: AI-generated, not by the author/i.test(t) && !/closed model/i.test(t) && !/GPT/.test(t) &&
      /^\/@naaate\/1\/v\/1\/shot\/[\w-]+$/.test(back ?? '') &&
      /46a381d0a0111486f8b5b2cfd6e4c169f6f61b66219ce8827f2c92425e2bc51f/.test(rt) && /Apache-2\.0/.test(rt) && /seed \d+/.test(rt);
    await record(18, "version 1's own editor", url, "version 1's open-weight frame (sha256 46a381d0…, Apache-2.0, a seed), version 1's AI label, no closed model or GPT named; its shot links stay under /@naaate/1/v/1", page, { status: res?.status() ?? null, frameSrc, shotLink: back }, pass);
    await page.context().close();
  }
  if (outside.length) failures.push(`the editor asked for things outside the site: ${[...new Set(outside)].slice(0, 5).join(', ')}`);

  // The site read as studio_writer, and viewing pages stored no names: only the four seeded
  // (owner, 2026-10-17: names are remembered at sign-in or publish, never on a page view).
  const names = await pg.query<{ fname: string }>('select fname from studio.account_names order by fname');
  const seeded = 'naaate,oldie,oldnaaate,zeiwriter';
  if (names.rows.map((r) => r.fname).join(',') !== seeded) failures.push(`viewing pages stored names: ${names.rows.map((r) => r.fname).join(',')} (expected ${seeded})`);
  const who = await pg.query<{ u: string }>('select current_user as u');
  if (who.rows[0].u !== 'studio_writer') failures.push(`the session was ${who.rows[0].u}, not studio_writer`);
  if (!asked.some((a) => a.startsWith('/v2/user-by-username?username=oldnaaate'))) failures.push('the rename was not looked up on the stand-in');
} finally {
  results.sort((x, y) => x.n - y.n);
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1) + '\n');
  await browser.close();
  next.kill();
  stub.close();
  await dbServer.stop();
}

if (/Error|error:/.test(serverErr)) console.log('server stderr:\n' + serverErr.slice(0, 3000));
console.log(`\n${results.filter((r) => r.pass).length} of ${results.length} pass; results and screenshots in ${OUT}`);
if (failures.length) {
  console.log('\nFAILURES:\n' + failures.map((f) => '- ' + f).join('\n'));
  process.exit(1);
}
console.log('test:adaptation-pages: all checks pass');
process.exit(0);
