/**
 * FLUX change-at-the-end test's pages (2026-11-09): the rows (re-test FLUX picture, variant E, variant S) as a section
 * for the three-tests page (fluxEndSection), and a small standalone page <outdir>/index.html with img/ beside it.
 * No external resources. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Nothing published.
 *
 *   npx tsx scripts/flux-change-end-2026-11-09-page.ts <outdir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CASES } from './retest-2026-11-09-cases';

const ROOT = path.resolve(import.meta.dirname, '..');
const p2 = (n: number) => String(n).padStart(2, '0');
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FLUX = 'FLUX.2 [klein] 4B · open weights, by Black Forest Labs';

/** The section's HTML; pictures are written to imgDir as 560 px JPEGs. `retestFull` holds the re-test's FLUX pictures. */
export async function fluxEndSection(opts: { endFull: string; retestFull: string; imgDir: string; id?: string; title: string }): Promise<{ html: string; files: number; spent: number }> {
  const ledger = JSON.parse(readFileSync(path.join(ROOT, 'docs/starting-sheet-drafts/flux-change-end-2026-11-09/ledger.json'), 'utf8')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  mkdirSync(opts.imgDir, { recursive: true });
  let files = 0;
  const judged = ledger.judged_by_eye as { character: string; change: number; variant: string; change_shown: string; kept: string; copies: number; reading: string }[];
  const rows: string[] = [];
  for (const c of CASES) {
    const nm = c.ch === 'zei' ? 'Zei' : 'Bai';
    const cells: string[] = [];
    for (const [v, src, label] of [
      ['R', path.join(opts.retestFull, `retest-c${p2(c.change)}-${c.ch}-flux.jpg`), 'before (re-test): the change first'],
      ['E', path.join(opts.endFull, `fluxend-E-c${p2(c.change)}-${c.ch}.jpg`), 'E: “The change: …” last, after the no-words line'],
      ['S', path.join(opts.endFull, `fluxend-S-c${p2(c.change)}-${c.ch}.jpg`), 'S: “The change: …” just before the no-words line'],
    ] as [string, string, string][]) {
      const name = `fluxend-${v}-c${p2(c.change)}-${c.ch}.jpg`;
      const dest = path.join(opts.imgDir, name);
      if (!existsSync(dest)) await sharp(src).resize({ width: 560 }).jpeg({ quality: 72, mozjpeg: true }).toFile(dest);
      files++;
      const j = judged.find((x) => x.character === c.ch && x.change === c.change && x.variant === v)!;
      const good = j.change_shown === 'yes' && j.kept === 'yes' && j.copies === 1;
      cells.push(`<figure><img src="img/${name}" width="560" height="315" loading="lazy" alt="${esc(`${nm}, ${c.words}, by FLUX.2 [klein] 4B, ${label}. AI-generated test picture.`)}"><figcaption><b class="${good ? 'ok' : 'bad'}">change: ${j.change_shown} · kept: ${j.kept} · ${j.copies === 1 ? 'one figure' : `${j.copies} copies`}</b><b>${esc(j.reading)}</b><span>${esc(FLUX)} · ${esc(label)}</span></figcaption></figure>`);
    }
    rows.push(`<div class="row"><h3>“${esc(c.words)}” · ${nm}</h3><div class="grid three">${cells.join('')}</div></div>`);
  }
  const spent = ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
  const sample = Object.values(ledger.prompts as Record<string, string>)[0] ?? '';
  const html = `<section id="${opts.id ?? 'flux-end'}"><h2>${esc(opts.title)}</h2><p class="lead">FLUX.2 [klein] 4B edit only, the base front only, the same seed as the re-test (20261108). The prompt keeps the re-test’s lines but moves the change words out of first place, written as “The change: …”: last (E), or just before the no-words line (S). Spent $${spent.toFixed(2)} of a $0.20 cap. Notes under each picture are the coding agent’s reading.</p><details><summary class="lead">Variant E’s prompt for the first case</summary><pre>${esc(sample)}</pre></details>${rows.join('')}</section>`;
  return { html, files, spent };
}

async function main(OUT: string) {
  const S = path.join(OUT, '..');
  const sec = await fluxEndSection({ endFull: path.join(OUT, 'full'), retestFull: path.join(S, 'three-tests', 'full'), imgDir: path.join(OUT, 'img'), title: 'FLUX: the change at the end' });
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FLUX Change Order</title>
<style>
:root { --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --ok: #2e6b3a; --bad: #8a3b2f; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --ok: #8fd19e; --bad: #e4a08f; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --ok: #8fd19e; --bad: #e4a08f; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; }
.draft { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .06em; color: var(--bad); border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; margin-left: 8px; vertical-align: middle; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 16px 0 24px; }
.note p { margin: 0; }
h2 { font-size: 21px; margin: 0 0 4px; }
.lead { color: var(--muted); font-size: 14px; margin: 0 0 8px; }
pre { white-space: pre-wrap; word-break: break-word; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px; font-size: 12.5px; }
h3 { font-size: 14px; margin: 14px 0 6px; }
.grid.three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 640px) { .grid.three { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
figure { margin: 0; }
.grid img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; display: block; border-radius: 6px; background: var(--line); }
figcaption { font-size: 12px; margin-top: 3px; line-height: 1.35; }
figcaption b { display: block; font-weight: 600; } figcaption b.ok { color: var(--ok); } figcaption b.bad { color: var(--bad); }
figcaption span { color: var(--muted); }
</style>
</head>
<body>
<main>
<h1>FLUX Change Order<span class="draft">DRAFT</span></h1>
<div class="note"><p>Does FLUX follow the change better when the change comes at the end of the prompt? The project’s own test pictures: not published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner approves it.</p></div>
${sec.html}
</main>
</body>
</html>
`;
  writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`index.html written; ${sec.files} files in img/; spent $${sec.spent.toFixed(4)}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('usage: flux-change-end-2026-11-09-page.ts <outdir>');
  main(process.argv[2]);
}
