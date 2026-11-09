/**
 * The look test's comparison page (2026-11-08): <outdir>/index.html with img/ beside it (560 px JPEGs, quality 72),
 * grouped by change; rows Zei A, Zei B, Bai A, Bai B; five pictures a row. No external resources. Drafted by the coding
 * agent (Claude, a closed model by Anthropic). DRAFT. Nothing is published by this script.
 *
 *   npx tsx scripts/look-test-2026-11-08-page.ts <outdir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: look-test-2026-11-08-page.ts <outdir>');
const ROOT = path.resolve(import.meta.dirname, '..');
const ledger = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/look-test-2026-11-08/ledger.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const IMG = path.join(OUT, 'img');
mkdirSync(IMG, { recursive: true });

const CHARS = [{ id: 'zei', name: 'Zei' }, { id: 'bai', name: 'Bai' }];
const MODELS = [
  { key: 'flux', name: 'FLUX.2 [klein] 4B', terms: 'open weights, by Black Forest Labs', maker: 'Black Forest Labs', refs: 'front only, as the route sends' },
  { key: 'flux3', name: 'FLUX.2 [klein] 4B', terms: 'open weights, by Black Forest Labs', maker: 'Black Forest Labs', refs: 'front, side and back views' },
  { key: 'qwen', name: 'Qwen-Image-Edit 2509', terms: 'open weights, by Alibaba’s Qwen team', maker: 'Alibaba’s Qwen team', refs: '' },
  { key: 'gpt', name: 'GPT Image 2.5', terms: 'a closed model by OpenAI', maker: 'OpenAI', refs: '' },
  { key: 'gemini', name: 'Gemini 3.1 Flash Image', terms: 'a closed model by Google', maker: 'Google', refs: '' },
];
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let files = 0;
async function small(src: string, dest: string) {
  if (!existsSync(dest)) await sharp(src).resize({ width: 560 }).jpeg({ quality: 72, mozjpeg: true }).toFile(dest);
  files++;
}
const last = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
for (const c of ledger.calls) if (c.kind === 'picture') last.set(`${c.change}|${c.character}|${c.line}|${c.model}`, c);
const spent = ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const per: Record<string, number> = {};
for (const c of ledger.calls) { const k = c.kind === 'guard' ? 'guard' : c.model ?? 'other'; per[k] = (per[k] ?? 0) + c.cost_usd; }
const made = [...last.values()].filter((c) => c.status === 'ok').length;
const notMade = [...last.values()].filter((c) => c.status !== 'ok');
const usd = (x: number) => `$${x.toFixed(2)}`;

async function main() {
  for (const [c, v] of [['zei', 'front'], ['zei', 'side'], ['zei', 'back'], ['bai', 'front']]) await small(path.join(OUT, 'refs', `${c}-${v}.jpg`), path.join(IMG, `ref-${c}-${v}.jpg`));
  const sections: string[] = [];
  for (let ci = 0; ci < ledger.changes.length; ci++) {
    const rows: string[] = [];
    for (const ch of CHARS) for (const line of ['A', 'B']) {
      const cells: string[] = [];
      for (const m of MODELS) {
        const row = last.get(`${ci + 1}|${ch.id}|${line}|${m.key}`);
        const cap = `<figcaption><b>${esc(m.name)}${m.refs ? ` · ${esc(m.refs)}` : ''}</b><span>${esc(m.terms)} · line ${line}</span></figcaption>`;
        if (row?.status === 'ok' && existsSync(path.join(OUT, 'full', row.file))) {
          await small(path.join(OUT, 'full', row.file), path.join(IMG, row.file));
          cells.push(`<figure><img src="img/${row.file}" width="560" height="315" loading="lazy" alt="${esc(`${ch.name}, ${ledger.changes[ci]}, closing line ${line}, made by ${m.name}, ${m.terms}. AI-generated test picture.`)}">${cap}</figure>`);
        } else {
          const why = m.key === 'flux3' && ch.id === 'bai' ? 'Not made: Bai’s base has a front view only'
            : !row ? 'Not made (stopped before this picture)'
            : row.status === 'refused' ? `Refused by ${m.maker}’s model`
            : row.status === 'filtered' ? 'Blocked by the host’s safety checker'
            : row.status === 'guard-refused' ? 'Refused by the site’s prompt check'
            : 'Failed (error, retried once)';
          cells.push(`<figure class="none"><div class="ph"><span>${esc(why)}</span></div>${cap}</figure>`);
        }
      }
      rows.push(`<div class="row"><h3>${ch.name} · line ${line}</h3><div class="grid">${cells.join('')}</div></div>`);
    }
    sections.push(`<section id="c${ci + 1}"><h2><span class="num">${ci + 1}</span>“${esc(ledger.changes[ci])}”</h2>${rows.join('')}<p class="top"><a href="#contents">Back to the changes</a></p></section>`);
  }
  const sample = (ch: string, line: string) => Object.values(ledger.prompts as Record<string, string>).find((p) => p.startsWith(ledger.changes[0]) && p.includes(`${ch} is`) && p.includes(ledger.lines[line])) ?? '';
  const notMadeList = notMade.length ? `<ul>${notMade.map((c) => `<li>${esc(`${c.change}. ${ledger.changes[c.change - 1]} · ${c.character === 'zei' ? 'Zei' : 'Bai'} · line ${c.line} · ${MODELS.find((m) => m.key === c.model)?.name}${c.model === 'flux3' ? ' (three views)' : ''}: ${c.status}${c.note ? ` (${String(c.note).slice(0, 140)})` : ''}`)}</li>`).join('')}</ul>` : '<p>None: every picture asked for was made.</p>';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Look Test</title>
<style>
:root { --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --accent: #2f5d8a; --ph: #ecebe6; --warn: #8a3b2f; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --ph: #2a2a27; --warn: #e4a08f; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --ph: #2a2a27; --warn: #e4a08f; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1280px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; }
.draft { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: var(--warn); border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; margin-left: 8px; vertical-align: middle; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 16px 0 24px; }
.note p { margin: 0 0 8px; }
.muted { color: var(--muted); font-size: 13px; }
.spend { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 12px 0 8px; }
.spend div { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.spend b { display: block; font-size: 18px; font-variant-numeric: tabular-nums; }
.spend span { font-size: 12px; color: var(--muted); }
pre { white-space: pre-wrap; word-break: break-word; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px; font-size: 12.5px; }
.refs { display: grid; grid-template-columns: repeat(4, minmax(0, 160px)); gap: 10px; margin: 8px 0 24px; }
.refs figure { margin: 0; } .refs img { width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--line); display: block; background: var(--ph); }
.refs figcaption { font-size: 13px; margin-top: 4px; }
nav ol { columns: 2 240px; padding-left: 22px; margin: 8px 0 32px; }
nav a, .top a { color: var(--accent); }
section { border-top: 1px solid var(--line); padding-top: 20px; margin-top: 28px; }
h2 { font-size: 21px; margin: 0 0 12px; display: flex; align-items: baseline; gap: 10px; }
h2 .num { font-size: 13px; color: var(--muted); font-weight: 500; }
.row { margin: 0 0 16px; }
h3 { font-size: 14px; margin: 0 0 6px; }
.grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
figure { margin: 0; }
.grid img, .ph { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; display: block; border-radius: 6px; background: var(--ph); }
.ph { display: flex; align-items: center; justify-content: center; text-align: center; padding: 6px; border: 1px dashed var(--line); color: var(--warn); font-size: 12px; }
figcaption { font-size: 11.5px; margin-top: 3px; line-height: 1.3; }
figcaption b { display: block; font-weight: 600; } figcaption span { color: var(--muted); }
.top { font-size: 13px; margin: 4px 0 0; }
@media (max-width: 760px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .refs { grid-template-columns: repeat(4, minmax(0, 1fr)); } h1 { font-size: 24px; } }
</style>
</head>
<body>
<main>
<h1>Look Test<span class="draft">DRAFT</span></h1>
<div class="note">
<p>How far a change typed into the remix screen’s change box shows, and whether the character stays recognisable. Zei and Bai from their default bases (front view), 12 changes, each with two closing lines, on the challenge’s four models, plus FLUX a second time with Zei’s three sheet views. ${made} pictures made${notMade.length ? `, ${notMade.length} not made (listed at the end)` : ''}.</p>
<p><b>Line A</b> (today’s): “${esc(ledger.lines.A)}” <b>Line B</b>: “${esc(ledger.lines.B)}” Line B stands in the same place as line A.</p>
<p>The prompt is built as the remix route builds it: the change, “&lt;Name&gt; is the person in reference image 1, the main figure.”, the style’s text, the closing line, the site’s no-words line. Style: <b>${esc(ledger.style.label)}</b>. ${esc(ledger.style.why)}</p>
<p>FLUX as the route calls it sends the tapped picture alone; the second FLUX column sends Zei’s front, side and back views, to see whether more views hold the pose. Bai’s base has a front view only. Seed 20261108 for the open models. GPT, Gemini and Qwen pictures are cropped to 16:9 as the route does.</p>
<p>The project’s own test pictures: not published, nothing stored on the site. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p>
<div class="spend"><div><b>${usd(spent)}</b><span>spent of this run’s $15 cap</span></div>
${MODELS.map((m) => `<div><b>${usd(per[m.key] ?? 0)}</b><span>${esc(m.name)}${m.key === 'flux3' ? ' (three views)' : ''}</span></div>`).join('')}
<div><b>${usd(per.guard ?? 0)}</b><span>prompt checks</span></div></div>
<details><summary class="muted">The prompts for change 1, Zei, lines A and B</summary><pre>${esc(sample('Zei', 'A'))}</pre><pre>${esc(sample('Zei', 'B'))}</pre></details>
</div>
<h2>References</h2>
<div class="refs">
<figure><img src="img/ref-zei-front.jpg" width="560" height="747" alt="Zei's base, front view: the reference for every model. AI-generated."><figcaption>Zei · front</figcaption></figure>
<figure><img src="img/ref-zei-side.jpg" width="560" height="747" alt="Zei's base, side view: sent only in the three-view FLUX column. AI-generated."><figcaption>Zei · side (three-view FLUX only)</figcaption></figure>
<figure><img src="img/ref-zei-back.jpg" width="560" height="747" alt="Zei's base, back view: sent only in the three-view FLUX column. AI-generated."><figcaption>Zei · back (three-view FLUX only)</figcaption></figure>
<figure><img src="img/ref-bai-front.jpg" width="560" height="747" alt="Bai's base, front view: the reference for every model. AI-generated."><figcaption>Bai · front</figcaption></figure>
</div>
<nav id="contents"><h2>Changes</h2><ol>${ledger.changes.map((c: string, i: number) => `<li><a href="#c${i + 1}">${esc(c)}</a></li>`).join('')}</ol></nav>
${sections.join('\n')}
<section id="not-made"><h2>Not made</h2>${notMadeList}</section>
</main>
</body>
</html>
`;
  writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`index.html written; ${files} files in img/ (${made} made)`);
}
main();
