/**
 * The review page for the glossary's definition drafts (DRAFT): docs/glossary-definitions/index.html, one card a
 * term, with each cited block's text under it so a reviewer can check a draft against the book without leaving the
 * page. Built from the drafts and the book's text only; no model, no network.
 *   npx tsx scripts/glossary-definitions-page.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadBlocks } from './lib/glossary';
import { quotedText } from '../src/lib/challenge/book-quotes';
import { draftProblems, type Draft } from './test-glossary-definitions';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'docs/glossary-definitions');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (cite: string) => {
  const m = /^c(\d+)-b(\d+)$/.exec(cite);
  return m ? `https://snowmoon.party/chapter/${m[1]}#${cite}` : '#';
};
const citeLink = (c: string) => `<a class="cite" href="${href(c)}">${esc(c)}</a>`;

const g = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/glossary.json'), 'utf8')) as { terms: { slug: string; term: string; kind?: string; mention_count?: number }[] };
const blocks = loadBlocks(ROOT);
const drafts = new Map(
  readdirSync(path.join(DIR, 'drafts'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const d = JSON.parse(readFileSync(path.join(DIR, 'drafts', f), 'utf8')) as Draft;
      return [d.slug, d] as const;
    }),
);
const terms = [...g.terms].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
let quotes = 0;
let failing = 0;
const cards = terms.map((t) => {
  const d = drafts.get(t.slug);
  if (!d) {
    failing++;
    return `<section id="${esc(t.slug)}"><h2>${esc(t.term)}</h2><p class="bad">No draft yet.</p></section>`;
  }
  const problems = draftProblems(d, blocks);
  if (problems.length) failing++;
  const cited = new Set<string>();
  const body = d.sentences
    .map((sentence) =>
      sentence
        .map((s) => {
          if ('cite' in s) {
            cited.add(s.cite);
            if ('quote' in s) {
              quotes++;
              return `“${esc(s.quote)}” <sup>${citeLink(s.cite)}</sup>`;
            }
            return ` <sup>${citeLink(s.cite)}</sup>`;
          }
          return esc(s.text);
        })
        .join(''),
    )
    .join(' ');
  const check = [...cited]
    .map((c) => {
      const b = blocks.get(c);
      return `<li><b>${citeLink(c)}</b> ${b ? esc(quotedText(b)) : '<span class="bad">not a block of the book</span>'}</li>`;
    })
    .join('');
  return `<section id="${esc(t.slug)}">
<h2>${esc(t.term)} <span class="draftmark">DRAFT</span></h2>
<p class="by">${esc(t.kind ?? 'term')} · ${t.mention_count ?? 0} mentions · ${esc(d.aiHelp)} · not approved</p>
<p>${body}</p>
${problems.length ? `<ul class="bad">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
<details class="check"><summary>The cited blocks, as the book has them</summary><ul>${check}</ul></details>
</section>`;
});

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Glossary Definition Drafts</title>
<style>
:root { --bg: #f7f6f2; --surface: #ffffff; --ink: #1d1d1b; --muted: #5f5d57; --line: #dcd9d0; --accent: #2f5d8a; --bad: #8a3b2f; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --bad: #e4a08f; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #151514; --surface: #1f1f1d; --ink: #ecebe6; --muted: #a6a39b; --line: #34332f; --accent: #8fb6dc; --bad: #e4a08f; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 26px; margin: 0 0 4px; } h2 { font-size: 19px; margin: 0 0 2px; }
a { color: var(--accent); }
.draftmark { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .06em; color: var(--bad); border: 1px solid currentColor; border-radius: 4px; padding: 0 5px; margin-left: 6px; vertical-align: middle; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 14px 0 22px; font-size: 14px; }
section { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 14px 0; }
.by { color: var(--muted); font-size: 13px; margin: 0 0 6px; }
sup a.cite { font-size: 11px; color: var(--muted); }
details.check > summary { cursor: pointer; font-size: 13px; color: var(--muted); }
details.check ul { font-size: 13px; color: var(--muted); padding-left: 18px; }
details.check li { margin: 6px 0; }
.bad { color: var(--bad); }
.index { font-size: 13px; line-height: 1.9; }
</style>
</head>
<body>
<main>
<h1>Glossary Definition Drafts</h1>
<div class="note">
<p><b>DRAFT, not approved.</b> A 1–3 sentence summary of what the book says about each glossary entry, for Garance and Nate to approve or correct, as the challenge's Learn more texts were. Every draft was ${esc('drafted with AI help (Claude, by Anthropic)')}: the coding agent (Claude, a closed model by Anthropic) read each term's mentions in the book and wrote the summary; no other model was called.</p>
<p>Quotes are word for word, checked by <code>scripts/test-glossary-definitions.ts</code> against the book's text (the rule the challenge's quotes are held to); every sentence cites at least one block (c&lt;chapter&gt;-b&lt;block&gt;, linked to the reader). Words outside quotation marks are the draft's own summary of the cited blocks: check those against the blocks shown under each card. ${terms.length} terms, ${drafts.size} drafts, ${quotes} quotes, ${failing} failing the check.</p>
<p>Nothing here is on the site: the glossary pages are unchanged until a draft is approved.</p>
</div>
<p class="index">${terms.map((t) => `<a href="#${esc(t.slug)}">${esc(t.term)}</a>`).join(' · ')}</p>
${cards.join('\n')}
</main>
</body>
</html>
`;
writeFileSync(path.join(DIR, 'index.html'), html);
console.log(`docs/glossary-definitions/index.html: ${terms.length} terms, ${drafts.size} drafts, ${quotes} quotes, ${failing} failing`);
