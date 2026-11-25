/**
 * Screenshots of /storyboard/record for the review page (phone and desktop, light and dark), against a local server
 * started with the voice test switch, the stub ElevenLabs and the demo database (see docs/proposals/ephelion-voice.md,
 * "Screenshots"). Chromium's fake microphone records a tone; the stub says one word of sentence 4 wrong, so the check
 * and "Redo this sentence" show.   tsx scripts/voice-screens.ts --url=http://127.0.0.1:3077 --out=/path
 */
import { chromium, type Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const url = arg('url');
const out = arg('out');
if (!url || !out) throw new Error('--url and --out are required');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw new Error('screenshots run against a local server only');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
await ctx.addInitScript(() => {
  localStorage.setItem('snowmoon.signin', JSON.stringify({ token: 'voice-test-6786', fid: 6786, username: 'naaate', exp: Math.floor(Date.now() / 1000) + 86400 }));
  localStorage.setItem('snowmoon.intro-seen', 'v2');
});
// The test sign-in is honoured by /api/voice only; any other route answering 401 would make the client sign it out
// (src/lib/client-auth.ts). The assistant's status is the one the page asks: answered here, never by the server.
await ctx.route('**/api/chat/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":false}' }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));

const sizes = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
async function shoot(name: string, focus?: string) {
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    for (const [k, size] of Object.entries(sizes)) {
      await page.setViewportSize(size);
      if (focus) await page.locator(focus).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out!, `${name}-${k}-${theme}.png`) });
    }
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.setViewportSize(sizes.phone);
  console.log(`shot ${name}`);
}
const wait = async (p: Page, sel: string, ms = 30_000) => {
  try {
    await p.locator(sel).first().waitFor({ timeout: ms });
  } catch (e) {
    console.log(`waited for ${sel}; the page says:`, await p.locator('.vr-warn, [role="alert"]').allInnerTexts());
    await p.screenshot({ path: path.join(out!, `failed-${sel.replace(/\W+/g, '')}.png`), fullPage: true });
    throw e;
  }
};
page.on('response', async (r) => {
  if (r.url().includes('/api/voice/') && r.status() >= 400) console.log('api', r.status(), r.url(), (await r.text().catch(() => '')).slice(0, 200));
});

await page.goto(`${url}/ephelion`);
await wait(page, '#vr-consent-h');
await shoot('1-consent', '#vr-consent-h');
await page.getByRole('button', { name: 'I agree' }).click();
await wait(page, '#vr-pick-h');
await shoot('2-pick-a-voice', '#vr-pick-h');
await page.locator('input[name="voice"]').first().check();
await wait(page, '#vr-rec-h');
await shoot('3-ready-made-and-record', '#vr-ready-h');
await page.getByRole('button', { name: /^Make the reading/ }).click();
await wait(page, 'text=▶ Play the reading');
await page.getByRole('button', { name: 'Record' }).click();
await page.waitForTimeout(14_000);
await shoot('4-recording-words-scroll', '.vr-now');
await page.waitForTimeout(32_000);
await page.getByRole('button', { name: /^Stop/ }).click();
await wait(page, '.vr-take');
await shoot('5-take-in-tab-tick', '.vr-tick');
await page.locator('.vr-steps summary').click();
await shoot('5b-step-log', '.vr-steps');
await page.locator('.vr-take input[type="checkbox"]').check();
await page.getByRole('button', { name: /^Convert/ }).click();
await wait(page, '.vr-checks', 60_000);
await shoot('6-converted-word-check', '.vr-fail');
await page.getByRole('button', { name: 'Redo this sentence' }).first().click();
await page.locator('.vr-redo input[type="checkbox"]').check();
await shoot('7-redo-one-sentence', '.vr-redo');
await page.getByRole('button', { name: 'Record and convert' }).click();
await page.waitForTimeout(5_000);
await page.getByRole('button', { name: /^Stop/ }).click();
await wait(page, 'text=Redone.', 60_000);
await shoot('8-redone-all-match', '#vr-check-h');
await page.getByRole('button', { name: 'Accept and keep as a draft' }).click();
await wait(page, '#vr-drafts-h', 30_000);
await page.locator('.vr-drafts summary').first().click();
await shoot('9-accepted-draft-recipe', '#vr-drafts-h');
// Slice 2: the storyboard of the draft just accepted.
await page.locator('a', { hasText: 'Make the storyboard' }).first().click();
await wait(page, '#vb-strip-h', 30_000);
await page.waitForTimeout(1500);
// The storyboard on a phone (Nate, 2026-11-21): settings once at the top, cuts as a sentence list, a camera dropdown.
const settings = page.locator('section:has(#vb-set-h)');
await settings.locator('select').first().selectOption({ label: 'Ink and wash' });
await settings.locator('button.vb-look', { hasText: 'Ephelion' }).first().click();
await shoot('10-settings-once', '#vb-set-h');
await page.locator('.vb-toggle input').nth(1).click();
await shoot('11-cuts-as-sentences', '.vb-cutlist');
const shotBox = page.locator('section:has(#vb-shot-h)');
await page.locator('.vb-shotband').first().click().catch(() => {});
await shotBox.locator('select').selectOption('low');
await shoot('12-why-not-yet', '.vb-why');
await shotBox.locator('textarea').fill('(Screenshot test, typed by the script) A poster on a tunnel wall, lit from below.');
await shoot('13-shot-words-and-camera', '#vb-shot-h');
await shotBox.getByRole('button', { name: 'Make the picture' }).click();
await shotBox.locator('.vb-try').first().waitFor({ timeout: 30_000 });
await shotBox.getByRole('button', { name: 'Keep this one' }).first().click();
await shotBox.locator('.vb-try.vb-on').waitFor();
await page.locator('section:has(#vb-strip-h)').getByRole('button', { name: /^Save$/ }).click();
await wait(page, 'text=/Saved \\(version/');
await shoot('14-kept-and-notes', '#vb-notes-h');
const audio = page.locator('#vb-play-h ~ audio, .vb-screen + audio').first();
await audio.waitFor({ timeout: 30_000 });
await audio.evaluate((a: HTMLAudioElement) => { a.muted = true; return a.play(); });
await page.waitForTimeout(3000);
await shoot('15-play-through', '#vb-play-h');
await audio.evaluate((a: HTMLAudioElement) => a.pause());

