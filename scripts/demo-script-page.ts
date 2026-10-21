/**
 * Screenshots of the script page at phone width (owner, 2026-10-20: "phone first"), on the local stage with
 * stand-ins: a few notes and a rewrite filed through the API as the owner, then the page, the re-record sheet and
 * a line opened for a rewrite. Writes PNGs to the folder given as the first argument (never committed).
 *   npm run build && tsx --conditions=react-server scripts/demo-script-page.ts <out-dir>
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startStage } from './lib/agents-harness';

const OUT = path.resolve(process.argv[2] ?? 'demo-script-page');
mkdirSync(OUT, { recursive: true });
const S = await startStage({ port: 3457, public: false });
const A = S.people.A;
const post = (body: unknown) => fetch(`${S.BASE}/api/direction`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${A.token}` }, body: JSON.stringify({ adaptation: 1, version: 2, ...(body as object) }) });
try {
  for (const b of [
    { action: 'note', kind: 'intent', shot: '14-b1-6', text: 'The viewer should feel Bai has already won.' },
    { action: 'note', kind: 'acting', shot: '14-b1-6', character: 'Bai', text: 'Eyes on the pieces, not on Zei. He doesn’t look up until “toast”.' },
    { action: 'note', kind: 'delivery', cue: 'b1-6', text: 'Quieter, almost to himself.' },
    { action: 'rewrite', cue: 'b1-6', text: 'That one’s toast, and he doesn’t even know it.' },
  ]) {
    const r = await post(b);
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  }
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const payload = JSON.parse(Buffer.from(A.token.split('.')[1], 'base64url').toString()) as { exp: number };
  const a = A.address.toLowerCase();
  await ctx.addInitScript((v) => localStorage.setItem('snowmoon.wallet', v), JSON.stringify({ token: A.token, address: a, short: `${a.slice(0, 6)}…${a.slice(-4)}`, exp: payload.exp }));
  const page = await ctx.newPage();
  await page.goto(`${S.BASE}/you/script/1/2`);
  await page.locator('.script-shot').first().waitFor().catch(async () => {
    await page.screenshot({ path: path.join(OUT, '0-failed.png') });
    throw new Error(`no shots: ${(await page.locator('main').innerText().catch(() => '')).slice(0, 300)}`);
  });
  await page.screenshot({ path: path.join(OUT, '1-top.png') });
  await page.locator('.script-rerecord summary').click();
  await page.screenshot({ path: path.join(OUT, '2-rerecord.png') });
  await page.locator('#shot-14-b1-6').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, '3-shot-with-notes.png') });
  await page.locator('#shot-14-b1-6 .script-shot-head button').click();
  await page.locator('#shot-14-b1-6').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, '4-shot-note-open.png') });
  const other = page.locator('.script-line').filter({ hasText: 'Zei' }).first();
  await other.locator('.script-line-tap').click();
  await other.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, '5-line-rewrite-open.png') });
  await page.goto(`${S.BASE}/you`);
  await page.locator('[data-script-link]').first().waitFor({ timeout: 20000 });
  await page.locator('#you-scripts').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, '6-you-link.png') });
  await browser.close();
  console.log(`screenshots in ${OUT}`);
} finally {
  await S.stop();
}
