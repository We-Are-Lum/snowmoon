/**
 * The share card for /minpentai (owner, 2026-10-20): a real frame of the site's own 3D broadcast with
 * three lines of type, as static PNGs in public/share. No image model: the frame is three.js drawn by the
 * site, the lettering is the site's fonts in Chrome.
 *
 *   npx tsx scripts/minpentai-share-card.ts frames [--url=https://snowmoon.party] [--path=/minpentai?lesson=3] [--out=DIR]
 *     Opens the broadcast's watch screen 3 ("Gliders fly straight and bounce off squares and rocks", the
 *     teaser's 3D beat at 3.9–6.7 s in its teaser-recipe.json), hides the HUD, the commentary and the
 *     pause button, makes the stage 1200×520 at device scale 2, and saves the stage's canvas every 0.4 s
 *     for 16 s as DIR/frame-NNN.png, with frames.json (page URL, the site's commit, times).
 *     After minpentai-lesson-link merges, watch screen 3 is ?watch=3: pass --path.
 *
 *   npx tsx scripts/minpentai-share-card.ts render <frame.png> [--top=0.5] [--out=public/share]
 *     Draws minpentai-embed-3x2.png (1200×800, Farcaster) and minpentai-og-1200x630.png (X, link
 *     previews) from that frame, and minpentai-embed-phone-343.png, the embed at Farcaster's feed width on
 *     a phone (343 px), to read before committing. --top is where the 1200×630 crop sits in the frame
 *     (0 top, 1 bottom). Prints each file's sha256.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const [cmd, input] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

if (cmd === 'frames') {
  const base = (arg('url') ?? 'https://snowmoon.party').replace(/\/$/, '');
  const at = arg('path') ?? '/minpentai?lesson=3';
  const out = arg('out') ?? 'minpentai-frames';
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  // The first-visit intro is skipped as a returning visitor would.
  await page.addInitScript(() => { try { localStorage.setItem('snowmoon-intro-seen', '1'); } catch {} });
  await page.goto(base + at, { waitUntil: 'networkidle' });
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.addStyleTag({
    content: `.ml-stage { position: fixed !important; left: 0 !important; top: 0 !important; width: 1200px !important; height: 520px !important; z-index: 99999 !important; }
      .ml-hud, .ml-comment, .ml-pause, .ml-cams, .ml-react, .ml-banner, .ml-countdown { display: none !important; }`,
  });
  await page.waitForSelector('.ml-gl-host canvas', { timeout: 20000 });
  const commit = ((await (await fetch(`${base}/api/version`)).json().catch(() => ({}))) as { commit?: string }).commit ?? null;
  const t0 = Date.now();
  const times: { file: string; t: number }[] = [];
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(400);
    const url = await page.evaluate(() => (document.querySelector('.ml-gl-host canvas') as HTMLCanvasElement).toDataURL('image/png'));
    const file = `frame-${String(k).padStart(3, '0')}.png`;
    writeFileSync(path.join(out, file), Buffer.from(url.split(',')[1], 'base64'));
    times.push({ file, t: (Date.now() - t0) / 1000 });
  }
  writeFileSync(path.join(out, 'frames.json'), JSON.stringify({ page: base + at, commit, captured: new Date().toISOString(), stage: '1200x520 css, device scale 2', hidden: 'HUD, commentary, pause', times }, null, 1));
  await browser.close();
  console.log(`${times.length} frames in ${out} (commit ${commit})`);
} else if (cmd === 'render') {
  if (!input) throw new Error('usage: minpentai-share-card.ts render <frame.png>');
  const out = arg('out') ?? 'public/share';
  const top = Number(arg('top') ?? 0.5);
  const frame = `data:image/png;base64,${readFileSync(input).toString('base64')}`;
  const font = (f: string) => `data:font/woff2;base64,${readFileSync(path.join('src/fonts', f)).toString('base64')}`;
  // The poster's layout (Fifteen Days, public/share): the picture above, a paper title bar below; the win
  // card's type (src/app/api/minpentai-card): Crimson Pro for the name, DM Mono for the address.
  const html = (W: number, H: number, pic: number, title: number) => `<!doctype html><html><head><style>
    @font-face { font-family: 'Crimson Pro'; src: url(${font('CrimsonPro-latin.woff2')}) format('woff2'); font-weight: 400 600; }
    @font-face { font-family: 'Crimson Pro'; src: url(${font('CrimsonPro-Italic-latin.woff2')}) format('woff2'); font-weight: 400 600; font-style: italic; }
    @font-face { font-family: 'DM Mono'; src: url(${font('DMMono-Regular-latin.woff2')}) format('woff2'); font-weight: 400; }
    * { margin: 0; box-sizing: border-box; }
    body { width: ${W}px; height: ${H}px; background: #F4F2ED; color: #1A1916; overflow: hidden; }
    .pic { width: ${W}px; height: ${pic}px; background: #050507 url(${frame}) no-repeat; background-size: ${W}px auto; background-position: 50% ${top * 100}%; }
    .bar { height: ${H - pic}px; padding: 0 56px; display: flex; flex-direction: column; justify-content: center; }
    .row { display: flex; align-items: baseline; justify-content: space-between; }
    h1 { font: 500 ${title}px/0.95 'Crimson Pro'; letter-spacing: -0.01em; }
    .site { font: 400 ${Math.round(title * 0.3)}px 'DM Mono'; letter-spacing: 0.02em; color: #4A4843; }
    p { font: 400 ${Math.round(title * 0.4)}px/1.1 'Crimson Pro'; margin-top: ${Math.round(title * 0.12)}px; color: #33312C; }
  </style></head><body><div class="pic"></div><div class="bar">
    <div class="row"><h1>Minpentai</h1><span class="site">snowmoon.party</span></div>
    <p>A game from Vitalik Buterin’s Snowmoon</p>
  </div></body></html>`;
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const shoot = async (W: number, H: number, doc: string, scale = 1) => {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
    await page.setContent(doc);
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png' });
    await page.close();
    return png;
  };
  const embed = await shoot(1200, 800, html(1200, 800, 520, 120));
  const og = await shoot(1200, 630, html(1200, 630, 400, 104));
  // Farcaster's feed on a phone shows the embed about 343 px wide: the same picture, scaled down.
  const phone = await shoot(343, 229, `<!doctype html><body style="margin:0"><img src="data:image/png;base64,${embed.toString('base64')}" style="width:343px;height:auto;display:block">`, 3);
  for (const [name, png] of [['minpentai-embed-3x2.png', embed], ['minpentai-og-1200x630.png', og]] as const) {
    writeFileSync(path.join(out, name), png);
    console.log(`${path.join(out, name)}  sha256 ${sha(png)}`);
  }
  const preview = arg('preview') ?? path.join(out, 'minpentai-embed-phone-343.png');
  writeFileSync(preview, phone);
  console.log(`${preview} (343 px wide at device scale 3)`);
  await browser.close();
} else {
  throw new Error('usage: minpentai-share-card.ts frames | render <frame.png>');
}
