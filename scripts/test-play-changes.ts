/**
 * "Play with my changes" end to end (owner, 2026-10-18), against a LOCAL database only.
 * Fails (exit 1) on any problem. Nothing touches the hosted database, the media host or Farcaster.
 *
 *   npm run test:play-changes             (builds first: `next build`, then this script)
 *   npx tsx scripts/test-play-changes.ts --out=/some/dir   screenshots and results.json there
 *
 * Set up as test:adaptation-pages is (PGlite with every migration, a stand-in for Farcaster's name API,
 * this checkout's `next start`, the local Chrome with every request outside the site refused), except
 * that version 1's video on media.snowmoon.party is answered with a stand-in made here by ffmpeg (a
 * 290-second test picture, no sound), so the replay can really play and seek.
 *
 * Checks:
 *  1. With no change in this browser, the scene page has no "Play with my changes" button.
 *  2. In the live editor, moving the camera keeps the change in this browser (a JPEG layout, 640 × 360),
 *     with no request carrying it; reopening the shot restores the camera; the editor shows the button.
 *  3. Reset to the version's camera clears the kept change (and the button goes).
 *  4. The scene page, with that change and a seeded Remix frame for another shot: the button names 2 shots;
 *     the replay plays the version's video; inside the changed shot the layout lies over the video, exactly
 *     on its picture, labelled as a layout with no AI label; outside it nothing does; while playing it comes
 *     and goes with the video's own clock; the Remix shot shows the frame with the site's AI label; a jump
 *     button seeks; at the end nothing shows; Escape closes and gives focus back.
 *  5. A phone (390 × 844): the replay fills the screen, no sideways scroll, the overlay sits on the video.
 *  No request leaves the site (besides the stand-in video), and nothing is POSTed.
 */
import path from 'node:path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createServer as createHttp } from 'node:http';
import { createServer as createNet } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { chromium, type Browser, type Page } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const OUT = path.resolve(arg('out') ?? path.join(ROOT, '.next', 'test-play-changes'));
mkdirSync(OUT, { recursive: true });
const PUBLIC = 'https://snowmoon.party';
const freePort = () => new Promise<number>((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

// --- the stand-in video: as long as version 1's cut, small, a key frame every second --------------
const DATA = JSON.parse(readFileSync(path.join(ROOT, 'public/editor/1/v1/data.json'), 'utf8')) as { shots: { id: string; n: number; from: number; to: number; frame: string | null }[] };
const LENGTH = Math.ceil(DATA.shots[DATA.shots.length - 1].to);
const VIDEO = path.join(OUT, `stand-in-${LENGTH}s.mp4`);
if (!existsSync(VIDEO)) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=size=320x180:rate=10:duration=${LENGTH}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '10', '-crf', '35', '-movflags', '+faststart', VIDEO]);
}
const videoBytes = readFileSync(VIDEO);

// --- the database ------------------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
}
await pg.exec('set role studio_writer');
const dbPort = await freePort();
const dbServer = new PGLiteSocketServer({ db: pg, port: dbPort, host: '127.0.0.1' });
await dbServer.start();

// --- Farcaster's name API, stood in ------------------------------------------------------------
const stub = createHttp((req, res) => {
  const u = new URL(req.url ?? '/', 'http://stub');
  const send = (status: number, body: unknown) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(body)));
  if (u.pathname === '/v2/user-by-username' && u.searchParams.get('username') === 'naaate') return send(200, { result: { user: { fid: 6786, username: 'naaate' } } });
  if (u.pathname === '/v2/user' && u.searchParams.get('fid') === '6786') return send(200, { result: { user: { fid: 6786, username: 'naaate' } } });
  send(404, {});
});
await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
const stubPort = (stub.address() as { port: number }).port;

