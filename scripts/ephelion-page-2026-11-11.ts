/**
 * The Lord Ephelion page (2026-11-11): <outdir>/index.html with img/ beside it. The book's passages are quoted word for
 * word from content/snowmoon/text/chapter-N.json (tags removed, text kept), each with its block id; the look-line draft
 * keeps book-based and invented details apart. No external resources; nothing is published. Drafted by the coding agent
 * (Claude, a closed model by Anthropic). DRAFT.
 *
 *   npx tsx scripts/ephelion-page-2026-11-11.ts <outdir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: ephelion-page-2026-11-11.ts <outdir>');
const ROOT = path.resolve(import.meta.dirname, '..');
const ledger = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/ephelion-2026-11-11/ledger.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const REFS = path.join(OUT, '..', 'style-test', 'refs');
const IMG = path.join(OUT, 'img');
mkdirSync(IMG, { recursive: true });
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Every block that names him (search "Ephelion"), in the book's order. */
const BLOCKS: [number, number[]][] = [[3, [5]], [6, [143]], [8, [17, 26, 34, 36, 37, 88]], [11, [109]], [13, [11, 63, 64]], [16, [101]], [20, [8]], [21, [44, 73, 75, 76]], [23, [84]], [24, [40, 48, 54]], [26, [69]], [27, [74, 76, 78, 87, 90]]];
/** Blocks near those, read for pronoun follow-ons: his debate turn (c8-b27 to c8-b35) has no name, so it is quoted as his words, with the chapter's own turn order. */
const FOLLOW: [number, number[]][] = [[8, [27, 28, 29, 30, 31, 35]]];
const text = (ch: number, i: number) => {
  const b = JSON.parse(readFileSync(path.join(ROOT, `content/snowmoon/text/chapter-${ch}.json`), 'utf8')).blocks[i];
  if (b.idx !== i) throw new Error(`c${ch}-b${i}: index mismatch`);
  return String(b.content).replace(/<hr[^>]*>/g, '\n').replace(/<\/(p|b|tr|th|td|div)>/g, '\n').replace(/<[^>]+>/g, '').replace(/^>\s?/gm, '').replace(/\*/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
};

async function small(src: string, name: string) {
  const dest = path.join(IMG, name);
  if (!existsSync(dest)) await sharp(src).resize({ width: 560 }).jpeg({ quality: 72, mozjpeg: true }).toFile(dest);
  return `img/${name}`;
}

async function main() {
  const quote = (ch: number, i: number) => `<blockquote><cite>c${ch}-b${i}</cite>${esc(text(ch, i)).replace(/\n/g, '<br>')}</blockquote>`;
  const passages = BLOCKS.map(([ch, ids]) => `<h3>Chapter ${ch}</h3>${ids.map((i) => quote(ch, i)).join('')}`).join('');
  const follow = FOLLOW.map(([ch, ids]) => ids.map((i) => quote(ch, i)).join('')).join('');
  const cands: string[] = [];
  let n = 0;
  for (const v of ['a', 'b', 'c']) {
    n++;
    const row = (ledger.calls as any[]).find((c) => c.kind === 'picture' && c.variant === v && c.status === 'ok'); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!row) { cands.push(`<figure><div class="ph">Candidate ${n} (${v}): not made</div></figure>`); continue; }
    cands.push(`<figure><img src="${await small(path.join(OUT, 'full', row.file), row.file)}" width="560" height="747" loading="lazy" alt="Lord Ephelion candidate ${n}: ${esc(ledger.variants[v])}. AI-generated."><figcaption><b>Candidate ${n} (${v})</b><span>AI-generated · GPT Image 2.5 · a closed model by OpenAI</span><span>Invented (this edition’s): ${esc(ledger.variants[v])}</span><span>sha256 <code>${esc(row.sha256)}</code> · $${row.cost_usd.toFixed(4)}</span></figcaption></figure>`);
  }
  const fronts: string[] = [];
  for (const [ch, nm] of [['zei', 'Zei'], ['gladias', 'Gladias'], ['bai', 'Bai'], ['seila', 'Seila'], ['deluin', 'Deluin'], ['mu', 'Mu']]) {
    fronts.push(`<figure><img src="${await small(path.join(REFS, `${ch}.jpg`), `base-${ch}.jpg`)}" width="560" height="747" loading="lazy" alt="${nm}'s published base, front. AI-generated."><figcaption><b>${nm}</b><span>published base</span></figcaption></figure>`);
  }
  const spent = (ledger.calls as any[]).reduce((s, c) => s + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lord Ephelion</title>
<style>
:root { --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --book: #2e6b3a; --inv: #8a5a0c; --bad: #8a3b2f; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --book: #8fd19e; --inv: #f0c25a; --bad: #e4a08f; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --book: #8fd19e; --inv: #f0c25a; --bad: #e4a08f; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 900px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; } h2 { font-size: 21px; margin: 32px 0 8px; } h3 { font-size: 15px; margin: 18px 0 6px; color: var(--muted); }
.draft { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: var(--bad); border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; margin-left: 8px; vertical-align: middle; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 16px 0 24px; }
.note p { margin: 0 0 8px; }
blockquote { margin: 0 0 10px; padding: 8px 12px; background: var(--surface); border-left: 3px solid var(--book); border-radius: 0 6px 6px 0; font-size: 14px; }
blockquote cite { display: block; font-style: normal; font-size: 12px; font-weight: 600; color: var(--book); margin-bottom: 2px; }
details summary { cursor: pointer; color: var(--muted); }
.line { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
.book { color: var(--book); font-weight: 600; } .inv { color: var(--inv); font-weight: 600; }
table { border-collapse: collapse; width: 100%; font-size: 14px; } th, td { border-bottom: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
.tablewrap { overflow-x: auto; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.grid.six { grid-template-columns: repeat(6, minmax(0, 1fr)); }
figure { margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; min-width: 0; }
figure img, .ph { width: 100%; height: auto; aspect-ratio: 3 / 4; object-fit: contain; display: block; background: var(--line); }
.ph { display: flex; align-items: center; justify-content: center; color: var(--bad); }
figcaption { font-size: 12px; padding: 6px 8px 8px; line-height: 1.35; overflow-wrap: anywhere; } figcaption b { display: block; font-size: 13px; } figcaption span { display: block; color: var(--muted); }
code { font-size: 11px; }
@media (max-width: 640px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .grid.six { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
</head>
<body>
<main>
<h1>Lord Ephelion<span class="draft">DRAFT</span></h1>
<div class="note">
<p>Groundwork for a mid-challenge drop around 19–20 November: what the book says about Lord Ephelion, a look-line draft for the owner, and three base candidates in the challenge’s Animated series look.</p>
<p><b>The book never describes how he looks.</b> It gives his title, his role, that he is a man, and that he is seen on screens and posters. Every visual detail below is this edition’s invention and is marked so.</p>
<p>Spent: $${spent.toFixed(2)} of a $1.50 cap (3 pictures and 3 prompt checks). AI-generated candidates, not published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p>
</div>

<h2>What the book says</h2>
<div class="tablewrap"><table><thead><tr><th>Detail</th><th>Block</th><th>Words</th></tr></thead><tbody>
<tr><td>Titled Lord; the Arctic Empire’s consul to Veridia</td><td>c3-b5, c13-b64</td><td>“Lord Ephelion” / “Arctic Empire consul to Veridia.”</td></tr>
<tr><td>Also called the Arctic ambassador; debates Professor Sylka live</td><td>c8-b17</td><td>“Lord Ephelion, Arctic ambassador to Veridia”</td></tr>
<tr><td>A man</td><td>c21-b76</td><td>“So he's openly saying a version of the Arctic cause”</td></tr>
<tr><td>Seen as an image on screens; his messages on posters</td><td>c13-b63, c6-b143</td><td>“An image of Lord Ephelion appeared on the left side of the screen” / “the poster with Lord Ephelion's message”</td></tr>
<tr><td>Gives sermons and speeches</td><td>c11-b109, c16-b101, c24-b40</td><td>“Lord Ephelion giving his sermons all the time”</td></tr>
<tr><td>A propagandist</td><td>c21-b75</td><td>“Ephelion and Delwart are not intellectuals, they are propagandists.”</td></tr>
<tr><td>Was in Northglade at the invasion</td><td>c20-b8</td><td>“Lord Ephelion, Arctic consul to Veridia, was in Northglade at the time of the invasion.”</td></tr>
<tr><td>Looks: face, age, skin, hair, eyes, build, clothes</td><td>none</td><td>The book says nothing.</td></tr>
</tbody></table></div>

<h2>This edition’s existing descriptor</h2>
<p>content/snowmoon/designs/characters/ephelion.json says the book never describes his appearance and calls its look invented. Beyond the book: every visual detail (in his fifties, tall and imposing, pale skin with a cool undertone, a chiselled face, long platinum-white hair, pale-blue eyes, an ice-blue faceted coat with a towering collar, a white half-cape, a white bodysuit, silver seams, white gloves) is this edition’s invention. One citation is off: its fact “male” cites c8-b37 (“A gifted demagogue, he concluded.”), where “he” is Gladias concluding; c21-b76 is the block that shows Ephelion is a man.</p>

<h2>Look line (draft)</h2>
<div class="line"><span class="book">Book-based:</span> “Unless the change says otherwise: a man” (c21-b76).</div>
<div class="line"><span class="inv">This edition’s invention (for the owner to decide), proposed minimal addition, matching the other six lines’ length:</span> “… in his fifties, with pale skin, long swept-back platinum-white hair and pale-blue eyes.” (from the existing descriptor; candidate 1)</div>
<div class="line">Proposed whole line, if the owner keeps candidate 1: <b>“Unless the change says otherwise: a man in his fifties, with pale skin, long swept-back platinum-white hair and pale-blue eyes.”</b> Only “a man” is from the book (c21-b76); the rest is this edition’s invention. Alternatives follow candidates 2 and 3: “a man in his fifties, with deep brown skin, close-cropped grey hair and a short grey beard” or “a man in his forties, with olive skin, slicked-back black hair and grey eyes”.</div>

<h2>Base candidates</h2>
<p>GPT Image 2.5 from text alone, whole figure, one person, front-facing, plain light-grey background, in the Animated series look (its exact style text), 1024 × 1536 fitted to the bases’ 576 × 768. All three prompts passed the prompt check. The coats and colours are this edition’s invention.</p>
<div class="grid">${cands.join('')}</div>
<h3>The six published bases, for comparison</h3>
<div class="grid six">${fronts.join('')}</div>

<h2>The passages, word for word</h2>
<p>Every block that names him, in the book’s order (HTML tags removed, words kept). His debate turn in chapter 8 does not name him in each block; those blocks follow, as his words by the chapter’s turn order.</p>
${passages}
<details><summary>His debate turn, c8-b27 to c8-b35 (unnamed blocks)</summary>${follow}</details>
</main>
</body>
</html>
`;
  writeFileSync(path.join(OUT, 'index.html'), html);
  console.log('index.html written');
}
main();
