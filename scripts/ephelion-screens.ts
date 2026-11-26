/**
 * Screenshots of the Ephelion challenge pages (/ephelion, later /ephelion/record) for a review page: phone (390 px) and
 * desktop (1440 px), against this checkout's production build started here with the voice test switch, the stub
 * ElevenLabs and a throwaway in-memory database (no production anything). One ready-made reading is made through the
 * stub first, so a card has an AI reading to play.
 *   npx next build && tsx scripts/ephelion-screens.ts --url=http://127.0.0.1:3079 --out=/path
 * Run it with the worktree's .env.local moved aside (the server must not read production settings).
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStub } from './lib/elevenlabs-stub';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const url = arg('url');
const out = arg('out');
if (!url || !out || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) throw new Error('--url=http://127.0.0.1:<port> and --out are required');
if (existsSync(path.join(ROOT, '.env.local'))) throw new Error('move .env.local aside first: the server must not read production settings');
mkdirSync(out, { recursive: true });
const PORT = Number(new URL(url).port);
const NATE = 6786;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const pgServer = new PGLiteSocketServer({ db: pg, port: 54387, host: '127.0.0.1' });
await pgServer.start();
const stub = await startStub(54397, { bytesPerSecond: 16500 });
const STORE = mkdtempSync(path.join(os.tmpdir(), 'ephelion-screens-'));
const env = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  NODE_ENV: 'production',
  STUDIO_DATABASE_URL: 'postgres://studio_writer@127.0.0.1:54387/postgres',
  VOICE_TEST_ON: '1',
  VOICE_TEST_FID: String(NATE),
  VOICE_TEST_STORE: STORE,
  ELEVENLABS_BASE_URL: 'http://127.0.0.1:54397',
  VOICE_TICKET_SECRET: 'ephelion-screens-secret-0123456789',
} as NodeJS.ProcessEnv;
const server = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(PORT), '-H', '127.0.0.1'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
const log: string[] = [];
server.stdout.on('data', (d: Buffer) => log.push(String(d)));
server.stderr.on('data', (d: Buffer) => log.push(String(d)));
try {
  for (let i = 0; ; i++) {
    if (await fetch(`${url}/api/version`).then((r) => r.ok, () => false)) break;
    if (i > 120) throw new Error(`the server didn't start: ${log.join('').slice(-800)}`);
    await sleep(500);
  }
  const api = (p: string, init: RequestInit = {}) => fetch(`${url}/api/voice/${p}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer voice-test-${NATE}` } });
  const st = (await (await api('status')).json()) as { consent: { sha256: string }; speeches: { id: string }[]; choices: { presetId: string; candidate: number }[] };
  await api('consent', { method: 'POST', body: JSON.stringify({ sha256: st.consent.sha256 }) });
  const made = await api('reading', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speechId: st.speeches[0].id, presetId: st.choices[0].presetId, candidate: st.choices[0].candidate }) });
  console.log('reading for the first speech:', made.status);
  const sm = await api('samples', { method: 'POST' });
  console.log('voice samples made:', sm.status, JSON.stringify(((await sm.json()) as { made?: number }).made));

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const shots: string[] = [];
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: w, height: h } });
    await ctx.addInitScript((fid) => {
      localStorage.setItem('snowmoon.signin', JSON.stringify({ token: `voice-test-${fid}`, fid, username: 'naaate', exp: Math.floor(Date.now() / 1000) + 86400 }));
      localStorage.setItem('snowmoon.intro-seen', 'v2');
    }, NATE);
    await ctx.route('**/api/chat/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":false}' }));
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${url}/ephelion`);
    await page.locator('.eph-card').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(800);
    const name = (s: string) => path.join(out, `${s}-${w}.png`);
    await page.screenshot({ path: name('01-landing'), fullPage: w === 390 });
    if (w === 390) { await page.screenshot({ path: name('00-landing-first-screen') }); shots.push(name('00-landing-first-screen')); }
    shots.push(name('01-landing'));
    await page.locator('.eph-link').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: name('02-learn-more'), fullPage: w === 390 });
    shots.push(name('02-learn-more'));
    // The buttons: equal, on one line each.
    const sizes = await page.locator('.eph-two > *').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));
    console.log(w, 'buttons', JSON.stringify(sizes), errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
    const panes = await page.evaluate(() => { const l = document.querySelector('.eph-left')!.getBoundingClientRect(); const r = document.querySelector('.eph-right')!.getBoundingClientRect(); return { page: Math.round(document.querySelector('.eph-wrap')!.getBoundingClientRect().width), twoPanes: Math.abs(l.top - r.top) < 2 && r.left > l.right - 1 }; });
    console.log(w, 'panes', JSON.stringify(panes));
    const top = await page.evaluate(() => { const i = document.querySelector('.eph-image')!.getBoundingClientRect(); const k = document.querySelector('.eph-hero-text > .eph-up')!.getBoundingClientRect(); const h = document.querySelector('.eph-hero-text > h1')!.getBoundingClientRect(); return { imageTop: Math.round(i.top), labelTop: Math.round(k.top), titleBottom: Math.round(h.bottom), imageBottom: Math.round(i.bottom) }; });
    console.log(w, 'hero', JSON.stringify(top));
    // The first card's AI reading plays (the drafts route serves a shared reading). Learn more shut first.
    await page.locator('.eph-link').first().click();
    await page.waitForTimeout(300);
    const play = page.locator('.eph-card .eph-play:not(.eph-play-empty)').first();
    if (await play.count()) { await play.click(); await page.locator('.eph-card audio').first().waitFor({ timeout: 15_000 }).then(() => console.log(w, 'reading plays: audio element shown'), () => console.log(w, 'reading did NOT load')); }
    // Desktop with the assistant panel closed: the page gets the room for two panes.
    const close = page.locator('button[aria-label="Close the assistant"]');
    if (w === 1440 && (await close.count())) {
      await close.first().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: name('03-landing-panel-closed') });
      shots.push(name('03-landing-panel-closed'));
      await page.locator('.eph-link').first().click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: name('04-learn-more-panel-closed') });
      shots.push(name('04-learn-more-panel-closed'));
      const two = await page.locator('.eph-two > *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
      const img = await page.locator('.eph-image').evaluate((e) => Math.round(e.getBoundingClientRect().bottom));
      const btn = await page.locator('.eph-two').evaluate((e) => Math.round(e.getBoundingClientRect().bottom));
      console.log('panel closed: buttons', JSON.stringify(two), 'image bottom', img, 'buttons bottom', btn);
    }
    await ctx.close();
  }

  // The four-step recorder (PR 2): every step, phone and desktop (the site's menus and the assistant are hidden there).
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: w, height: h }, permissions: ['microphone'] });
    await ctx.addInitScript((fid) => {
      localStorage.setItem('snowmoon.signin', JSON.stringify({ token: `voice-test-${fid}`, fid, username: 'naaate', exp: Math.floor(Date.now() / 1000) + 86400 }));
      localStorage.setItem('snowmoon.intro-seen', 'v2');
    }, NATE);
    await ctx.route('**/api/chat/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":false}' }));
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const name = (s: string) => path.join(out, `${s}-${w}.png`);
    const shot = async (s: string, full = false) => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: name(s), fullPage: full });
      shots.push(name(s));
    };
    await page.goto(`${url}/ephelion/record`);
    await page.locator('button[data-step="1"]').waitFor({ timeout: 30_000 });
    await shot('10-rec-speech-list');
    await page.locator('button[data-speech]').nth(1).click();
    await shot('11-rec-speech-detail');
    await page.getByRole('button', { name: 'Use this speech' }).click();
    await page.locator('[data-voice]').first().click();
    await shot('12-rec-voice');
    await page.getByRole('button', { name: 'Next: record' }).click();
    const agree = page.getByRole('button', { name: 'I agree' });
    if (await agree.count()) {
      await shot('13-rec-consent', w === 390);
      await agree.click();
    }
    await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 30_000 });
    await shot('14-rec-record-ready');
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.locator('.er-badge-count').waitFor({ timeout: 5_000 });
    await shot('15-rec-countdown');
    await page.locator('.er-badge-rec').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(2600);
    await shot('16-rec-recording');
    await page.locator('.er-script').dispatchEvent('wheel');
    await shot('17-rec-paused');
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.getByRole('button', { name: 'Stop' }).first().click();
    await page.getByRole('button', { name: 'Next: listen' }).waitFor({ timeout: 30_000 });
    await page.getByText(/saved on this|Saved on this/).first().waitFor({ timeout: 10_000 }).catch(() => {});
    await shot('18-rec-stopped');
    await page.getByRole('button', { name: 'Next: listen' }).click();
    await page.locator('.er-take').waitFor({ timeout: 15_000 });
    await shot('19-rec-listen', w === 390);
    await page.locator('.er-tick input[type="checkbox"]').check();
    await page.getByRole('button', { name: /^Make it his voice/ }).click();
    await page.locator('.er-converted').waitFor({ timeout: 60_000 });
    await page.locator('[data-slot="take-label"]').first().waitFor({ timeout: 30_000 }).catch(() => {});
    await shot('20-rec-converted', w === 390);
    // "Choose his scene" (PR 3): the three presets, marked placeholders; pick one, play the preview.
    await page.locator('[data-slot="scenes"] [data-scene]').nth(1).click();
    await page.locator('.es-playbtn').first().click();
    await page.waitForTimeout(1500);
    await shot('22-rec-scene-picked', w === 390);
    const sc = await page.evaluate(() => ({
      cards: [...document.querySelectorAll('[data-slot="scenes"] [data-scene]')].map((e) => e.getAttribute('data-scene')),
      placeholders: document.querySelectorAll('[data-slot="scenes"] [data-placeholder="true"]').length,
      picked: document.querySelector('[data-slot="scenes"] [aria-checked="true"]')?.getAttribute('data-scene'),
      stage: document.querySelector('.es-stage [data-placeholder="true"]')?.textContent,
      kept: localStorage.getItem('snowmoon.ephelion.scene'),
      describeOwn: /Describe your own/.test(document.body.innerText),
      time: document.querySelector('.es-time')?.textContent,
    }));
    console.log(w, 'scenes', JSON.stringify(sc));
    await page.locator('button[data-step="3"]').click();
    await page.getByRole('button', { name: /^Edit (the )?text$/ }).first().click();
    await shot('21-rec-edit-text');
    console.log(w, 'recorder', errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
    await ctx.close();
  }
  await browser.close();
  console.log(shots.join('\n'));
} finally {
  server.kill('SIGTERM');
  await stub.close?.();
  await pgServer.stop();
}
