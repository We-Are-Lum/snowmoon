/**
 * The owner-approved real-model run of Remix on this machine (2026-10-18: "1 yes", about $0.25 at
 * most). Five frames, each from a different shot, through the site's own Generate: the real image
 * model on fal.ai (FAL_KEY from main's .env.local, read and never printed), with the prompt check
 * stood in (REMIX_TEST_FAKES=guard: the development token for it has expired), an in-memory
 * database, and frames kept in a local folder, never the readers' bucket. Signed in as a local
 * wallet account with a pretend $5 balance (no real money moves).
 *
 *   npx tsx --conditions=react-server --env-file=$MAIN/.env.local scripts/remix-real-run.ts
 *
 * Writes the frames' pages and frames to .next/remix-real-run/ for the viewer.
 */
import path from 'node:path';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer as createNet } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.next', 'remix-real-run');
mkdirSync(OUT, { recursive: true });
const STORE = mkdtempSync(path.join(tmpdir(), 'remix-real-'));
// REMIX_REAL_GUARD=1: the real prompt check too (owner, 2026-10-18, after the token refresh), with
// REMIX_REAL_RUNS frames and then one wording the check must refuse.
const REAL_GUARD = process.env.REMIX_REAL_GUARD === '1';
const MAX_FRAMES = Number(process.env.REMIX_REAL_RUNS || 6);
const REFUSED = { shot: '48-b4-1', words: 'Make her completely naked.', fov: 0 };
const RUNS = [
  { shot: '48-b4-1', words: 'Night has fallen: paper lanterns glow along the railing and the sky is deep blue.', fov: 6 },
  { shot: '5-b1-1', words: 'The hall lights are dimmed and the holograms glow brighter in the dark.', fov: 0 },
  { shot: '18-b2-1', words: 'Warm late-afternoon sun slants down the corridor, long soft shadows.', fov: -4 },
  { shot: '14-b1-6', words: 'Rain streaks the window behind her; cool blue light on her face.', fov: 0 },
  { shot: '2-PIT-D', words: 'Seen from lower down, the towers loom larger; the crowd is a blur of colour.', fov: 8 },
];