// --- the site ----------------------------------------------------------------------------------
const port = await freePort();
const BASE = `http://localhost:${port}`;
const { VERCEL_ENV: _drop, ...env } = process.env;
const next = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(port)], {
  cwd: ROOT,
  env: { ...env, NODE_ENV: 'production', NEXT_PUBLIC_URL: PUBLIC, STUDIO_DATABASE_URL: `postgres://studio_writer@127.0.0.1:${dbPort}/postgres`, FARCASTER_API_URL: `http://127.0.0.1:${stubPort}` },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverErr = '';
next.stderr.on('data', (d) => (serverErr += d));
for (let i = 0; i < 80; i++) {
  const r = await fetch(BASE + '/about').catch(() => null);
  if (r?.ok) break;
  await new Promise((r2) => setTimeout(r2, 500));
}

// --- the checks --------------------------------------------------------------------------------
type Result = { n: number; name: string; expected: string; got: Record<string, unknown>; pass: boolean; screenshot: string };
const results: Result[] = [];
const failures: string[] = [];
const outside: string[] = [];
const posted: string[] = [];
const SCENE = '/@naaate/1';
const SHOT = DATA.shots.find((s) => s.id === '48-b4-1')!;
const REMIX_SHOT = DATA.shots.find((s) => s.id === '12-b1-5')!;
const ED = `${SCENE}/shot/${SHOT.id}`;
const KEY = 'snowmoon.changes.v1.1.v1';
const local = (u: string) => u.replace(BASE, '');

async function newPage(browser: Browser, viewport = { width: 1440, height: 1000 }, opts: { touch?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: opts.touch, isMobile: opts.touch });
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    if (/^https:\/\/media\.snowmoon\.party\/scenes\/.*\.mp4$/.test(u)) {
      // Byte ranges, as the media host answers them, so the player can seek.
      const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()['range'] ?? '');
      const start = m ? +m[1] : 0;
      const end = m && m[2] ? Math.min(+m[2], videoBytes.length - 1) : videoBytes.length - 1;
      return r.fulfill({
        status: m ? 206 : 200,
        headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': String(end - start + 1), ...(m ? { 'content-range': `bytes ${start}-${end}/${videoBytes.length}` } : {}) },
        body: videoBytes.subarray(start, end + 1),
      });
    }
    if (/^https:\/\/media\.snowmoon\.party\//.test(u)) return r.abort();
    outside.push(u);
    return r.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`page error on ${local(page.url())}: ${e.message}`));
  page.on('request', (r) => r.method() !== 'GET' && r.method() !== 'HEAD' && posted.push(`${r.method()} ${local(r.url())}`));
  return page;
}

