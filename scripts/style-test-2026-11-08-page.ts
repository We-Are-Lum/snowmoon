/**
 * The style test's comparison page (2026-11-08): reads the ledger and the pictures the test script wrote under
 * <outdir>/full, writes <outdir>/index.html with the pictures beside it as img/<style>-<character>-<model>.jpg (560 px
 * wide, quality 72) and the six reference fronts as img/ref-<character>.jpg. No external resources. Drafted by the coding
 * agent (Claude, a closed model by Anthropic). DRAFT. Nothing is published by this script.
 *
 *   npx tsx --conditions=react-server scripts/style-test-2026-11-08-page.ts <outdir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { STYLES_LIST as STYLES } from './style-test-2026-11-08-styles';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: style-test-2026-11-08-page.ts <outdir>');
const ROOT = path.resolve(import.meta.dirname, '..');
const LEDGER = path.join(ROOT, 'docs/starting-sheet-drafts/style-test-2026-11-08/ledger.json');
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as { prompts: Record<string, string>; calls: any[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
const IMG = path.join(OUT, 'img');
mkdirSync(IMG, { recursive: true });

const CHARS = ['zei', 'gladias', 'bai', 'seila', 'deluin', 'mu'];
const CALL: Record<string, string> = { zei: 'Zei', gladias: 'Gladias', bai: 'Bai', seila: 'Seila', deluin: 'Deluin', mu: 'Mu' };
const MODELS = [
  { key: 'flux', name: 'FLUX.2 [klein] 4B', terms: 'open weights, by Black Forest Labs', maker: 'Black Forest Labs' },
  { key: 'qwen', name: 'Qwen-Image-Edit 2509', terms: 'open weights, by Alibaba’s Qwen team', maker: 'Alibaba’s Qwen team' },
  { key: 'gpt', name: 'GPT Image 2.5', terms: 'a closed model by OpenAI', maker: 'OpenAI' },
  { key: 'gemini', name: 'Gemini 3.1 Flash Image', terms: 'a closed model by Google', maker: 'Google' },
];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const refs = JSON.parse(readFileSync(path.join(OUT, 'refs/refs.json'), 'utf8')) as Record<string, { version: string; url: string; sha256: string }>;
let files = 0;
async function small(src: string, dest: string) {
  if (!existsSync(dest)) await sharp(src).resize({ width: 560 }).jpeg({ quality: 72, mozjpeg: true }).toFile(dest);
  files++;
}

// The latest settled row per picture.
const last = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
for (const c of ledger.calls) if (c.kind === 'picture') last.set(`${c.style}|${c.character}|${c.model}`, c);

const spent = ledger.calls.reduce((n, c) => n + c.cost_usd, 0);
const per: Record<string, number> = { guard: 0 };
for (const c of ledger.calls) {
  const k = c.kind === 'guard' ? 'guard' : c.model ?? 'other';
  per[k] = (per[k] ?? 0) + c.cost_usd;
}
const made = [...last.values()].filter((c) => c.status === 'ok').length;
const notMade = [...last.values()].filter((c) => c.status !== 'ok');

async function main() {
  for (const c of CHARS) await small(path.join(OUT, 'refs', `${c}.jpg`), path.join(IMG, `ref-${c}.jpg`));
  const sections: string[] = [];
  let n = 0;
  for (const st of STYLES) {
    n++;
    const rows: string[] = [];
    for (const ch of CHARS) {
      const cells: string[] = [];
      let i = 0;
      for (const m of MODELS) {
        i++;
        const row = last.get(`${st.id}|${ch}|${m.key}`);
        const label = `${st.label} · ${CALL[ch]} ${i}`;
        const cap = `<figcaption><b>${esc(label)}</b><span>${esc(m.name)} · ${esc(m.terms)}</span></figcaption>`;
        if (row?.status === 'ok' && existsSync(path.join(OUT, 'full', row.file))) {
          await small(path.join(OUT, 'full', row.file), path.join(IMG, row.file));
          cells.push(`<figure><img src="img/${row.file}" width="560" height="315" loading="lazy" alt="${esc(`${CALL[ch]} in the ${st.label} style, made by ${m.name}, ${m.terms}. AI-generated test picture.`)}">${cap}</figure>`);
        } else {
          const why = !row ? 'Not made (stopped before this picture)'
            : row.status === 'refused' ? `Refused by ${m.maker}’s model`
            : row.status === 'filtered' ? 'Blocked by the host’s safety checker'
            : row.status === 'guard-refused' || row.status === 'blocked-name' ? 'Refused by the site’s prompt check'
            : 'Failed (error, retried once)';
          cells.push(`<figure class="none"><div class="ph"><span>${esc(why)}</span></div>${cap}</figure>`);
        }
      }
      rows.push(`<div class="row"><h3><img src="img/ref-${ch}.jpg" alt="" width="28" height="37">${CALL[ch]}</h3><div class="grid">${cells.join('')}</div></div>`);
    }
    sections.push(`<section id="${st.id}"><h2><span class="num">${n}</span>${esc(st.label)}</h2><p class="src">${esc(st.source)}</p><p class="prompt"><span>Style text</span>${esc(st.text)}</p>${rows.join('')}<p class="top"><a href="#contents">Back to the styles</a></p></section>`);
  }

  const promptSample = ledger.prompts[Object.keys(ledger.prompts)[0]] ?? '';
  const usd = (x: number) => `$${x.toFixed(2)}`;
  const notMadeList = notMade.length
    ? `<ul>${notMade.map((c) => `<li>${esc(`${STYLES.find((s) => s.id === c.style)?.label} · ${CALL[c.character]} · ${MODELS.find((m) => m.key === c.model)?.name}: ${c.status}${c.note ? ` (${String(c.note).slice(0, 140)})` : ''}`)}</li>`).join('')}</ul>`
    : '<p>None: every picture was made.</p>';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Style Test</title>
<style>
:root {
  --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --accent: #2f5d8a; --ph: #ecebe6; --warn: #8a3b2f;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --ph: #2a2a27; --warn: #e4a08f;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --ph: #2a2a27; --warn: #e4a08f;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1180px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.01em; }
.draft { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: var(--warn); border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; margin-left: 8px; vertical-align: middle; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 16px 0 24px; }
.note p { margin: 0 0 8px; } .note p:last-child { margin: 0; }
.muted, .src { color: var(--muted); font-size: 13px; }
.spend { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 12px 0 0; }
.spend div { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.spend b { display: block; font-size: 18px; font-variant-numeric: tabular-nums; }
.spend span { font-size: 12px; color: var(--muted); }
pre { white-space: pre-wrap; word-break: break-word; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px; font-size: 12.5px; margin: 8px 0 0; }
.refs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin: 8px 0 24px; }
.refs figure { margin: 0; } .refs img { width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--line); display: block; background: var(--ph); }
.refs figcaption { font-size: 13px; margin-top: 4px; }
nav ol { columns: 3 160px; padding-left: 20px; margin: 8px 0 32px; }
nav a, .top a { color: var(--accent); }
section { border-top: 1px solid var(--line); padding-top: 20px; margin-top: 28px; }
h2 { font-size: 22px; margin: 0 0 2px; display: flex; align-items: baseline; gap: 10px; }
h2 .num { font-size: 13px; color: var(--muted); font-weight: 500; }
.prompt { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; margin: 8px 0 16px; font-size: 14px; }
.prompt span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.row { margin: 0 0 18px; }
h3 { font-size: 15px; margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
h3 img { border-radius: 4px; object-fit: cover; }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
figure { margin: 0; }
.grid img, .ph { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; display: block; border-radius: 6px; background: var(--ph); }
.ph { display: flex; align-items: center; justify-content: center; text-align: center; padding: 8px; border: 1px dashed var(--line); color: var(--warn); font-size: 13px; }
figcaption { font-size: 12px; margin-top: 4px; line-height: 1.35; }
figcaption b { display: block; font-weight: 600; }
figcaption span { color: var(--muted); }
.top { font-size: 13px; margin: 4px 0 0; }
@media (max-width: 720px) {
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .refs { grid-template-columns: repeat(3, 1fr); }
  h1 { font-size: 24px; }
}
</style>
</head>
<body>
<main>
<h1>Style Test<span class="draft">DRAFT</span></h1>
<div class="note">
<p>The remix challenge’s style test: one test picture per style from each of the six characters’ published base (their current default look, its front view), on each of the four challenge models. ${STYLES.length} styles × ${CHARS.length} characters × ${MODELS.length} models; ${made} pictures made${notMade.length ? `, ${notMade.length} not made (listed at the end)` : ''}.</p>
<p>Every picture was made with an empty change box: the prompt is only the line that keeps the character, the style, the keep-the-character line and the site’s no-words line. Same seed (20261108) for the two open models; the closed models take none. Pictures are 1024 × 576; GPT Image 2.5 makes 1536 × 1024 (3:2), cropped to 16:9 with most of the removed height taken from the bottom so heads are kept (owner’s decision). Gemini’s 16:9 picture (1376 × 768) is scaled to fit and padded with its own corner colour, as the site does. Qwen-Image-Edit returned 1376 × 768 although 1024 × 576 was asked for; it is shown as returned, scaled down.</p>
<p>Each prompt went through the site’s prompt check first. At the challenge route’s token budget (400, the default) 62 of the 90 prompts got no answer and would have been refused; asked again at 1,200 tokens, as Remix and sheet views use, all 90 were allowed. Both runs are in the ledger.</p>
<p>These are the project’s own test pictures: not published, nothing stored on the site. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p>
<div class="spend">
<div><b>${usd(spent)}</b><span>spent of the $25 cap</span></div>
${MODELS.map((m) => `<div><b>${usd(per[m.key] ?? 0)}</b><span>${esc(m.name)}</span></div>`).join('')}
<div><b>${usd(per.guard)}</b><span>prompt checks</span></div>
</div>
<details><summary class="muted">The prompt, for Zei in the first style</summary><pre>${esc(promptSample)}</pre></details>
</div>

<h2>The six bases</h2>
<div class="refs">${CHARS.map((c) => `<figure><img src="img/ref-${c}.jpg" width="560" height="747" alt="${CALL[c]}’s base, front view: the reference picture for every test picture of ${CALL[c]}. AI-generated."><figcaption>${CALL[c]}</figcaption></figure>`).join('')}</div>

<nav id="contents"><h2>Styles</h2><ol>${STYLES.map((s) => `<li><a href="#${s.id}">${esc(s.label)}</a></li>`).join('')}</ol></nav>
${sections.join('\n')}

<section id="not-made"><h2>Not made</h2>${notMadeList}</section>
</main>
</body>
</html>
`;
  writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`index.html written; ${files} picture files in img/ (${made} made)`);
}
main();
