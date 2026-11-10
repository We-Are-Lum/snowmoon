/**
 * The real-prompts test's page (2026-11-09): <outdir>/index.html with img/ beside it (560 px JPEGs): the six base
 * fronts, then one row per case with its base and the three pictures, each with four marks judged by eye. No external
 * resources. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Nothing is published.
 *
 *   npx tsx scripts/real-prompts-2026-11-09-page.ts <outdir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: real-prompts-2026-11-09-page.ts <outdir>');
const ROOT = path.resolve(import.meta.dirname, '..');
const ledger = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/real-prompts-2026-11-09/ledger.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const REFS = path.join(OUT, '..', 'style-test', 'refs');
const FULL = path.join(OUT, 'full');
const IMG = path.join(OUT, 'img');
mkdirSync(IMG, { recursive: true });
const NAME: Record<string, string> = { zei: 'Zei', gladias: 'Gladias', bai: 'Bai', seila: 'Seila', deluin: 'Deluin', mu: 'Mu' };
const MODELS = [
  { key: 'flux', label: 'FLUX.2 [klein] 4B · open weights, by Black Forest Labs' },
  { key: 'gpt', label: 'GPT Image 2.5 · a closed model by OpenAI' },
  { key: 'gemini', label: 'Gemini 3.1 Flash Image · a closed model by Google' },
];
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const p2 = (n: number) => String(n).padStart(2, '0');
let files = 0;
async function small(src: string, name: string) {
  const dest = path.join(IMG, name);
  if (!existsSync(dest)) await sharp(src).resize({ width: 560 }).jpeg({ quality: 72, mozjpeg: true }).toFile(dest);
  files++;
  return `img/${name}`;
}
const per: Record<string, number> = {};
for (const c of ledger.calls) { const k = c.kind === 'guard' ? 'guard' : c.model ?? 'other'; per[k] = (per[k] ?? 0) + c.cost_usd; }
const spent = Object.values(per).reduce((a, b) => a + b, 0);
const usd = (x: number) => `$${x.toFixed(2)}`;
const judged = ledger.judged_by_eye as { case: number; model: string; change_done: string | null; kept: string | null; why_not_kept: string | null; figures: number; shareable: string; reading: string }[];
const cases = [...new Map((ledger.calls as any[]).filter((c) => c.kind === 'picture').map((c) => [c.case, c])).values()].sort((a, b) => a.case - b.case); // eslint-disable-line @typescript-eslint/no-explicit-any
const count = (m: string, f: (j: (typeof judged)[number]) => boolean) => judged.filter((j) => j.model === m && f(j)).length;

async function main() {
  const fronts: string[] = [];
  for (const ch of Object.keys(NAME)) fronts.push(`<figure><img src="${await small(path.join(REFS, `${ch}.jpg`), `ref-${ch}.jpg`)}" width="560" height="747" alt="${NAME[ch]}’s base, front view: the reference for every picture of ${NAME[ch]}. AI-generated."><figcaption>${NAME[ch]}</figcaption></figure>`);
  const rows: string[] = [];
  for (const c of cases) {
    const cells: string[] = [`<figure class="base"><img src="img/ref-${c.character}.jpg" width="560" height="747" alt="${NAME[c.character]}’s base front, for comparison. AI-generated."><figcaption>${NAME[c.character]}’s base</figcaption></figure>`];
    for (const m of MODELS) {
      const j = judged.find((x) => x.case === c.case && x.model === m.key)!;
      const row = (ledger.calls as any[]).filter((x) => x.kind === 'picture' && x.case === c.case && x.model === m.key).pop(); // eslint-disable-line @typescript-eslint/no-explicit-any
      const marks = j.change_done === null
        ? `<b class="bad">Blocked by the host’s safety checker</b>`
        : `<ul class="marks"><li class="${j.change_done === 'yes' ? 'ok' : 'bad'}">change done: ${j.change_done}</li><li class="${j.kept === 'yes' ? 'ok' : 'bad'}">still them (face and skin): ${j.kept}${j.why_not_kept ? ` (${esc(j.why_not_kept)})` : ''}</li><li class="${j.figures === 1 ? 'ok' : 'bad'}">figures: ${j.figures}</li><li class="${j.shareable === 'yes' ? 'ok' : 'bad'}">good enough to share: ${j.shareable}</li></ul>`;
      const pic = row?.status === 'ok' && existsSync(path.join(FULL, row.file))
        ? `<img src="${await small(path.join(FULL, row.file), row.file)}" width="560" height="315" loading="lazy" alt="${esc(`${NAME[c.character]}, ${c.words}, by ${m.label}. AI-generated test picture.`)}">`
        : `<div class="ph">${esc(row?.status === 'filtered' ? 'Blocked by fal’s safety checker' : row?.status ?? 'not made')}</div>`;
      cells.push(`<figure>${pic}<figcaption><span>${esc(m.label)}</span>${marks}<em>${esc(j.reading)}</em></figcaption></figure>`);
    }
    const style = c.style_row === 'Random' ? 'Random (drew “Animated series”)' : c.style_row === 'Same' ? 'Same as this picture' : 'Animated series';
    rows.push(`<div class="row"><h3><span class="num">${c.case}</span>${NAME[c.character]} · “${esc(c.words)}” <small>Style: ${esc(style)}</small></h3><div class="grid">${cells.join('')}</div></div>`);
  }
  const summary = MODELS.map((m) => `<tr><th>${esc(m.label.split(' · ')[0])}</th><td>${count(m.key, (j) => j.change_done === 'yes')}</td><td>${count(m.key, (j) => j.kept === 'yes')}</td><td>${count(m.key, (j) => j.figures === 1)}</td><td>${count(m.key, (j) => j.shareable === 'yes')}</td></tr>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Real Prompts Test</title>
<style>
:root { --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --ok: #2e6b3a; --bad: #8a3b2f; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --ok: #8fd19e; --bad: #e4a08f; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --ok: #8fd19e; --bad: #e4a08f; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1180px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; }
.draft { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: var(--bad); border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; margin-left: 8px; vertical-align: middle; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 16px 0 24px; }
.note p { margin: 0 0 8px; }
.spend { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 10px 0; }
.spend div { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.spend b { display: block; font-size: 18px; font-variant-numeric: tabular-nums; } .spend span { font-size: 12px; color: var(--muted); }
table { border-collapse: collapse; font-size: 14px; width: 100%; max-width: 640px; }
th, td { border-bottom: 1px solid var(--line); padding: 4px 8px; text-align: left; font-variant-numeric: tabular-nums; }
.fronts { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin: 8px 0 24px; }
.fronts img { width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--line); display: block; }
.fronts figcaption { font-size: 13px; }
figure { margin: 0; }
.row { border-top: 1px solid var(--line); padding-top: 14px; margin-top: 18px; }
h3 { font-size: 15px; margin: 0 0 8px; } h3 .num { color: var(--muted); font-weight: 500; margin-right: 8px; } h3 small { color: var(--muted); font-weight: 400; margin-left: 6px; }
.grid { display: grid; grid-template-columns: 0.4fr repeat(3, minmax(0, 1fr)); gap: 8px; align-items: start; }
.grid img, .ph { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; display: block; border-radius: 6px; background: var(--line); }
.base img { aspect-ratio: 3 / 4; }
.ph { display: flex; align-items: center; justify-content: center; text-align: center; color: var(--bad); font-size: 12px; padding: 6px; }
figcaption { font-size: 12px; margin-top: 3px; line-height: 1.35; }
figcaption span { color: var(--muted); display: block; }
figcaption em { display: block; color: var(--muted); }
figcaption b.bad { color: var(--bad); display: block; }
.marks { list-style: none; margin: 2px 0; padding: 0; }
.marks li.ok { color: var(--ok); } .marks li.bad { color: var(--bad); }
@media (max-width: 760px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .base { grid-column: span 2; max-width: 120px; } .fronts { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
</head>
<body>
<main>
<h1>Real Prompts Test<span class="draft">DRAFT</span></h1>
<div class="note">
<p>Twelve things a person might type, two per character, made from each character’s default base (its front, as the remix screen sends it) on three models. Every prompt is the route’s own, in the shipping order: the change, the reference line, the look line, the scene line, the style, “Keep the face recognisable; change anything else the words describe.”, the no-words line. The Style row takes turns: Same as this picture, Animated series, Random. Random is recorded as drawing “Animated series”.</p>
<p>The marks under each picture are the coding agent’s reading, strict on skin tone (the face against the base front and the figure’s own arms). All 12 prompts passed the prompt check. One picture each.</p>
<p>The project’s own test pictures: not published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p>
<div class="spend"><div><b>${usd(spent)}</b><span>spent of the $2.00 cap</span></div><div><b>${usd(per.flux ?? 0)}</b><span>FLUX.2 [klein] 4B</span></div><div><b>${usd(per.gpt ?? 0)}</b><span>GPT Image 2.5</span></div><div><b>${usd(per.gemini ?? 0)}</b><span>Gemini 3.1 Flash Image</span></div><div><b>${usd(per.guard ?? 0)}</b><span>prompt checks</span></div></div>
<table><thead><tr><th>Of 12</th><th>Change done</th><th>Still them</th><th>One figure</th><th>Shareable</th></tr></thead><tbody>${summary}</tbody></table>
</div>
<h2>The six bases</h2>
<div class="fronts">${fronts.join('')}</div>
${rows.join('\n')}
</main>
</body>
</html>
`;
  writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`index.html written; ${files} files in img/`);
}
main();
