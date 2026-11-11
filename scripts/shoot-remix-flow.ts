/**
 * Screenshots of the remix flow (owner, 2026-11-10), for a design pass: challenge list → character → remix → make →
 * publish → share → submit, at 390 and 1440 wide. Runs this checkout's build (`next build` first) on the local fixture
 * database (scripts/fixtures/challenge-db.ts), signed in as a planted Farcaster account (FID 4242). Making, publishing
 * and the submit check are answered here, so no model is called, nothing is paid and nothing reaches the live site.
 * The pictures: the fixture's base files are swapped for a real base's file, and the "made" picture for a local file.
 *
 *   npx tsx --conditions=react-server scripts/shoot-remix-flow.ts --out=<folder> [--base=<base picture url>] [--made=<local jpg>]
 */
import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium, type Page, type Route } from 'playwright-core';
import { startChallengeDb, FIXTURE_CHALLENGE as FX } from './fixtures/challenge-db';
import { submitWords } from '../src/lib/challenge/sheet-lines';
import { PICTURE_WORDING as P } from '../src/lib/challenge/picture-wording';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const OUT = arg('out');
if (!OUT) throw new Error('--out=<folder> is required');
const BASE_PIC = arg('base');
const MADE = arg('made');
mkdirSync(OUT, { recursive: true });

const freePort = () =>
  new Promise<number>((res) => {
    const s = createServer();
    s.listen(0, () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
  });

const SEED = ['https://media.snowmoon.party/images/seed/c1/c1-b013-sky-bridge-64be33275e53.jpg', 'https://media.snowmoon.party/images/seed/c1/c1-b005-toy-drone-ea7f59a8c05f.jpg'];
const MADE_URL = 'https://media.snowmoon.party/fixture/made-for-screenshots.jpg';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
const TOKEN = `x.${b64({ sub: 'fixture', exp: 4102444800 })}.y`;
const FID = 4242;

async function main() {
  const data = await startChallengeDb(await freePort());
  const port = await freePort();
  const server = spawn(process.execPath, [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)], { env: { ...process.env, STUDIO_DATABASE_URL: data.url }, stdio: 'ignore' });
  const LOCAL = `http://localhost:${port}`;
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (let i = 0; !(await fetch(LOCAL).then((r) => r.ok, () => false)); i++) {
      if (i > 120) throw new Error('the local build did not start (run next build first)');
      await new Promise((r) => setTimeout(r, 500));
    }
    // The character page and the hub are cached from the build's database: wait for the fixture's own data.
    for (const [p, want] of [['/challenge/zei', FX.remixes[0].versionId], ['/challenge', FX.sheets.zei[0]]] as const)
      for (let i = 0; i < 90 && !(await fetch(LOCAL + p).then((r) => r.text(), () => '')).includes(want); i++) await new Promise((r) => setTimeout(r, 1000));

    const basePic = BASE_PIC ? Buffer.from(await (await fetch(BASE_PIC)).arrayBuffer()) : null;
    const madePic = MADE ? readFileSync(MADE) : null;
    const published = FX.remixes[0].versionId;
    const zeiRemix = FX.remixes.find((r) => r.character === 'zei')!.versionId;

    for (const [w, h, mobile] of [[390, 844, true], [1440, 900, false]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme: 'light' });
      await ctx.addInitScript(({ token, fid }) => {
        localStorage.setItem('snowmoon.signin', JSON.stringify({ token, fid, username: 'fixture', exp: 4102444800 }));
        localStorage.setItem('snowmoon.assistant.closed', '1');
      }, { token: TOKEN, fid: FID });
      // The fixture's base files → a real base; the made picture → a local file.
      if (basePic) for (const u of SEED) await ctx.route(u, (r) => r.fulfill({ body: basePic, contentType: 'image/jpeg' }));
      if (madePic) await ctx.route(MADE_URL, (r) => r.fulfill({ body: madePic, contentType: 'image/jpeg' }));
      await ctx.route('**/api/**', async (r: Route) => {
        const req = r.request();
        const u = new URL(req.url());
        if (u.pathname === '/api/you') return r.fulfill({ json: { work: { images: [], scenes: [], designs: [] }, maintainer: false, prices: null, wallet: null, link: null, linkedWallets: [], who: { kind: 'farcaster', name: '@fixture', handle: 'fixture', fid: FID, username: 'fixture' } } });
        if (u.pathname === '/api/chat/status') return r.fulfill({ json: { available: false, model: 'm', host: null, provider: null, route: '', perDay: 30, left: 30 } });
        if (u.pathname === '/api/consent') return r.fulfill({ json: { wording: { sha256: 'x', title: 'x', text: ['x'] }, signedIn: true, agreed: true } });
        if (u.pathname === '/api/challenge/make' && req.method() === 'POST')
          return r.fulfill({ json: { ticket: 'fixture-ticket', image: MADE_URL, prompt: '(fixture: no model was called)', style: null, setting: null } });
        if (u.pathname === '/api/challenge/make') {
          // The real screen's data, from the fixture database, as a signed-in visitor with pictures left.
          const res = await r.fetch({ headers: { ...req.headers(), authorization: '' } });
          const j = await res.json();
          return r.fulfill({ json: { ...j, picturesLeft: 3, modelsNote: null } });
        }
        if (u.pathname === '/api/images/publish') return r.fulfill({ json: { versionId: published } });
        if (u.pathname === '/api/challenge/picture') {
          const res = await r.fetch({ headers: { ...req.headers(), authorization: '' } });
          const j = await res.json();
          const name = j.name ?? 'Zei';
          return r.fulfill({ json: { ...j, byFid: FID, url: MADE_URL, beforeOpen: null, notYet: null, submit: { ...submitWords(false, name), postText: P.postText(name, null) } } });
        }
        if (u.pathname === '/api/challenge/submit') return r.fulfill({ json: { left: 1, person: FID } });
        return r.fallback();
      });
      const page = await ctx.newPage();
      let n = 0;
      const shot = async (name: string) => {
        await page.waitForTimeout(1200);
        const f = `${String(++n).padStart(2, '0')}-${name}-${w}`;
        await page.screenshot({ path: `${OUT}/${f}.png` });
        await page.screenshot({ path: `${OUT}/${f}-full.png`, fullPage: true });
        console.log(`${w} ${name}: ${page.url().replace(LOCAL, '')}`);
      };
      await page.goto(`${LOCAL}/challenge`, { waitUntil: 'load' });
      await shot('challenge');
      await page.goto(`${LOCAL}/challenge/zei`, { waitUntil: 'load' });
      await shot('character');
      await page.locator('.ch-char-bases .cc-tile').first().click();
      await page.waitForSelector('.mk-source');
      await shot('remix');
      await page.locator('.mk-page textarea').first().fill('Zei in a winter coat, snow in his hair');
      const open = page.locator('.mk-model-chip', { hasText: '· open' });
      if (await open.count()) await open.first().click();
      await shot('remix-filled');
      await page.locator('.mk-make').first().click();
      await page.waitForURL(/\/challenge\/make\/[0-9a-f-]{36}/, { timeout: 20000 });
      await page.waitForSelector('.mk-publish');
      await shot('made');
      await page.locator('.mk-publish').first().click();
      await page.waitForURL(/\/challenge\/p\//, { timeout: 20000 });
      await page.waitForSelector('.sf-share, .sf-submit', { timeout: 20000 });
      await shot('published-share');
      await page.locator('.sf-submit').last().scrollIntoViewIfNeeded().catch(() => {});
      await shot('submit');
      void zeiRemix;
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
    await data.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
