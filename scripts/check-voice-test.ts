/**
 * The owner's phone test page (/voice-test; owner, 2026-10-22), checked in this Mac's Chrome against a local
 * production build (`next build && next start`):
 *
 *   npm run check:voice-test -- --url=http://localhost:3000            gate, reload detection, one WebGPU run
 *   npm run check:voice-test -- --url=… --via=proxy                    the same run through /voice-media/ (as on a preview)
 *   npm run check:voice-test -- --url=… --ep=wasm                      the WASM run instead
 *
 * - Signed out, signed in as another FID, and with a token the server can't verify, the page shows the site's
 *   "not found" and /api/voice-test answers 404.
 * - Signed in as FID 6786 (the session mocked in the browser as check:ui does, and /api/voice-test answered with
 *   the real manifest, since the mocked token isn't a real one), it runs the benchmark, plays nothing, and
 *   shows the results; every request goes to this site or *.snowmoon.party (P6).
 * - A reload in the middle of a run is reported on the next load.
 * Prints the results JSON. Uses no microphone; converts the public test line only.
 */
import { chromium, type Page } from 'playwright-core';
import { VOICE_TEST, VOICE_TEST_MEDIA } from '../src/lib/voice-test';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASE = (arg('url') ?? 'http://localhost:3000').replace(/\/$/, '');
const EP = arg('ep') === 'wasm' ? 'wasm' : 'webgpu';
const VIA = arg('via') === 'proxy' ? '?via=proxy' : '';
const failures: string[] = [];
const fail = (m: string) => failures.push(m);
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = (fid: number) => JSON.stringify({ token: `x.${b64({ sub: fid, exp: 4102444800 })}.y`, fid, username: 'check', exp: 4102444800 });

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-unsafe-webgpu'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const hosts = new Set<string>();
context.on('request', (r) => hosts.add(new URL(r.url()).host));

async function isNotFound(page: Page, who: string) {
  await page.goto(`${BASE}/voice-test`, { waitUntil: 'load' });
  await page.waitForFunction(() => /could not be found/i.test(document.querySelector('main')?.textContent ?? '') || document.querySelector('.vt-button'), null, { timeout: 20000 }).catch(() => {});
  const text = await page.locator('main').innerText();
  if (!/could not be found|404/i.test(text)) fail(`${who}: /voice-test does not show "not found"`);
  if (await page.locator('.vt-button').count()) fail(`${who}: /voice-test shows the test`);
}

try {
  const page = await context.newPage();
  // Signed out.
  await page.goto(`${BASE}/`);
  await page.evaluate(() => localStorage.clear());
  await isNotFound(page, 'signed out');
  const api = await page.request.get(`${BASE}/api/voice-test`);
  if (api.status() !== 404) fail(`signed out: /api/voice-test answered ${api.status()}, not 404`);
  // Another FID (mocked session).
  await page.evaluate((s) => localStorage.setItem('snowmoon.signin', s), session(2));
  await isNotFound(page, 'FID 2');
  // FID 6786's mocked token, unverified by the server: the route says 404, so the page does too.
  await page.evaluate((s) => localStorage.setItem('snowmoon.signin', s), session(6786));
  await isNotFound(page, 'FID 6786 with a token the server cannot verify');
  const forged = await page.request.get(`${BASE}/api/voice-test`, { headers: { Authorization: `Bearer x.${b64({ sub: 6786, exp: 4102444800 })}.y` } });
  if (forged.status() !== 404) fail(`forged token: /api/voice-test answered ${forged.status()}, not 404`);

  // The owner: the session mocked as check:ui does, the route answered as it answers FID 6786.
  await page.route('**/api/voice-test', (r) => r.fulfill({ json: { media: VOICE_TEST_MEDIA, ...VOICE_TEST } }));
  // Other signed-in calls the site's shell makes would answer 401 to the mocked token and sign it out (as in check:ui).
  await page.route('**/api/chat/status', (r) => r.fulfill({ json: { available: false, model: 'm', host: null, provider: null, route: '', perDay: 30, left: 30 } }));
  page.on('response', (r) => r.status() === 401 && console.log(`401 from ${new URL(r.url()).pathname} (signs the mocked session out)`));
  await page.evaluate((s) => localStorage.setItem('snowmoon.signin', s), session(6786));
  await page.goto(`${BASE}/voice-test${VIA}`, { waitUntil: 'load' });
  await page.locator('.vt-button').first().waitFor({ timeout: 15000 });
  const gpuKnown = () => page.waitForFunction(() => (document.querySelector('.vt-row dd')?.textContent ?? '…') !== '…', null, { timeout: 30000 });
  await gpuKnown();
  const gpuRow = await page.locator('.vt-row').first().innerText();
  console.log(`page says: ${gpuRow.replace(/\s+/g, ' ')}`);

  // Reload detection: start, reload during the download, and the next load must say where it stopped.
  await page.locator('.vt-button').first().click();
  await page.waitForFunction(() => /download|open/.test(document.querySelector('.vt-stage')?.textContent ?? ''), null, { timeout: 60000 });
  await page.reload({ waitUntil: 'load' });
  await page.locator('.vt-alert').waitFor({ timeout: 15000 }).catch(() => fail('a reload during a run is not reported on the next load'));
  console.log(`after reload: ${(await page.locator('.vt-alert').innerText().catch(() => '(none)')).replace(/\s+/g, ' ')}`);

  // The run.
  await gpuKnown();
  const button = EP === 'webgpu' ? page.getByRole('button', { name: /Run the test \(WebGPU\)/ }) : page.getByRole('button', { name: /WASM/ });
  if (!(await button.count())) fail(`no ${EP} button (WebGPU missing in this Chrome?)`);
  else {
    const t0 = Date.now();
    await button.click();
    await page.locator('.vt-results, .vt-alert:has-text("It failed")').first().waitFor({ timeout: 20 * 60_000 });
    console.log(`run took ${Math.round((Date.now() - t0) / 1000)} s of wall time`);
    const report = JSON.parse(await page.locator('#vt-report').innerText()) as { results: Record<string, unknown> };
    console.log(JSON.stringify(report.results));
    if (report.results.error) fail(`the run failed: ${String(report.results.error)}`);
    if (!(await page.locator('.vt-play audio').count())) fail('no player for the converted line');
    const check = report.results.output_check as { nan: number; peak: number } | undefined;
    if (!check || check.nan || check.peak < 0.01) fail(`the converted audio looks broken: ${JSON.stringify(check)}`);
    // Copy results.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await page.getByRole('button', { name: 'Copy results' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    if (!clip.includes('convert_ms')) fail('Copy results did not copy the results');
  }
} finally {
  await browser.close();
}

const site = new URL(BASE).hostname;
const third = [...hosts].filter((h) => {
  const host = h.split(':')[0];
  return !(host === site || host === 'snowmoon.party' || host.endsWith('.snowmoon.party'));
});
if (third.length) fail(`third-party requests (P6): ${third.join(', ')}`);
console.log(`hosts: ${[...hosts].join(', ')}`);
if (failures.length) {
  console.error(`\nVOICE TEST CHECK FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('voice test check passed');
