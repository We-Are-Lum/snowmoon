/**
 * The blind bake-off as one self-contained HTML file, private/glossary-bakeoff/page.html, to open without the site
 * (owner, 2026-10-23: outputs stay out of the public repo until read). The same content as /glossary-bakeoff: labels
 * A, B and C, the counts per label, each sentence with its citations (linked to the live reader), the chapter it
 * shows from, and the support check's verdict. Reads the page data and the support check only, never the key.
 * No model, no network.
 *
 *   npx tsx scripts/glossary-bakeoff-page.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BAKEOFF_FILE, BAKEOFF_PAGE_FILE, BAKEOFF_SUPPORT_FILE, type Entry } from './lib/glossary-explain';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
if (!existsSync(path.join(ROOT, BAKEOFF_FILE))) throw new Error(`${BAKEOFF_FILE} does not exist: run the bake-off first`);
const b = read(BAKEOFF_FILE) as { date: string; prompt_file: string; slugs: string[]; labels: Record<string, { entries: Entry[]; problems: string[] }> };
type Verdict = { n: number; supported: boolean; why: string; by: string };
const s = existsSync(path.join(ROOT, BAKEOFF_SUPPORT_FILE))
  ? (read(BAKEOFF_SUPPORT_FILE) as { checker: { model: string; maker: string; date: string }; counts: Record<string, { sentences: number; unsupported: number; by_program: number }>; results: Record<string, Record<string, Verdict[]>> })
  : null;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (c: string) => `<a href="https://snowmoon.party/chapter/${c.match(/^c(\d+)/)![1]}#${c}">${c}</a>`;
const labels = Object.keys(b.labels).sort();

const rows = labels
  .map((l) => {
    const n = b.labels[l].entries.reduce((a, e) => a + e.sentences.length, 0);
    const c = s?.counts[l];
    return `<tr><td>${l}</td><td>${n}</td><td>${c ? `${c.unsupported} of ${c.sentences}` : 'not checked'}</td><td>${b.labels[l].problems.length}</td></tr>`;
  })
  .join('');
const sections = b.slugs
  .map((slug) => {
    const term = b.labels[labels[0]].entries.find((e) => e.slug === slug)?.term ?? slug;
    const cols = labels
      .map((l) => {
        const e = b.labels[l].entries.find((x) => x.slug === slug);
        const items = (e?.sentences ?? [])
          .map((x, i) => {
            const v = s?.results[l]?.[slug]?.find((r) => r.n === i + 1);
            const mark = v ? (v.supported ? ' · supported' : ` · <b>UNSUPPORTED</b>: ${esc(v.why)}`) : '';
            return `<li class="${v && !v.supported ? 'bad' : ''}">${esc(x.text)} <small>${x.cites.map(link).join(', ')} · from Ch ${x.gate}${mark}</small></li>`;
          })
          .join('');
        const probs = b.labels[l].problems.filter((p) => p.startsWith(`${slug} `) || p.startsWith(`${slug}:`)).map((p) => `<p class="prob">Program: ${esc(p)}</p>`).join('');
        return `<div class="col"><h3>${l}</h3>${items ? `<ol>${items}</ol>` : '<p>No usable answer.</p>'}${probs}</div>`;
      })
      .join('');
    return `<section><h2>${esc(term)}</h2>${cols}</section>`;
  })
  .join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Glossary bake-off (private)</title>
<style>body{font:17px/1.5 Georgia,serif;max-width:760px;margin:0 auto;padding:16px;color:#222;background:#fbf8f1}table{border-collapse:collapse}td,th{padding:6px 10px;border-bottom:1px solid #ccc;text-align:left}section{border-top:1px solid #ccc;margin-top:16px}li{margin:6px 0}li.bad{text-decoration:underline wavy #b33;text-underline-offset:3px}small{color:#555}.prob{color:#b33;font-size:14px}a{color:#2a5d8f}</style></head><body>
<p><small>GLOSSARY · BAKE-OFF · PRIVATE (not on GitHub or the site)</small></p>
<h1>Three models, labelled A, B and C</h1>
<p>The same prompt (<code>${esc(b.prompt_file)}</code>) and the whole book to each model, on ${esc(b.date)}. Which label is which model is in a separate key file, not in this page. Every chapter is shown.</p>
<table><thead><tr><th>Label</th><th>Sentences</th><th>Unsupported</th><th>Program problems</th></tr></thead><tbody>${rows}</tbody></table>
${s ? `<p><small>Checked by ${esc(s.checker.model)} (${esc(s.checker.maker)}), not one of the three, against each sentence's cited blocks only, on ${esc(s.checker.date)}. A sentence that fails the program's checks (citation, word-for-word quote, gate) counts as unsupported.</small></p>` : ''}
${sections}
</body></html>
`;
writeFileSync(path.join(ROOT, BAKEOFF_PAGE_FILE), html);
console.log(`wrote ${BAKEOFF_PAGE_FILE}`);
