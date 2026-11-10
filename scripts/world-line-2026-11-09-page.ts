/**
 * The world-line test's page (2026-11-09), with the book-world follow-up as its own section: <outdir>/index.html with
 * img/ beside it (560 px JPEGs). No external resources. Drafted by the coding agent (Claude, a closed model by
 * Anthropic). DRAFT. Nothing is published.
 *
 *   npx tsx scripts/world-line-2026-11-09-page.ts <outdir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: world-line-2026-11-09-page.ts <outdir>');
const ROOT = path.resolve(import.meta.dirname, '..');
const wl = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/world-line-2026-11-09/ledger.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const bw = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/book-world-2026-11-09/ledger.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const nf = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/near-future-2026-11-09/ledger.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const NFFULL = path.join(OUT, '..', 'near-future', 'full');
const gs = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/gemini-settings-2026-11-09/ledger.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const GSFULL = path.join(OUT, '..', 'gemini-settings', 'full');
const REFS = path.join(OUT, '..', 'style-test', 'refs');
const FULL = path.join(OUT, 'full');
const BWFULL = path.join(OUT, '..', 'book-world', 'full');
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
const sum = (calls: any[], k: (c: any) => string) => { const o: Record<string, number> = {}; for (const c of calls) { const x = k(c); o[x] = (o[x] ?? 0) + c.cost_usd; } return o; }; // eslint-disable-line @typescript-eslint/no-explicit-any
const perWl = sum(wl.calls, (c) => (c.kind === 'guard' ? 'guard' : c.model ?? 'other'));
const spentWl = Object.values(perWl).reduce((a, b) => a + b, 0);
const spentBw = bw.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const spentNf = nf.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const spentGs = gs.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const usd = (x: number) => `$${x.toFixed(2)}`;
type J = { case: number; model: string; variant?: string; change_done: string; kept: string; why_not_kept: string | null; world: string; shareable: string; reading: string; promo_star?: boolean };
const judged = wl.judged_by_eye as J[];
const cases = [...new Map((wl.calls as any[]).filter((c) => c.kind === 'picture').map((c) => [c.case, c])).values()].sort((a, b) => a.case - b.case); // eslint-disable-line @typescript-eslint/no-explicit-any
const cls = (ok: boolean) => (ok ? 'ok' : 'bad');
const marks = (j: J) => `<ul class="marks"><li class="${cls(j.change_done === 'yes')}">change came through: ${j.change_done}</li><li class="${cls(j.kept === 'yes')}">still them (face and skin): ${j.kept}${j.why_not_kept ? ` (${esc(j.why_not_kept)})` : ''}</li><li class="${cls(j.world === 'yes')}">feels like Snowmoon’s world: ${j.world}</li><li class="${cls(j.shareable === 'yes')}">shareable: ${j.shareable}</li></ul>`;
const styleName = (s: string) => (s === 'Random' ? 'Random (drew “Animated series”)' : s === 'Same' ? 'Same as this picture' : s);

async function main() {
  const fronts: string[] = [];
  for (const ch of Object.keys(NAME)) fronts.push(`<figure><img src="${await small(path.join(REFS, `${ch}.jpg`), `ref-${ch}.jpg`)}" width="560" height="747" alt="${NAME[ch]}’s base, front view. AI-generated."><figcaption>${NAME[ch]}</figcaption></figure>`);
  // Summary: per model and variant, counts of yes.
  const rowsSum: string[] = [];
  for (const m of MODELS) for (const v of ['without', 'with']) {
    const js = judged.filter((j) => j.model === m.key && j.variant === v);
    if (!js.length) continue;
    const c = (f: (j: J) => boolean) => js.filter(f).length;
    rowsSum.push(`<tr><th>${esc(m.label.split(' · ')[0])}</th><td>${v}</td><td>${js.length}</td><td>${c((j) => j.change_done === 'yes')}</td><td>${c((j) => j.kept === 'yes')}</td><td>${c((j) => j.world === 'yes')}</td><td>${c((j) => j.shareable === 'yes')}</td></tr>`);
  }
  const sections: string[] = [];
  for (const c of cases) {
    for (const m of MODELS) {
      const pair = ['without', 'with'].map((v) => ({ v, j: judged.find((x) => x.case === c.case && x.model === m.key && x.variant === v) }));
      if (!pair.some((p) => p.j)) continue;
      const cells: string[] = [];
      for (const { v, j } of pair) {
        const file = `wl-${p2(c.case)}-${c.character}-${m.key}-${v}.jpg`;
        if (!j || !existsSync(path.join(FULL, file))) { cells.push(`<figure><div class="ph">not made</div></figure>`); continue; }
        cells.push(`<figure><img src="${await small(path.join(FULL, file), file)}" width="560" height="315" loading="lazy" alt="${esc(`${NAME[c.character]}, ${c.words}, ${v} the world line, by ${m.label}. AI-generated test picture.`)}"><figcaption><b>${v === 'with' ? 'WITH the world line' : 'WITHOUT'}</b><span>${esc(m.label)}</span>${marks(j)}<em>${esc(j.reading)}</em></figcaption></figure>`);
      }
      sections.push(`<div class="row"><h3><span class="num">${c.case}</span>${NAME[c.character]} · “${esc(c.words)}” <small>Style: ${esc(styleName(c.style_row))} · ${esc(m.label.split(' · ')[0])}</small></h3><div class="grid two">${cells.join('')}</div></div>`);
    }
  }
  if (wl.not_made) sections.push(`<p class="lead">${esc(wl.not_made)}</p>`);
  // Book-world: GPT with the first world line next to GPT with the book wording.
  const bwRows: string[] = [];
  const bwJ = bw.judged_by_eye as J[];
  for (const r of (bw.calls as any[]).filter((x) => x.kind === 'picture')) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const j1 = judged.find((x) => x.case === r.case && x.model === 'gpt' && x.variant === 'with')!;
    const j2 = bwJ.find((x) => x.case === r.case)!;
    const f1 = `wl-${p2(r.case)}-${r.character}-gpt-with.jpg`;
    const a = `<figure><img src="${await small(path.join(FULL, f1), f1)}" width="560" height="315" loading="lazy" alt="${esc(`${NAME[r.character]}, ${r.words}, with the first world line, by GPT Image 2.5. AI-generated test picture.`)}"><figcaption><b>First world line · style ${esc(styleName(cases.find((c) => c.case === r.case)!.style_row))}</b><span>${esc(MODELS[1].label)}</span>${marks(j1)}<em>${esc(j1.reading)}</em></figcaption></figure>`;
    const b = `<figure><img src="${await small(path.join(BWFULL, r.file), r.file)}" width="560" height="315" loading="lazy" alt="${esc(`${NAME[r.character]}, ${r.words}, with the book-based world line, by GPT Image 2.5. AI-generated test picture.`)}"><figcaption><b>${j2.promo_star ? '<span class="star" title="good enough for promo">★</span> ' : ''}Book-based world line · style ${esc(r.style_row)}</b><span>${esc(MODELS[1].label)}</span>${marks(j2)}<em>${esc(j2.reading)}</em></figcaption></figure>`;
    bwRows.push(`<div class="row"><h3><span class="num">${r.case}</span>${NAME[r.character]} · “${esc(r.words)}”</h3><div class="grid two">${a}${b}</div></div>`);
  }
  const stars = bwJ.filter((j) => j.promo_star).length;
  // Near-future settings: the book-line picture, then the two drawn settings.
  type NJ = { case: number; setting: string; change_done: string; kept: string; world: string; futuristic: string; shareable: string; promo_star: boolean; reading: string };
  const nfJ = nf.judged_by_eye as NJ[];
  const nmarks = (j: NJ) => `<ul class="marks"><li class="${cls(j.change_done === 'yes')}">change done: ${j.change_done}</li><li class="${cls(j.kept === 'yes')}">still them (face and skin): ${j.kept}</li><li class="${cls(j.world === 'yes')}">this world: ${j.world}</li><li class="${cls(j.futuristic === 'yes')}">futuristic, not medieval: ${j.futuristic}</li><li class="${cls(j.shareable === 'yes')}">shareable: ${j.shareable}</li></ul>`;
  const nfRows: string[] = [];
  for (const r of (bw.calls as any[]).filter((x) => x.kind === 'picture')) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const j0 = bwJ.find((x) => x.case === r.case)!;
    const cells = [`<figure><img src="img/${r.file}" width="560" height="315" loading="lazy" alt="${esc(`${NAME[r.character]}, ${r.words}, with the book-based line, by GPT Image 2.5. AI-generated test picture.`)}"><figcaption><b>${j0.promo_star ? '<span class="star">★</span> ' : ''}Book-based line (section 2)</b><span>${esc(MODELS[1].label)}</span><em>${esc(j0.reading)}</em></figcaption></figure>`];
    for (const letter of nf.draw.result[String(r.case)] as string[]) {
      const j = nfJ.find((x) => x.case === r.case && x.setting === letter)!;
      const row = (nf.calls as any[]).find((x) => x.kind === 'picture' && x.case === r.case && x.setting === letter && x.status === 'ok'); // eslint-disable-line @typescript-eslint/no-explicit-any
      const st = nf.settings[letter];
      cells.push(`<figure><img src="${await small(path.join(NFFULL, row.file), row.file)}" width="560" height="315" loading="lazy" alt="${esc(`${NAME[r.character]}, ${r.words}, near-future setting ${letter}, by GPT Image 2.5. AI-generated test picture.`)}"><figcaption><b>${j.promo_star ? '<span class="star">★</span> ' : ''}Setting ${letter} · style ${row.style_row === 'Same' ? 'Same as this picture' : 'Mood'}</b><span>“${esc(st.text)}” (${esc(st.blocks.join(', '))})</span><span>${esc(MODELS[1].label)}</span>${nmarks(j)}<em>${esc(j.reading)}</em></figcaption></figure>`);
    }
    nfRows.push(`<div class="row"><h3><span class="num">${r.case}</span>${NAME[r.character]} · “${esc(r.words)}”</h3><div class="grid three">${cells.join('')}</div></div>`);
  }
  const nfStars = nfJ.filter((j) => j.promo_star).length;
  // Gemini settings: the GPT near-future picture of the same case and setting, then Gemini's.
  type GJ = NJ & { figures: number };
  const gsJ = gs.judged_by_eye as GJ[];
  const gmarks = (j: GJ) => `<ul class="marks"><li class="${cls(j.change_done === 'yes')}">change done: ${j.change_done}</li><li class="${cls(j.kept === 'yes')}">still them (face and skin): ${j.kept}</li><li class="${cls(j.world === 'yes')}">this world: ${j.world}</li><li class="${cls(j.futuristic === 'yes')}">futuristic, not medieval: ${j.futuristic}</li><li class="${cls(j.figures === 1)}">figures: ${j.figures}</li><li class="${cls(j.shareable === 'yes')}">shareable: ${j.shareable}</li></ul>`;
  const gsRows: string[] = [];
  for (const g of (gs.calls as any[]).filter((x) => x.kind === 'picture' && x.status === 'ok')) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const jn = nfJ.find((x) => x.case === g.case && x.setting === g.setting)!;
    const nrow = (nf.calls as any[]).find((x) => x.kind === 'picture' && x.case === g.case && x.setting === g.setting && x.status === 'ok'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const jg = gsJ.find((x) => x.case === g.case && x.setting === g.setting)!;
    const left = `<figure><img src="img/${nrow.file}" width="560" height="315" loading="lazy" alt="${esc(`${NAME[g.character]}, ${g.words}, setting ${g.setting}, by GPT Image 2.5. AI-generated test picture.`)}"><figcaption><b>${jn.promo_star ? '<span class="star">★</span> ' : ''}GPT · setting ${g.setting} (section 3)</b><span>${esc(MODELS[1].label)}</span><em>${esc(jn.reading)}</em></figcaption></figure>`;
    const right = `<figure><img src="${await small(path.join(GSFULL, g.file), g.file)}" width="560" height="315" loading="lazy" alt="${esc(`${NAME[g.character]}, ${g.words}, setting ${g.setting}, by Gemini 3.1 Flash Image. AI-generated test picture.`)}"><figcaption><b>${jg.promo_star ? '<span class="star">★</span> ' : ''}Gemini · setting ${g.setting} · Same as this picture</b><span>${esc(MODELS[2].label)}</span>${gmarks(jg)}<em>${esc(jg.reading)}</em></figcaption></figure>`;
    gsRows.push(`<div class="row"><h3><span class="num">${g.case}</span>${NAME[g.character]} · “${esc(g.words)}” · setting ${g.setting}: “${esc(gs.settings[g.setting].text)}”</h3><div class="grid two">${left}${right}</div></div>`);
  }
  if (gs.not_made) gsRows.push(`<p class="lead">${esc(gs.not_made)}</p>`);
  const gsStars = gsJ.filter((j) => j.promo_star).length;
  const bySetting = Object.keys(nf.settings).map((k) => { const js = nfJ.filter((j) => j.setting === k); return `<tr><th>${k}</th><td>${esc(nf.settings[k].text)}</td><td>${js.length}</td><td>${js.filter((j) => j.world === 'yes').length}</td><td>${js.filter((j) => j.promo_star).length}</td></tr>`; }).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>World Line Test</title>
<style>
:root { --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --accent: #2f5d8a; --ok: #2e6b3a; --bad: #8a3b2f; --star: #a8730c; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --ok: #8fd19e; --bad: #e4a08f; --star: #f0c25a; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --ok: #8fd19e; --bad: #e4a08f; --star: #f0c25a; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1000px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; }
.draft { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: var(--bad); border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; margin-left: 8px; vertical-align: middle; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 16px 0 24px; }
.note p { margin: 0 0 8px; }
blockquote { margin: 6px 0 10px; padding: 6px 12px; border-left: 3px solid var(--line); color: var(--muted); font-size: 14px; }
.spend { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 10px 0; }
.spend div { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.spend b { display: block; font-size: 18px; font-variant-numeric: tabular-nums; } .spend span { font-size: 12px; color: var(--muted); }
.tablewrap { overflow-x: auto; }
table { border-collapse: collapse; font-size: 14px; width: 100%; }
th, td { border-bottom: 1px solid var(--line); padding: 4px 8px; text-align: left; font-variant-numeric: tabular-nums; white-space: nowrap; }
.fronts { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin: 8px 0 24px; }
.fronts img { width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--line); display: block; }
.fronts figcaption { font-size: 13px; }
nav a { color: var(--accent); }
section { border-top: 1px solid var(--line); padding-top: 20px; margin-top: 28px; }
h2 { font-size: 21px; margin: 0 0 4px; }
.lead { color: var(--muted); font-size: 14px; margin: 0 0 8px; }
figure { margin: 0; }
.row { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 14px; }
h3 { font-size: 15px; margin: 0 0 8px; } h3 .num { color: var(--muted); font-weight: 500; margin-right: 8px; } h3 small { color: var(--muted); font-weight: 400; margin-left: 6px; }
.grid.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.grid.three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 640px) { .grid.three { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.grid img, .ph { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; display: block; border-radius: 6px; background: var(--line); }
.ph { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; }
figcaption { font-size: 12px; margin-top: 3px; line-height: 1.35; }
figcaption b { display: block; } figcaption span { color: var(--muted); display: block; } figcaption em { display: block; color: var(--muted); }
.star { color: var(--star); font-size: 16px; }
.marks { list-style: none; margin: 2px 0; padding: 0; }
.marks li.ok { color: var(--ok); } .marks li.bad { color: var(--bad); }
@media (max-width: 640px) { .fronts { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
</head>
<body>
<main>
<h1>World Line Test<span class="draft">DRAFT</span></h1>
<div class="note">
<p>Does a world line make remixes feel like Snowmoon’s world? Twelve everyday prompts, two per character, each from the character’s base front, without and with this line, inserted right after the scene line of the route’s own prompt:</p>
<blockquote>${esc(wl.world_line)}</blockquote>
<p>FLUX and GPT Image 2.5 on all 12; Gemini on cases 1, 5, 8 and 11 (cases 3 and 10 didn’t fit the cap). FLUX uses one seed for both; GPT and Gemini take no seed, so their pairs also differ by chance. Then a GPT-only follow-up with a book-based line (section 2). The marks are the coding agent’s reading, strict on skin tone. All prompts passed the prompt check.</p>
<p>The project’s own test pictures: not published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p>
<div class="spend"><div><b>${usd(spentWl)}</b><span>world line, of its $2.00 cap</span></div><div><b>${usd(perWl.flux ?? 0)}</b><span>FLUX</span></div><div><b>${usd(perWl.gpt ?? 0)}</b><span>GPT Image 2.5</span></div><div><b>${usd(perWl.gemini ?? 0)}</b><span>Gemini</span></div><div><b>${usd(spentBw)}</b><span>book-world follow-up, of its $0.75 cap</span></div><div><b>${usd(spentNf)}</b><span>near-future settings, of its $1.00 cap</span></div><div><b>${usd(spentGs)}</b><span>Gemini settings, of its $0.40 cap</span></div></div>
<div class="tablewrap"><table><thead><tr><th>Model</th><th>World line</th><th>Pictures</th><th>Change came through</th><th>Still them</th><th>Snowmoon’s world</th><th>Shareable</th></tr></thead><tbody>${rowsSum.join('')}</tbody></table></div>
</div>
<h2>The six bases</h2>
<div class="fronts">${fronts.join('')}</div>
<nav><ol><li><a href="#world">Without and with the world line</a></li><li><a href="#book">GPT: the book-based world line</a></li><li><a href="#future">GPT: near-future settings</a></li><li><a href="#gemini-settings">Gemini: the settings pool</a></li></ol></nav>
<section id="world"><h2>1. Without and with the world line</h2>${sections.join('\n')}</section>
<section id="book"><h2>2. GPT: the book-based world line</h2><p class="lead">GPT Image 2.5 only, 6 cases (one per character), with this line in the same place, and the style row set to the style test’s “Comic book” and “Comic 3D mix” in turn (test-only, not offered on the challenge). Left: the first world line’s GPT picture (the case’s own style). Right: the book-based line. ★ marks a picture good enough for promo: good-looking, clearly the character, clearly this world (${stars} of ${bwJ.length}).</p><blockquote>${esc(bw.world_line)}</blockquote>${bwRows.join('\n')}</section>
<section id="future"><h2>3. GPT: near-future settings</h2><p class="lead">GPT Image 2.5 only, the same 6 cases. The line, in the same place: “${esc(nf.world_line_template)}”, with {setting} one of six settings drawn from the book, two different ones per case (drawn by a seeded generator, ${esc(nf.draw.generator)} seed ${nf.draw.seed}). Style: Same as this picture and Mood in turn, by case (${esc(nf.style_note)}). Left: the book-based line from section 2. ★ marks a picture good enough for promo (${nfStars} of ${nfJ.length}).</p><div class="tablewrap"><table><thead><tr><th>Setting</th><th>Text</th><th>Pictures</th><th>This world</th><th>★</th></tr></thead><tbody>${bySetting}</tbody></table></div>${nfRows.join('\n')}</section>
<section id="gemini-settings"><h2>4. Gemini: the settings pool</h2><p class="lead">Gemini 3.1 Flash Image (vertex only, zero data retention), the same near-future line with one setting per case from the pool E, A, B, C, D (F dropped), style Same as this picture, the shipping prompt from the release (origin/main 6cbb582). Left: GPT’s picture of the same case and setting. ★ marks a picture good enough for promo (${gsStars} of ${gsJ.length}).</p>${gsRows.join('\n')}</section>
</main>
</body>
</html>
`;
  writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`index.html written; ${files} files in img/`);
}
main();
