/**
 * Capture an in-world screen exactly as the reader draws it, as a PNG, for
 * compositing onto a panel (scripts/composite-screens.py). The screen is the
 * book's own block, rendered by the reader's own template and styles, so its
 * words are the source's (principle 8).
 *
 *   npx tsx scripts/capture-screen.ts c30-b61 images-out/adaptation-dog-dawn/screen-c30-b61.png [--url=https://snowmoon.party] [--theme=dark] [--width=700] [--keep=0,2]
 *
 * --keep lists the paragraphs to keep (0-based); the others are replaced by
 * one paragraph "…", marking a cut in the book's words, as in the script
 * format. Used when the full screen is too small to read at panel size.
 *
 * Prints a JSON record: block, page URL, the site commit it was captured from,
 * the theme, the device scale, and the PNG's sha256.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const [id, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const base = (arg('url') ?? 'https://snowmoon.party').replace(/\/$/, '');
const theme = arg('theme') ?? 'dark';
const chapter = Number(id.match(/^c(\d+)-b\d+$/)?.[1]);
if (!chapter || !out) throw new Error('usage: capture-screen.ts c<ch>-b<idx> <out.png>');

const browser = await chromium.launch({ channel: 'chrome' });
const width = Number(arg('width') ?? 700);
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 3, colorScheme: theme as 'dark' | 'light' });
const url = `${base}/chapter/${chapter}`;
await page.goto(url, { waitUntil: 'networkidle' });
const commit = (await (await fetch(`${base}/api/version`)).json().catch(() => ({}))) as { commit?: string };
const el = page.locator(`[id="${id}"] .device-view`).first();
const keep = arg('keep')?.split(',').map(Number) ?? null;
if (keep) {
  await el.evaluate((node, k) => {
    const ps = [...node.querySelectorAll(':scope > p')];
    let cut = false;
    ps.forEach((p, i) => {
      if (k.includes(i)) { cut = false; return; }
      if (!cut) { p.textContent = '…'; cut = true; } else p.remove();
    });
  }, keep);
}
const shown = (await el.innerText()).replace(/\s+/g, ' ').trim();
await el.screenshot({ path: out });
await browser.close();
console.log(JSON.stringify({
  block: id,
  url,
  site_commit: commit.commit ?? null,
  theme,
  viewport_width: width,
  kept_paragraphs: keep,
  text_shown: shown,
  device_scale: 3,
  file: out,
  sha256: createHash('sha256').update(readFileSync(out)).digest('hex'),
}));
