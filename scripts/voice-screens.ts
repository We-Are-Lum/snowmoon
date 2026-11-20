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

const sizes = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } };
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

await page.goto(`${url}/storyboard/record`);
await wait(page, '#vr-consent-h');
await shoot('1-consent', '#vr-consent-h');
await page.getByRole('button', { name: 'I agree' }).click();
await wait(page, '#vr-pick-h');
await shoot('2-pick-a-voice', '#vr-pick-h');
await page.locator('input[name="voice"]').nth(4).check();
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
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
