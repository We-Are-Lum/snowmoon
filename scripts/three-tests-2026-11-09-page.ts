/**
 * The three tests' page (2026-11-09): <outdir>/index.html with img/ beside it (560 px JPEGs), three sections, before
 * and after side by side. No external resources. Drafted by the coding agent (Claude, a closed model by Anthropic).
 * DRAFT. Nothing is published.
 *
 *   npx tsx scripts/three-tests-2026-11-09-page.ts <outdir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: three-tests-2026-11-09-page.ts <outdir>');
const ROOT = path.resolve(import.meta.dirname, '..');
const ledger = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/three-tests-2026-11-09/ledger.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const LOOK = path.join(OUT, '..', 'look-test', 'full');
const FULL = path.join(OUT, 'full');
const IMG = path.join(OUT, 'img');
mkdirSync(IMG, { recursive: true });
const CHANGES = [
  'in a long winter coat and scarf, snow on the shoulders', 'dressed all in bright red and gold', 'aged about 70', 'much taller, with a heavy, broad-shouldered build',
  'mid-leap over a wall, seen from below', 'furious and shouting', 'shaved head', 'as a medieval knight in armour', 'sitting on a rooftop at night in the rain',
  'with a robot arm and goggles', 'as a deep-sea diver in a brass helmet, underwater', 'as a fox',
];
const p2 = (n: number) => String(n).padStart(2, '0');
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let files = 0;
async function img(src: string, name: string, alt: string, cap: string, extra = '') {
  const dest = path.join(IMG, name);
  if (!existsSync(dest)) await sharp(src).resize({ width: 560 }).jpeg({ quality: 72, mozjpeg: true }).toFile(dest);
  files++;
  return `<figure><img src="img/${name}" width="560" height="315" loading="lazy" alt="${esc(alt)} AI-generated test picture."><figcaption>${extra}<span>${esc(cap)}</span></figcaption></figure>`;
}
const per: Record<string, number> = {};
for (const c of ledger.calls) { const k = c.kind === 'guard' ? 'guard' : c.test ?? 'other'; per[k] = (per[k] ?? 0) + c.cost_usd; }
const spent = Object.values(per).reduce((a, b) => a + b, 0);
const usd = (x: number) => `$${x.toFixed(2)}`;
const FLUX = 'FLUX.2 [klein] 4B · open weights, by Black Forest Labs';
const Q09 = 'Qwen-Image-Edit 2509 · open weights, by Alibaba’s Qwen team';
const Q11 = 'Qwen-Image-Edit 2511 · open weights, by Alibaba’s Qwen team';
const GEM = 'Gemini 3.1 Flash Image · a closed model by Google';

async function main() {
  const s1: string[] = [];
  for (const c of [8, 11, 4, 3, 7]) {
    const j = ledger.judged_by_eye.flux[String(c)];
    s1.push(`<div class="row"><h3>${c}. “${esc(CHANGES[c - 1])}” · Bai</h3><div class="grid two">${await img(path.join(FULL, `flux-c${p2(c)}-bai-nolook.jpg`), `flux-c${p2(c)}-nolook.jpg`, `Bai, ${CHANGES[c - 1]}, without the look line, by FLUX.2 [klein] 4B.`, `${FLUX} · before: no look line`, `<b>${esc(j.nolook)}</b>`)}${await img(path.join(FULL, `flux-c${p2(c)}-bai-look.jpg`), `flux-c${p2(c)}-look.jpg`, `Bai, ${CHANGES[c - 1]}, with her look line, by FLUX.2 [klein] 4B.`, `${FLUX} · after: Bai’s look line`, `<b>${esc(j.look)}</b>`)}</div></div>`);
  }
  const s2: string[] = [];
  for (let c = 1; c <= 12; c++) {
    s2.push(`<div class="row"><h3>${c}. “${esc(CHANGES[c - 1])}” · Bai</h3><div class="grid two">${await img(path.join(LOOK, `c${p2(c)}-bai-B-qwen.jpg`), `qwen2509-c${p2(c)}.jpg`, `Bai, ${CHANGES[c - 1]}, by Qwen-Image-Edit 2509 (look test).`, `${Q09} · look test: style Mood, no look line`)}${await img(path.join(FULL, `qwen2511-c${p2(c)}-bai.jpg`), `qwen2511-c${p2(c)}.jpg`, `Bai, ${CHANGES[c - 1]}, by Qwen-Image-Edit 2511.`, `${Q11} · today’s prompt: look line, Same as this picture`)}</div></div>`);
  }
  const s3: string[] = [];
  const rows = ledger.gemini_copies_by_eye.rows as { change: number; character: string; before_B: number; F3: number }[];
  const n = (k: 'before_B' | 'F3') => rows.filter((r) => r[k] > 1).length;
  for (const r of rows) {
    const nm = r.character === 'zei' ? 'Zei' : 'Bai';
    const tag = (x: number) => `<b class="${x > 1 ? 'bad' : 'ok'}">${x === 1 ? 'one figure' : `${x} copies`}</b>`;
    s3.push(`<div class="row"><h3>${r.change}. “${esc(CHANGES[r.change - 1])}” · ${nm}</h3><div class="grid two">${await img(path.join(LOOK, `c${p2(r.change)}-${r.character}-B-gemini.jpg`), `gem-before-c${p2(r.change)}-${r.character}.jpg`, `${nm}, ${CHANGES[r.change - 1]}, by Gemini 3.1 Flash Image (look test).`, `${GEM} · before: front at 3:4, style Mood, no look line`, tag(r.before_B))}${await img(path.join(FULL, `geminiF3-c${p2(r.change)}-${r.character}.jpg`), `gem-F3-c${p2(r.change)}-${r.character}.jpg`, `${nm}, ${CHANGES[r.change - 1]}, by Gemini 3.1 Flash Image with the front padded to 16:9.`, `${GEM} · F3: front padded to 16:9, look line, Same as this picture`, tag(r.F3))}</div></div>`);
  }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Three Look Tests</title>
<style>
:root { --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --accent: #2f5d8a; --ok: #2e6b3a; --bad: #8a3b2f; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --ok: #8fd19e; --bad: #e4a08f; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --ok: #8fd19e; --bad: #e4a08f; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; }
.draft { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: var(--bad); border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; margin-left: 8px; vertical-align: middle; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 16px 0 24px; }
.note p { margin: 0 0 8px; }
.spend { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 10px 0 0; }
.spend div { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.spend b { display: block; font-size: 18px; font-variant-numeric: tabular-nums; } .spend span { font-size: 12px; color: var(--muted); }
nav a { color: var(--accent); }
section { border-top: 1px solid var(--line); padding-top: 20px; margin-top: 28px; }
h2 { font-size: 21px; margin: 0 0 4px; }
.lead { color: var(--muted); font-size: 14px; margin: 0 0 8px; }
h3 { font-size: 14px; margin: 14px 0 6px; }
.grid.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
figure { margin: 0; }
.grid img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; display: block; border-radius: 6px; background: var(--line); }
figcaption { font-size: 12px; margin-top: 3px; line-height: 1.35; }
figcaption b { display: block; font-weight: 600; } figcaption b.ok { color: var(--ok); } figcaption b.bad { color: var(--bad); }
figcaption span { color: var(--muted); }
</style>
</head>
<body>
<main>
<h1>Three Look Tests<span class="draft">DRAFT</span></h1>
<div class="note">
<p>Three tests of the challenge’s remix prompt as the route now builds it: the change words, “&lt;Name&gt; is the person in reference image 1, the main figure.”, the character’s look line, no style text (“Same as this picture”, the default), “Keep the face recognisable; change anything else the words describe.”, and the no-words line. One picture each; the open models use seed 20261108.</p>
<p>Notes under the pictures are the coding agent’s reading of each picture. Comparisons with the look test also differ in style (it used Mood) and in having no look line; each caption says what differs.</p>
<p>The project’s own test pictures: not published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p>
<div class="spend"><div><b>${usd(spent)}</b><span>spent of this run’s $3.00 cap</span></div><div><b>${usd(per.flux ?? 0)}</b><span>1 · FLUX look line</span></div><div><b>${usd(per.qwen2511 ?? 0)}</b><span>2 · Qwen 2511</span></div><div><b>${usd(per.geminiF3 ?? 0)}</b><span>3 · Gemini F3</span></div><div><b>${usd(per.guard ?? 0)}</b><span>prompt checks</span></div></div>
</div>
<nav><ol><li><a href="#flux">Bai’s look line on FLUX</a></li><li><a href="#qwen">Qwen-Image-Edit 2511 against 2509</a></li><li><a href="#gemini">Gemini with the front padded to 16:9</a></li></ol></nav>
<section id="flux"><h2>1. Bai’s look line on FLUX</h2><p class="lead">FLUX.2 [klein] 4B edit, Bai’s front only, the same seed. Left: no look line. Right: “${esc(ledger.prompts ? 'Unless the change says otherwise: a young woman of about eighteen, tall and athletic, dark brown skin, one side of her head shaved and long magenta hair swept over the other, tattooed arms, gold earrings.' : '')}”</p>${s1.join('')}</section>
<section id="qwen"><h2>2. Qwen-Image-Edit 2511 against 2509</h2><p class="lead">Bai, the look test’s 12 changes. Left: 2509 from the look test (style Mood, no look line). Right: 2511 with today’s prompt. 2511 returned 1024 × 576 and fal billed 1 unit ($0.03) a picture.</p>${s2.join('')}</section>
<section id="gemini"><h2>3. Gemini with the front padded to 16:9</h2><p class="lead">Left: the look test (front sent at 3:4, style Mood, no look line). Right: F3, the front padded to 16:9 by the site’s toView, with the look line and no style. Pictures with more than one copy of the character: before ${n('before_B')} of 16, F3 ${n('F3')} of 16 (counted by eye).</p>${s3.join('')}</section>
</main>
</body>
</html>
`;
  writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`index.html written; ${files} files in img/`);
}
main();
