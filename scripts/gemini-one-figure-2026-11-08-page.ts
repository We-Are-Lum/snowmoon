/**
 * The Gemini one-figure test's page (2026-11-08): <outdir>/index.html with img/ beside it, before (look test, lines A
 * and B) and after (line B + "Show one figure only.") side by side, with the copies counted by eye. No external
 * resources. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Nothing is published.
 *
 *   npx tsx scripts/gemini-one-figure-2026-11-08-page.ts <outdir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: gemini-one-figure-2026-11-08-page.ts <outdir>');
const ROOT = path.resolve(import.meta.dirname, '..');
const ledger = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/gemini-one-figure-2026-11-08/ledger.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const LOOK = path.join(OUT, '..', 'look-test', 'full');
const IMG = path.join(OUT, 'img');
mkdirSync(IMG, { recursive: true });
const CHANGES: Record<number, string> = {
  1: 'in a long winter coat and scarf, snow on the shoulders', 2: 'dressed all in bright red and gold', 3: 'aged about 70', 4: 'much taller, with a heavy, broad-shouldered build',
  7: 'shaved head', 8: 'as a medieval knight in armour', 11: 'as a deep-sea diver in a brass helmet, underwater', 12: 'as a fox',
};
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let files = 0;
async function small(src: string, name: string) {
  const dest = path.join(IMG, name);
  if (!existsSync(dest)) await sharp(src).resize({ width: 560 }).jpeg({ quality: 72, mozjpeg: true }).toFile(dest);
  files++;
  return `img/${name}`;
}
const spent = ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const rows = ledger.copies_by_eye.rows as { change: number; character: string; before_A: number; before_B: number; F1: number }[];
const multi = (k: 'before_A' | 'before_B' | 'F1', set: number[]) => rows.filter((r) => set.includes(r.change) && r[k] > 1).length;

async function main() {
  const sections: string[] = [];
  for (const group of [{ title: 'Where the copies appeared: changes 2, 3, 4 and 8', set: [2, 3, 4, 8] }, { title: 'Does it hurt elsewhere? Changes 1, 7, 11 and 12', set: [1, 7, 11, 12] }]) {
    const blocks: string[] = [];
    for (const c of group.set) for (const ch of ['zei', 'bai']) {
      const name = ch === 'zei' ? 'Zei' : 'Bai';
      const r = rows.find((x) => x.change === c && x.character === ch)!;
      const cc = String(c).padStart(2, '0');
      const cells = [
        { src: path.join(LOOK, `c${cc}-${ch}-A-gemini.jpg`), file: `before-A-c${cc}-${ch}.jpg`, label: 'Before · line A', n: r.before_A },
        { src: path.join(LOOK, `c${cc}-${ch}-B-gemini.jpg`), file: `before-B-c${cc}-${ch}.jpg`, label: 'Before · line B', n: r.before_B },
        { src: path.join(OUT, 'full', `c${cc}-${ch}-B-gemini-F1.jpg`), file: `F1-c${cc}-${ch}.jpg`, label: 'F1 · line B + “Show one figure only.”', n: r.F1 },
      ];
      const figs: string[] = [];
      for (const x of cells) {
        const src = await small(x.src, x.file);
        figs.push(`<figure><img src="${src}" width="560" height="315" loading="lazy" alt="${esc(`${name}, ${CHANGES[c]}: ${x.label}. Gemini 3.1 Flash Image, a closed model by Google. AI-generated test picture.`)}"><figcaption><b class="${x.n > 1 ? 'bad' : 'ok'}">${x.n === 1 ? 'one figure' : `${x.n} copies`}</b><span>${esc(x.label)} · Gemini 3.1 Flash Image · a closed model by Google</span></figcaption></figure>`);
      }
      blocks.push(`<div class="row"><h3>${c}. “${esc(CHANGES[c])}” · ${name}</h3><div class="grid">${figs.join('')}</div></div>`);
    }
    sections.push(`<section><h2>${esc(group.title)}</h2><p class="muted">Pictures with more than one copy: before, line A ${multi('before_A', group.set)} of 8; before, line B ${multi('before_B', group.set)} of 8; F1 ${multi('F1', group.set)} of 8.</p>${blocks.join('')}</section>`);
  }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gemini One Figure</title>
<style>
:root { --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --ok: #2e6b3a; --bad: #8a3b2f; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --ok: #8fd19e; --bad: #e4a08f; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --ok: #8fd19e; --bad: #e4a08f; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; }
.draft { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: var(--bad); border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; margin-left: 8px; vertical-align: middle; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 16px 0 24px; }
.note p { margin: 0 0 8px; }
.muted { color: var(--muted); font-size: 13px; }
section { border-top: 1px solid var(--line); padding-top: 20px; margin-top: 24px; }
h2 { font-size: 20px; margin: 0 0 4px; }
h3 { font-size: 14px; margin: 14px 0 6px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
figure { margin: 0; }
.grid img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; display: block; border-radius: 6px; background: var(--line); }
figcaption { font-size: 12px; margin-top: 3px; line-height: 1.3; }
figcaption b { display: block; } figcaption b.ok { color: var(--ok); } figcaption b.bad { color: var(--bad); }
figcaption span { color: var(--muted); }
@media (max-width: 640px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
</head>
<body>
<main>
<h1>Gemini One Figure<span class="draft">DRAFT</span></h1>
<div class="note">
<p>In the look test, Gemini 3.1 Flash Image (a closed model by Google) sometimes drew a row of copies of the character, like a character sheet. This tries fix F1: the sentence “Show one figure only.” right after “&lt;Name&gt; is the person in reference image 1, the main figure.”, with closing line B. Fix F2 (cropping the reference to one figure) wasn’t run: both base fronts already show one figure.</p>
<p>Copies are counted by eye; a side panel with a large crop of the same figure counts as a copy. Each picture was made once, so these are small samples. Style Mood, as the remix screen starts on it. Spent ${`$${spent.toFixed(2)}`} of a $3.50 cap.</p>
<p>The project’s own test pictures: not published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p>
</div>
${sections.join('\n')}
</main>
</body>
</html>
`;
  writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`index.html written; ${files} files in img/`);
}
main();