if (!process.env.FAL_KEY) throw new Error('FAL_KEY is not set (run with --env-file=$MAIN/.env.local)');
const SECRET = 'remix-real-'.padEnd(48, 'x');
process.env.IMAGES_TICKET_SECRET = SECRET;
process.env.REMIX_TEST_FAKES = REAL_GUARD ? 'store' : 'guard';
process.env.REMIX_TEST_STORE = STORE;
for (const k of ['VERCEL', 'VERCEL_ENV', ...(REAL_GUARD ? [] : ['VERCEL_OIDC_TOKEN']), 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k];

const freePort = () => new Promise<number>((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const pg = new PGlite({ extensions: { vector } });
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const WALLET = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
const acct = Number((await pg.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ($1) returning id`, [WALLET])).rows[0].id);
await pg.query(`insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number) values ($1, $2, 8453, 'USDC', 5000000, 5, 1)`, ['0x' + '1'.repeat(64), acct]);
await pg.query(`insert into studio.contributor_consents (fid, kind, consent_text_sha256) select $1, 'own_words', $2`, [-acct, (await import('../src/lib/consent')).consentWording().sha256]).catch(async () => {});
await pg.exec('set role studio_writer');
const dbPort = await freePort();
const dbServer = new PGLiteSocketServer({ db: pg, port: dbPort, host: '127.0.0.1' });
await dbServer.start();
const DB_URL = `postgres://studio_writer@127.0.0.1:${dbPort}/postgres`;

const { signSession } = await import('../src/lib/wallet/session');
const token = signSession(acct, WALLET)!;
const port = await freePort();
const BASE = `http://localhost:${port}`;
const next = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(port)], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_URL: 'https://snowmoon.party', STUDIO_DATABASE_URL: DB_URL, SNOWMOON_ALERT_URL: 'http://127.0.0.1:9/never', FARCASTER_API_URL: 'http://127.0.0.1:9' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverErr = '';
next.stderr!.on('data', (d) => (serverErr += d));
for (let i = 0; i < 80; i++) {
  if ((await fetch(BASE + '/about').catch(() => null))?.ok) break;
  await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessForNavigations'] });
const done: { shot: string; words: string; id: string | null; error: string | null; cost: number | null; ms: number }[] = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await ctx.addInitScript(([t, a, e]) => localStorage.setItem('snowmoon.wallet', JSON.stringify({ token: t, address: a, short: `${(a as string).slice(0, 6)}…${(a as string).slice(-4)}`, exp: e })), [token, WALLET, exp] as const);
  const page = await ctx.newPage();
  const pageLog: string[] = [];
  page.on('console', (m) => pageLog.push(`${m.type()}: ${m.text()}`.slice(0, 300)));
  page.on('pageerror', (e) => pageLog.push(`pageerror: ${e.message}`.slice(0, 300)));
  page.on('response', (r) => { if (r.status() >= 400) pageLog.push(`${r.status()} ${r.url()}`); });
  for (const run of [...RUNS.slice(0, MAX_FRAMES), ...(REAL_GUARD ? [REFUSED] : [])]) {
    const t0 = Date.now();
    await page.goto(`${BASE}/@naaate/1/shot/${run.shot}`);
    await page.locator('canvas.ed-layout').waitFor();
    await page.locator('#ed-remix-words').waitFor({ timeout: 20000 }).catch(async (e) => { console.log(pageLog.join('\n')); await page.screenshot({ path: path.join(OUT, 'fail.png'), fullPage: true }); console.log('  url', page.url(), 'sections', await page.locator('section').evaluateAll((els) => els.map((e) => e.className + ':' + (e.getAttribute('aria-label') ?? '')))); console.log('  remix panel:', (await page.locator('.ed-remix').first().innerText().catch(() => 'none')).slice(0, 400)); console.log(serverErr.replace(/Bearer \S+/g, 'Bearer ***').slice(-1500)); throw e; });
    await page.waitForTimeout(1200);
    if (run.fov) {
      await page.getByRole('slider', { name: /Field of view/ }).focus();
      for (let i = 0; i < Math.abs(run.fov); i++) await page.keyboard.press(run.fov > 0 ? 'ArrowRight' : 'ArrowLeft');
    }
    await page.locator('#ed-remix-words').fill(run.words);
    const before = (await pg.query<{ n: number }>('select count(*)::int as n from studio.remix_frames')).rows[0].n;
    await page.getByRole('button', { name: /^Generate/ }).click();
    await page.waitForFunction(() => document.querySelector('.ed-remix > figure img') || document.querySelector('.ed-remix .ed-warn'), null, { timeout: 120000 }).catch(() => {});
    const rows = (await pg.query<{ id: string; cost_usd: string }>('select id, cost_usd from studio.remix_frames order by created_at desc limit 1')).rows;
    const made = (await pg.query<{ n: number }>('select count(*)::int as n from studio.remix_frames')).rows[0].n > before;
    const warn = made ? null : await page.locator('.ed-remix .ed-warn').innerText().catch(() => 'no answer');
    done.push({ shot: run.shot, words: run.words, id: made ? rows[0].id : null, error: warn, cost: made ? Number(rows[0].cost_usd) : null, ms: Date.now() - t0 });
    console.log(`  ${made ? 'made' : 'FAILED'} ${run.shot} ${made ? `$${rows[0].cost_usd}` : warn}`);
    if (made) {
      try {
        await page.waitForTimeout(1500);
        await page.evaluate(() => document.querySelector('.ed-remix')?.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: path.join(OUT, `editor-${run.shot}.png`) });
        const fp = await ctx.newPage();
        await fp.goto(`${BASE}/remix/${rows[0].id}`);
        await fp.locator('.rx-fig img').waitFor();
        await fp.waitForTimeout(600);
        await fp.screenshot({ path: path.join(OUT, `page-${run.shot}.png`), fullPage: true });
        await fp.close();
      } catch (e) {
        console.log(`  (screenshot skipped for ${run.shot}: ${(e as Error).message.split('\n')[0]})`);
      }
    }
  }
  for (const f of readdirSync(STORE)) copyFileSync(path.join(STORE, f), path.join(OUT, f));
  const asks = (await pg.query('select * from studio.remix_asks')).rows;
  const costs = (await pg.query<{ kind: string; funded: string; calls: number; cost_usd: string }>('select kind, funded, calls, cost_usd from studio.remix_costs')).rows;
  const frames = (await pg.query('select id, shot_id, own_words, image_sha256, cost_usd, recipe from studio.remix_frames order by created_at')).rows;
  writeFileSync(path.join(OUT, 'run.json'), JSON.stringify({ realGuard: REAL_GUARD, done, asks, costs, frames }, null, 1) + '\n');
  console.log(`\n${done.filter((d) => d.id).length} of ${done.length} made; model cost $${done.reduce((n, d) => n + (d.cost ?? 0), 0).toFixed(4)} (fal.ai, as the site counts it)`);
} finally {
  await browser.close();
  next.kill();
  await dbServer.stop().catch(() => {});
  if (/Error/.test(serverErr)) writeFileSync(path.join(OUT, 'server-stderr.txt'), serverErr.replace(/Key [A-Za-z0-9:_-]+/g, 'Key ***'));
}
process.exit(0);