// Slice 4: every shot gets words, a camera and a kept stand-in; then the closing card, publish, the page, the video.
const bands = await page.locator('.vb-shotband').count();
for (let i = 0; i < bands; i++) {
  await page.locator('.vb-shotband').nth(i).click();
  const shotBox = page.locator('section:has(#vb-shot-h)');
  if (i > 0) {
    await shotBox.locator('textarea').fill(`(Screenshot test, typed by the script) Shot ${i + 1}: the tunnel, then the street above it.`);
    await shotBox.locator('select').selectOption(i % 2 ? 'medium' : 'wide');
  }
  if (await shotBox.locator('.vb-try.vb-on, img[alt^="The picture kept"]').count()) continue;
  await shotBox.getByRole('button', { name: /^(Make the picture|Try again)$/ }).click();
  await shotBox.locator('.vb-try').last().waitFor();
  await shotBox.getByRole('button', { name: 'Keep this one' }).last().click();
  await shotBox.locator('.vb-try.vb-on').waitFor();
}
const closingBox = page.locator('section:has(#vb-closing-h)');
await closingBox.locator('textarea').fill('(Screenshot test, typed by the script) Snow over a dark harbour, the lamps out, one window lit.');
await closingBox.getByRole('button', { name: 'Make the background' }).click();
await closingBox.locator('.vb-try').waitFor();
await closingBox.getByRole('button', { name: 'Keep this one' }).click();
await closingBox.locator('.vb-try.vb-on').waitFor();
await closingBox.getByRole('button', { name: /^Save$/ }).click();
await closingBox.locator('.vb-card-preview img').waitFor({ timeout: 30_000 });
await page.waitForTimeout(1000);
await shoot('16-closing-card', '#vb-closing-h');
await page.locator('section:has(#vb-publish-h) details summary').click();
await page.locator('text=Ready: every sentence').waitFor({ timeout: 30_000 });
await shoot('17-publish-ready', '#vb-publish-h');
await page.getByRole('button', { name: 'Publish' }).click();
await wait(page, 'text=This storyboard is public at');
await shoot('18-published', 'h1');
await page.locator('a[href^="/storyboard/spoken/"]').click();
await wait(page, '#vs-play-h', 30_000);
await page.locator('.vr-audio').waitFor({ timeout: 30_000 });
await shoot('19-public-page', '#vs-play-h');
await page.locator('#vs-credits-h ~ details summary').click();
await shoot('20-credits-and-recipe', '#vs-credits-h');
// Save as a video: made in this browser in real time, then downloaded.
const download = page.waitForEvent('download', { timeout: 240_000 });
const started = Date.now();
await page.getByRole('button', { name: 'Save as a video' }).click();
await page.waitForTimeout(4000);
await shoot('21-saving-video', '#vs-play-h');
const file = await download;
const saved = path.join(out!, `video-${file.suggestedFilename()}`);
await file.saveAs(saved);
console.log(`video saved: ${saved} (${Math.round((Date.now() - started) / 1000)} s to make)`);
await page.goBack();
await wait(page, 'text=Take it down');
await page.getByRole('button', { name: 'Take it down' }).click();
await wait(page, '#vb-strip-h', 30_000);
await shoot('22-taken-down-draft-again', 'h1');
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
