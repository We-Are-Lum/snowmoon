/**
 * The overnight pages of 2026-11-10 (owner's tasks A, B, C), from docs/starting-sheet-drafts/overnight-2026-11-10/
 * manifest.json (scripts/overnight-manifest-2026-11-10.py): style-samples/, bases-pick-2/ and promo/ under the
 * scratchpad, each an index.html with img/ beside it (560 px JPEGs). No external resources; nothing is published.
 * Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT.
 *
 *   npx tsx scripts/overnight-pages-2026-11-10.ts <scratchpad>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const S = process.argv[2];
if (!S) throw new Error('usage: overnight-pages-2026-11-10.ts <scratchpad>');
const ROOT = path.resolve(import.meta.dirname, '..');
const M = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/overnight-2026-11-10/manifest.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
:root { --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --ok: #2e6b3a; --bad: #8a3b2f; --star: #a8730c; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --ok: #8fd19e; --bad: #e4a08f; --star: #f0c25a; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --ok: #8fd19e; --bad: #e4a08f; --star: #f0c25a; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; }
h2 { font-size: 21px; margin: 28px 0 6px; }
.draft { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: var(--bad); border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; margin-left: 8px; vertical-align: middle; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 16px 0 24px; }
.note p { margin: 0 0 8px; }
.lead { color: var(--muted); font-size: 14px; margin: 0 0 10px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.grid.tall { grid-template-columns: repeat(7, minmax(0, 1fr)); }
figure { margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; min-width: 0; }
figure img, .ph { width: 100%; height: auto; display: block; background: var(--line); }
.wide img { aspect-ratio: 16 / 9; object-fit: cover; }
.tall img, .tall .ph { aspect-ratio: 3 / 4; object-fit: contain; }
.ph { display: flex; align-items: center; justify-content: center; color: var(--bad); font-size: 12px; padding: 6px; text-align: center; }
figcaption { font-size: 12px; padding: 6px 8px 8px; line-height: 1.35; overflow-wrap: anywhere; }
figcaption b { display: block; font-size: 13px; }
figcaption span { display: block; color: var(--muted); }
.ok { color: var(--ok); } .bad { color: var(--bad); } .star { color: var(--star); }
code { font-size: 11px; }
.post { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin: 8px 0; white-space: pre-wrap; }
.post small { display: block; color: var(--muted); margin-top: 4px; }
@media (max-width: 760px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .grid.tall { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;
const page = (title: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;

async function small(dir: string, src: string, name: string) {
  const img = path.join(dir, 'img');
  mkdirSync(img, { recursive: true });
  const dest = path.join(img, name);
  if (!existsSync(dest)) await sharp(path.join(S, src)).resize({ width: 560 }).jpeg({ quality: 72, mozjpeg: true }).toFile(dest);
  return `img/${name}`;
}
const modelLine = (it: any) => (it.model ? `${esc(it.model_name)} · ${esc(it.maker)}` : esc(it.model_name)); // eslint-disable-line @typescript-eslint/no-explicit-any
const recipe = (it: any) => `<span>Ledger: <code>${esc(it.ledger)}</code>, row ${esc(it.row)}</span>${it.sha256 ? `<span>sha256 <code>${esc(it.sha256)}</code></span>` : ''}`; // eslint-disable-line @typescript-eslint/no-explicit-any
const cls = (v: string | null) => (v === 'yes' ? 'ok' : 'bad');

async function styleSamples() {
  const dir = path.join(S, 'style-samples');
  const sections: string[] = [];
  let count = 0;
  for (const [style, items] of Object.entries(M.A) as [string, any[]][]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const cells: string[] = [];
    let n = 0;
    for (const it of items) {
      n++; count++;
      const src = await small(dir, it.src, `${style.toLowerCase().replace(/\s+/g, '-')}-${n}-${it.file}`);
      cells.push(`<figure class="wide"><img src="${src}" width="560" height="315" loading="lazy" alt="${esc(`${style} ${n}: ${it.character}, by ${it.model_name}. AI-generated.`)}"><figcaption><b>${esc(style)} ${n}</b><span>${esc(it.character)} · ${esc(it.change)}</span><span>${modelLine(it)}</span>${it.style ? `<span>Style row: ${esc(it.style)}</span>` : ''}${recipe(it)}<span class="${cls(it.strong)}">Strong sample of the style: ${esc(it.strong)} — ${esc(it.note)}</span></figcaption></figure>`);
    }
    sections.push(`<h2>${esc(style)}</h2><div class="grid">${cells.join('')}</div>`);
  }
  writeFileSync(path.join(dir, 'index.html'), page('Style Samples', `<h1>Style Samples<span class="draft">DRAFT</span></h1>
<div class="note"><p>Candidate sample pictures for the three styles published without samples: Animated series, Comic book and Comic 3D mix. All are pictures that already exist, each with its full recipe in the ledger named under it; nothing new was made for this page. The owner picks two per style.</p><p>“Strong sample” is the coding agent’s reading: clearly that look, the character recognisable, one figure. The style test’s pictures (8 Nov) were made with that test’s prompt (“Style: …” and the earlier closing line) and an empty change box; the others with the challenge’s prompt.</p><p>AI-generated test pictures, not published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p></div>
${sections.join('\n')}`));
  return count;
}

async function basesPick() {
  const dir = path.join(S, 'bases-pick-2');
  const rows: string[] = [];
  let count = 0;
  for (const ch of M.B) {
    const cells: string[] = [];
    for (const it of ch.items) {
      count++;
      const label = it.kind === 'base' ? 'Base now' : it.kind === 'gemini' ? `Look ${it.file.match(/look-(\w+)-/)?.[1]} · Gemini (5 Nov)` : `Look ${it.look} · ${it.model_name}`;
      const marks = it.kind === 'base' ? '<span>The published base.</span>' : it.marks && it.marks[0] !== null
        ? `<span class="${cls(it.marks[0])}">look matched: ${it.marks[0]}</span><span class="${cls(it.marks[1])}">still them (signature details): ${it.marks[1]}</span><span class="${cls(it.marks[2])}">usable base front: ${it.marks[2]}</span><span class="${cls(it.marks[3])}">shareable: ${it.marks[3]}</span><span>${esc(it.marks[4])}</span>`
        : `<span class="bad">${esc(it.marks?.[4] ?? 'not made')}</span>`;
      const pic = it.src && existsSync(path.join(S, it.src)) && !(it.marks && it.marks[0] === null)
        ? `<img src="${await small(dir, it.src, `${ch.slug}-${it.kind}-${it.file}`)}" width="560" height="747" loading="lazy" alt="${esc(`${ch.character}, ${label}. AI-generated.`)}">`
        : `<div class="ph">${esc(it.marks?.[4] ?? 'not made')}</div>`;
      cells.push(`<figure>${pic}<figcaption><b>${esc(label)}</b><span>${modelLine(it)}</span>${marks}${recipe(it)}</figcaption></figure>`);
    }
    rows.push(`<h2>${esc(ch.character)}</h2><p class="lead">Look a: “${esc(ch.looks.a)}”. Look b: “${esc(ch.looks.b)}”.${ch.slug === 'bai' ? ' Bai’s Gemini drafts are her a2 and b2.' : ''}</p><div class="grid tall">${cells.join('')}</div>`);
  }
  writeFileSync(path.join(dir, 'index.html'), page('Bases Pick 2', `<h1>Bases Pick 2<span class="draft">DRAFT</span></h1>
<div class="note"><p>Up to three bases each for Zei, Bai, Seila and Mu. Each row: the published base first, then looks a and b as drafted on 5 Nov (Gemini 3.1 Flash Image, a closed model by Google), then tonight’s recasts from the base front on GPT Image 2.5 (a closed model by OpenAI) and FLUX.2 [klein] 4B (open weights, by Black Forest Labs), with style “Same as this picture”. The looks are the three-looks proposal’s words: only skin, hair and eyes change; clothes and signature details stay.</p><p>Marks are the coding agent’s reading: look matched (the proposal’s skin, hair and eyes), still them (clothes and signature details), usable as a base front (one figure, plain background, the whole body), shareable.</p><p>AI-generated test pictures, not published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p></div>
${rows.join('\n')}`));
  return count;
}

async function promo() {
  const dir = path.join(S, 'promo');
  const cells: string[] = [];
  let n = 0;
  for (const it of M.C) {
    n++;
    const src = await small(dir, it.src, `${String(n).padStart(2, '0')}-${it.file}`);
    cells.push(`<figure class="wide"><img src="${src}" width="560" height="315" loading="lazy" alt="${esc(`AI-generated: ${it.character}, ${it.change}, by ${it.model_name}.`)}"><figcaption><b><span class="star">★</span> ${n}. ${esc(it.character)} · “${esc(it.change)}”</b><span>AI-generated · ${modelLine(it)}</span><span>Style: ${esc(it.style)} · ${esc(it.setting)}</span>${recipe(it)}</figcaption></figure>`);
  }
  const posts = M.posts.map((p: { text: string; chars: number }, i: number) => `<div class="post"><b>Post ${i + 1}</b>\n${esc(p.text)}<small>${p.chars} characters</small></div>`).join('');
  writeFileSync(path.join(dir, 'index.html'), page('Challenge Promo', `<h1>Challenge Promo<span class="draft">DRAFT</span></h1>
<div class="note"><p><b>Announcement drafts for Thursday 12 Nov (DRAFT).</b> Entries open 00:00 PT Thursday 12 Nov and close 23:59 PT Sunday 29 Nov. No model or maker is named in the posts, and nothing implies a partnership or endorsement.</p>${posts}</div>
<h2>The best starred pictures, best first</h2>
<p class="lead">From the world-line, near-future, Gemini settings, real-prompts and re-test runs. Every picture is AI-generated; each names its model and maker, the character, the change, and the style and setting line used. Test pictures, not published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p>
<div class="grid">${cells.join('')}</div>`));
  return n;
}

const a = await styleSamples();
const b = await basesPick();
const c = await promo();
console.log(`style-samples ${a}, bases-pick-2 ${b}, promo ${c}`);