async function record(n: number, name: string, expected: string, page: Page, got: Record<string, unknown>, pass: boolean, shot = true) {
  const file = shot ? `${String(n).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png` : '';
  if (shot) await page.screenshot({ path: path.join(OUT, file) });
  results.push({ n, name, expected, got, pass, screenshot: file && path.join(OUT, file) });
  if (!pass) failures.push(`${n} ${name}: expected ${expected}; got ${JSON.stringify(got).slice(0, 600)}`);
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${n} ${name}`);
}

/** What the replay shows now: the overlay's shot and kind, and where it sits against the video's box. */
const overlay = (page: Page) =>
  page.evaluate(() => {
    const f = document.querySelector('.pc-over') as HTMLElement | null;
    const v = document.querySelector('.pc-video') as HTMLVideoElement;
    const vr = v.getBoundingClientRect();
    const fr = f?.getBoundingClientRect();
    const img = f?.querySelector('img') as HTMLImageElement | null;
    return {
      t: +v.currentTime.toFixed(2),
      paused: v.paused,
      ended: v.ended,
      shot: f?.dataset.shot ?? null,
      kind: f?.dataset.kind ?? null,
      tag: (f?.querySelector('figcaption') as HTMLElement | null)?.innerText ?? null,
      aiLabels: f ? f.querySelectorAll('button.ai-label').length : 0,
      loaded: img ? img.complete && img.naturalWidth > 0 : false,
      natural: img ? [img.naturalWidth, img.naturalHeight] : null,
      sameBox: fr ? Math.abs(fr.left - vr.left) < 1 && Math.abs(fr.top - vr.top) < 1 && Math.abs(fr.width - vr.width) < 1 && Math.abs(fr.height - vr.height) < 1 : null,
    };
  });
const seekTo = (page: Page, t: number) =>
  page.evaluate(
    (t) =>
      new Promise<void>((res) => {
        const v = document.querySelector('.pc-video') as HTMLVideoElement;
        v.addEventListener('seeked', () => setTimeout(res, 120), { once: true });
        v.currentTime = t;
      }),
    t,
  );

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessForNavigations'] });
let kept: { camera: unknown; layout: { src: string; at: number } } | null = null;
try {
  // 1. No change kept: no button.
  {
    const page = await newPage(browser);
    const res = await page.goto(BASE + SCENE);
    await page.locator('.scene-shot').first().waitFor();
    const buttons = await page.getByRole('button', { name: /Play with my changes/ }).count();
    await record(1, 'no change, no button', 'the scene page shows no "Play with my changes" button', page, { status: res?.status() ?? null, buttons }, res?.status() === 200 && buttons === 0);
    await page.context().close();
  }

  // 2 and 3. The editor keeps a change, restores it, and Reset clears it.
  {
    const page = await newPage(browser);
    await page.goto(BASE + ED);
    await page.locator('canvas.ed-layout').waitFor();
    await page.waitForTimeout(1500);
    const before = await page.evaluate((k) => localStorage.getItem(k), KEY);
    const fov = page.getByRole('slider', { name: /Field of view/ });
    await fov.focus();
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft');
    await page.getByRole('button', { name: /^Turn .* right$/ }).click();
    await page.waitForTimeout(1200);
    const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
    const stored = raw ? (JSON.parse(raw) as { shots: Record<string, { camera: { fov: number }; layout: { src: string; at: number } }> }).shots : {};
    const entry = stored[SHOT.id];
    const size = entry ? await page.evaluate((src) => new Promise<number[]>((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = src; }), entry.layout.src) : null;
    const fovSet = await fov.inputValue();
    await page.reload();
    await page.locator('canvas.ed-layout').waitFor();
    await page.waitForTimeout(1500);
    const fovAfter = await page.getByRole('slider', { name: /Field of view/ }).inputValue();
    const caption = await page.locator('.ed-look figcaption').first().innerText();
    const edButton = page.getByRole('button', { name: /Play with my changes/ });
    const edButtonText = (await edButton.count()) ? await edButton.innerText() : null;
    const pass =
      before === null && !!entry && /^data:image\/jpeg;base64,/.test(entry.layout.src) && entry.layout.src.length < 120_000 && JSON.stringify(size) === '[640,360]' &&
      String(Math.round(entry.camera.fov)) === fovSet && fovAfter === fovSet && /changed/i.test(caption) && /kept in this browser/i.test(caption) && /1 shot you changed/.test(edButtonText ?? '');
    kept = entry ?? null;
    await record(2, 'editor keeps a change', 'moving the camera keeps it in this browser with a 640x360 JPEG layout; reopening the shot restores it; the editor shows "Play with my changes" for 1 shot', page, { before, keys: Object.keys(stored), layoutBytes: entry?.layout.src.length, size, fovSet, fovAfter, caption, edButtonText }, pass);

    // Opened from the editor, the replay starts a second before this shot.
    await edButton.click();
    await page.locator('.pc-video').waitFor();
    await page.waitForFunction(() => (document.querySelector('.pc-video') as HTMLVideoElement).readyState >= 1, null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
    const startT = await page.evaluate(() => (document.querySelector('.pc-video') as HTMLVideoElement).currentTime);
    await page.keyboard.press('Escape');
    const closed = (await page.locator('.pc-sheet').count()) === 0;
    await page.getByRole('button', { name: /^Reset to version 1/ }).click();
    await page.waitForTimeout(1200);
    const afterReset = await page.evaluate((k) => localStorage.getItem(k), KEY);
    const gone = (await page.getByRole('button', { name: /Play with my changes/ }).count()) === 0;
    await record(3, 'editor replay and reset', 'the editor\'s replay starts 1 s before the shot; Escape closes it; Reset to version 1 clears the kept change and the button goes', page, { startT, expected: SHOT.from - 1, closed, afterReset, gone }, Math.abs(startT - (SHOT.from - 1)) < 0.3 && closed && afterReset === null && gone, false);
    await page.context().close();
  }

  // The kept change (from check 2) and a Remix frame for another shot, as this browser would hold them.
  const remixAt = Date.now() + 1000;
  const seeded = JSON.stringify({
    shots: {
      ...(kept ? { [SHOT.id]: { at: kept.layout.at, camera: kept.camera, layout: kept.layout } } : {}),
      [REMIX_SHOT.id]: { at: remixAt, remix: { id: 'test-remix', url: REMIX_SHOT.frame, page: '/remix/test-remix', by: '@naaate', words: 'A test frame', at: remixAt, model: { name: 'Test model', licence: 'Apache-2.0', where: 'on a test host' } } },
    },
  });

  // 4. The scene page replays the changes over the video.
  {
    const page = await newPage(browser);
    await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) (localStorage.setItem(k, v), sessionStorage.setItem('seeded', '1')); }, [KEY, seeded]);
    await page.goto(BASE + SCENE);
    const btn = page.getByRole('button', { name: /Play with my changes/ });
    await btn.waitFor({ timeout: 8000 });
    const btnText = await btn.innerText();
    await btn.click();
    await page.locator('.pc-video').waitFor();
    await page.waitForFunction(() => (document.querySelector('.pc-video') as HTMLVideoElement).readyState >= 2, null, { timeout: 15000 });
    await page.locator('.pc-list button').first().waitFor();
    const src = await page.locator('.pc-video').getAttribute('src');
    const dialog = await page.getByRole('dialog', { name: /Your changes/ }).count();
    const focusInside = await page.evaluate(() => !!document.activeElement?.closest('.pc-sheet'));
    const jumps = await page.locator('.pc-list button').allInnerTexts();

    await seekTo(page, SHOT.from + 0.5);
    await page.waitForTimeout(200);
    const inside = await overlay(page);
    await page.screenshot({ path: path.join(OUT, '04a-desktop-layout-over-video.png') });
    await seekTo(page, SHOT.from - 2);
    const before = await overlay(page);
    await seekTo(page, SHOT.to + 0.5);
    const after = await overlay(page);

    // Playing: the overlay arrives on the video's own clock, and leaves at the shot's end.
    await seekTo(page, SHOT.from - 0.8);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const seen: { t: number; shot: string | null }[] = [];
    for (let i = 0; i < 18; i++) {
      await page.waitForTimeout(100);
      const o = await overlay(page);
      seen.push({ t: o.t, shot: o.shot });
    }
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const wrong = seen.filter((s) => (s.t >= SHOT.from + 0.12 && s.t < SHOT.to - 0.12 && s.shot !== SHOT.id) || ((s.t < SHOT.from - 0.12 || s.t > SHOT.to + 0.12) && s.shot !== null));
    const playedIn = seen.some((s) => s.shot === SHOT.id) && seen.some((s) => s.shot === null);

    // The Remix shot, by its jump button.
    await page.locator('.pc-list button', { hasText: `Shot ${REMIX_SHOT.n} ` }).click();
    await page.waitForTimeout(700);
    await page.locator('.pc-video').evaluate((v) => (v as HTMLVideoElement).pause());
    await page.waitForTimeout(300);
    const remix = await overlay(page);
    await page.screenshot({ path: path.join(OUT, '04b-desktop-remix-over-video.png') });

    // The end.
    await seekTo(page, LENGTH - 0.3);
    await page.locator('.pc-video').evaluate((v) => (v as HTMLVideoElement).play());
    await page.waitForFunction(() => (document.querySelector('.pc-video') as HTMLVideoElement).ended, null, { timeout: 5000 }).catch(() => {});
    const end = await overlay(page);
    const playLabel = await page.locator('.pc-play').innerText();
    await page.keyboard.press('Escape');
    const closed = (await page.locator('.pc-sheet').count()) === 0;
    const focusBack = await page.evaluate(() => /Play with my changes/i.test((document.activeElement as HTMLElement | null)?.innerText ?? ''));

    const pass =
      /2 shots you changed, over version 1/.test(btnText) && /^https:\/\/media\.snowmoon\.party\/scenes\/fifteen-days\/v1\/.*\.mp4$/.test(src ?? '') && dialog === 1 && focusInside &&
      jumps.length === 2 &&
      inside.shot === SHOT.id && inside.kind === 'layout' && inside.loaded && inside.sameBox === true && /grey layout, no AI/i.test(inside.tag ?? '') && inside.aiLabels === 0 &&
      before.shot === null && after.shot === null &&
      playedIn && wrong.length === 0 &&
      remix.shot === REMIX_SHOT.id && remix.kind === 'remix' && remix.loaded && remix.aiLabels === 1 && /AI image · by @naaate/i.test(remix.tag ?? '') &&
      end.ended && end.shot === null && /^play$/i.test(playLabel) && closed && focusBack;
    await record(4, 'scene replay', 'the button names 2 shots; the replay plays version 1\'s video; the layout lies exactly over the video inside the changed shot (no AI label), nothing outside; while playing it follows the video clock; the Remix shot shows its frame with the AI label; at the end nothing; Escape closes and focus returns', page, { btnText, src, dialog, focusInside, jumps, inside, before, after, seen, wrong, remix, end, playLabel, closed, focusBack }, pass);
    await page.context().close();
  }

  // 5. A phone.
  {
    const page = await newPage(browser, { width: 390, height: 844 }, { touch: true });
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, seeded]);
    await page.goto(BASE + SCENE);
    const btn = page.getByRole('button', { name: /Play with my changes/ });
    await btn.waitFor({ timeout: 8000 });
    await page.screenshot({ path: path.join(OUT, '05a-phone-button.png'), fullPage: false });
    const btnBox = await btn.boundingBox();
    await btn.click();
    await page.waitForFunction(() => (document.querySelector('.pc-video') as HTMLVideoElement | null)?.readyState! >= 2, null, { timeout: 15000 });
    await page.locator('.pc-list button').first().waitFor();
    await seekTo(page, SHOT.from + 0.5);
    await page.waitForTimeout(300);
    const o = await overlay(page);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const sheet = await page.locator('.pc-sheet').boundingBox();
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('.pc-sheet *'))) {
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (own && parseFloat(getComputedStyle(el).fontSize) < 12) out.push(el.className as string);
      }
      for (const el of Array.from(document.querySelectorAll('.pc-sheet .pc-btn, .pc-sheet .pc-close, .pc-sheet .pc-seek'))) if (el.getBoundingClientRect().height < 43.5) out.push(`${(el as HTMLElement).className} under 44px`);
      return out;
    });
    const pass = o.shot === SHOT.id && o.kind === 'layout' && o.sameBox === true && sideways <= 0 && !!sheet && sheet.width <= 390 && small.length === 0 && (btnBox?.height ?? 0) >= 44;
    await record(5, 'phone replay', 'at 390x844 the replay fills the screen with no sideways scroll; the layout lies exactly over the video; text 12px+, controls 44px+', page, { overlay: o, sideways, sheet, small, button: btnBox }, pass);
    await page.context().close();
  }
} finally {
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1) + '\n');
  await browser.close();
  next.kill();
  stub.close();
  await dbServer.stop();
}

if (outside.length) failures.push(`requests outside the site: ${[...new Set(outside)].slice(0, 5).join(', ')}`);
if (posted.length) failures.push(`requests that send something: ${[...new Set(posted)].slice(0, 5).join(', ')}`);
if (/Error|error:/.test(serverErr)) console.log('server stderr:\n' + serverErr.slice(0, 3000));
console.log(`\n${results.filter((r) => r.pass).length} of ${results.length} pass; results and screenshots in ${OUT}`);
if (failures.length) {
  console.log('\nFAILURES:\n' + failures.map((f) => '- ' + f).join('\n'));
  process.exit(1);
}
console.log('test:play-changes: all checks pass');
process.exit(0);
