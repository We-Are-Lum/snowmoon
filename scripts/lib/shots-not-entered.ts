/**
 * Screenshots of "Published, not entered" (2026-11-27) on a local production build, against local fixture data only
 * (scripts/fixtures/challenge-db.ts, an in-memory PGlite), never production. Run after `next build`:
 *   tsx --conditions=react-server scripts/lib/shots-not-entered.ts <out dir>
 * Sign-ins are the fixtures' stand-in sessions (planted in the browser's storage); /api/admin/bounty and the submit
 * API's GET are answered in the browser from the same local data, as check:ui does.
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { chromium } from 'playwright-core';
import { startChallengeDb, FIXTURE_CHALLENGE as FX } from '../fixtures/challenge-db';
import { CHALLENGE } from '../../src/lib/config';

const OUT = process.argv[2];
if (!OUT) throw new Error('say where the screenshots go');
const freePort = () => new Promise<number>((res) => { const s = createServer(); s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const data = await startChallengeDb(await freePort());
await data.addEntries();
// Two more pictures in the window, so the lists show their kinds: one by a maker who didn't pass the check (on both
// lists; its eligibility only on the admin list), one submitted then withdrawn (on both).
const base = FX.sheets.zei[0];
{
  const sql = postgres(data.url, { prepare: false, max: 1, onnotice: () => {} });
  for (const [fid, decision, at, withdrawn] of [[903, 'below', '2026-11-12T08:30:00.000Z', false], [904, 'passed', '2026-11-12T08:45:00.000Z', true]] as const) {
    const recipe = randomUUID(), element = randomUUID(), version = randomUUID();
    await sql`insert into studio.recipes ${sql({ id: recipe, source: 'in_app', provider: 'fal.ai', model: 'flux2-klein-4b-edit', model_version: 'e', prompt: 'p', params: sql.json({ user_prompt: `Fixture ${fid}`, by_name: `fixture${fid}`, anchor: { chapter: 2, start: 2, end: 2 }, challenge: { character: 'zei', from: base, fromKind: 'sheet', model: 'flux2-klein-4b-edit' } } as never), seed: 1, cost_usd: 0.009, created_by_fid: fid, created_at: at })}`;
    await sql`insert into studio.elements ${sql({ id: element, work_id: 'snowmoon', element_type: 'image', created_by_fid: fid, status: 'published', created_at: at })}`;
    await sql`insert into studio.element_versions ${sql({ id: version, element_id: element, version_no: 1, body: sql.json({ lettering: [] } as never), asset_url: 'https://media.snowmoon.party/images/seed/c1/c1-b005-toy-drone-ea7f59a8c05f.jpg', asset_sha256: String(fid).repeat(22).slice(0, 64), recipe_id: recipe, created_at: at })}`;
    await sql`insert into studio.anchors ${sql({ version_id: version, work_id: 'snowmoon', chapter: 2, start_idx: 2, end_idx: 2 })}`;
    await sql`insert into studio.links ${sql({ from_version_id: version, to_version_id: base, kind: 'uses' })}`;
    await sql`insert into studio.challenge_eligibility ${sql({ version_id: version, challenge: CHALLENGE.id, fid, decision, eligible: decision === 'passed' })}`;
    if (withdrawn) await sql`insert into studio.challenge_marks ${sql({ challenge: CHALLENGE.id, fid, character: 'zei', version_id: version, marked_at: at, withdrawn_at: '2026-11-12T09:30:00.000Z' })}`;
  }
  // The admin list's answer, read from the same local data (no Base read: the bounty part says it couldn't be read).
  const { reviewView } = await import('../../src/lib/review/review');
  const noChain = { readContract: async () => { throw new Error('offline'); }, multicall: async () => { throw new Error('offline'); } };
  const v = await reviewView(sql as never, 6786, { reader: noChain as never });
  (globalThis as { adminBody?: unknown }).adminBody = v.body;
  const { notEnteredAll, notEnteredShown } = await import('../../src/lib/challenge/entries');
  const all = await notEnteredAll(sql as never);
  console.log(`local data: admin list ${all.length}, public section ${notEnteredShown(all).length}`);
  await sql.end();
}
const port = await freePort();
const server = spawn(process.execPath, [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)], { env: { ...process.env, STUDIO_DATABASE_URL: data.url }, stdio: 'ignore' });
const LOCAL = `http://localhost:${port}`;
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (let i = 0; ; i++) {
    if (await fetch(`${LOCAL}/challenge/entries`).then((r) => r.ok, () => false)) break;
    if (i > 120) throw new Error('the local build did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  const cand = FX.candidate;
  const shot = async (name: string, o: { w: number; h: number; scheme: 'light' | 'dark'; as?: number | null; url: string; sel: string; wait?: string; admin?: boolean }) => {
    const ctx = await browser.newContext({ viewport: { width: o.w, height: o.h }, colorScheme: o.scheme, hasTouch: o.w < 700 });
    const page = await ctx.newPage();
    await page.addInitScript(`try{localStorage.setItem('snowmoon.theme','${o.scheme}');localStorage.setItem('snowmoon.intro-seen','999')}catch(e){}`);
    if (o.as) {
      await page.addInitScript(`try{localStorage.setItem('snowmoon.signin',${JSON.stringify(JSON.stringify({ token: 'stand-in', fid: o.as, username: `fixture${o.as}`, nameProof: null, exp: 4102444800 }))})}catch(e){}`);
      await page.route('**/api/challenge/submit', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { left: 1, versions: [], person: o.as } }) : r.continue()));
    }
    // The assistant's status would answer a stand-in session 401, which signs it out: not asked here.
    if (o.as) await page.route('**/api/chat/status**', (r) => r.abort());
    if (o.admin) await page.route('**/api/admin/bounty**', (r) => r.fulfill({ json: (globalThis as { adminBody?: unknown }).adminBody }));
    page.on('console', (m) => { if (m.type() === 'error') console.log(`${name} console: ${m.text().slice(0, 200)}`); });
    await page.goto(LOCAL + o.url, { waitUntil: 'load' });
    await page.waitForSelector(o.sel, { timeout: 30000 }).catch(async (e) => {
      await page.screenshot({ path: path.join(OUT, `${name}-FAILED.png`), fullPage: true });
      throw e;
    });
    if (o.wait) await page.waitForSelector(o.wait, { timeout: 10000 }).catch(() => console.log(`${name}: ${o.wait} never showed`));
    await page.evaluate(() => document.fonts.ready);
    // Lazy pictures: load them all before the shot.
    await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      for (const i of imgs) i.loading = 'eager';
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }))));
    });
    await page.waitForTimeout(800);
    const el = page.locator(o.sel).first();
    await el.scrollIntoViewIfNeeded();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const enter = await page.locator('[data-slot="enter-it"]').count();
    await el.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(`${name}: "Enter it" buttons ${enter}${sideways ? ', SCROLLS SIDEWAYS' : ''}`);
    await ctx.close();
  };
  const S = '[data-slot="not-entered"]';
  if (!process.env.ONLY_ADMIN) {
  await shot('challenge-entries-not-entered-390-light', { w: 390, h: 844, scheme: 'light', url: '/challenge/entries', sel: S });
  await shot('challenge-entries-not-entered-1440-light', { w: 1440, h: 900, scheme: 'light', url: '/challenge/entries', sel: S });
  await shot('challenge-entries-not-entered-390-dark', { w: 390, h: 844, scheme: 'dark', url: '/challenge/entries', sel: S });
  await shot('challenge-entries-not-entered-1440-dark', { w: 1440, h: 900, scheme: 'dark', url: '/challenge/entries', sel: S });
  await shot('challenge-entries-not-entered-390-maker', { w: 390, h: 844, scheme: 'light', as: cand.fid, url: '/challenge/entries', sel: S, wait: '[data-slot="enter-it"]' });
  await shot('challenge-entries-not-entered-1440-maker', { w: 1440, h: 900, scheme: 'light', as: cand.fid, url: '/challenge/entries', sel: S, wait: '[data-slot="enter-it"]' });
  await shot('challenge-entries-not-entered-390-someone-else', { w: 390, h: 844, scheme: 'light', as: 901, url: '/challenge/entries', sel: S });
  }
  await shot('admin-bounty-not-entered-390-light', { w: 390, h: 844, scheme: 'light', as: 6786, admin: true, url: '/admin/bounty', sel: '[data-slot="not-entered"]' });
  await shot('admin-bounty-not-entered-1440-dark', { w: 1440, h: 900, scheme: 'dark', as: 6786, admin: true, url: '/admin/bounty', sel: '[data-slot="not-entered"]' });
  // "Enter it" leads to the picture's Submit section.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript(`try{localStorage.setItem('snowmoon.signin',${JSON.stringify(JSON.stringify({ token: 'stand-in', fid: cand.fid, username: `fixture${cand.fid}`, nameProof: null, exp: 4102444800 }))})}catch(e){}`);
    await page.route('**/api/challenge/submit', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { left: 1, versions: [], person: cand.fid } }) : r.continue()));
    await page.goto(`${LOCAL}/challenge/entries`, { waitUntil: 'load' });
    await page.locator('[data-slot="enter-it"]').first().click();
    await page.waitForSelector('#submit .ch-submit', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    console.log(`after "Enter it": ${new URL(page.url()).pathname}${new URL(page.url()).hash}, Submit section shown: ${await page.locator('#submit').isVisible()}`);
    await page.screenshot({ path: path.join(OUT, 'enter-it-lands-on-submit-390.png') });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
  await data.stop();
}
process.exit(0);
