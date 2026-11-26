/**
 * The book's citations as drawn (Nate, 2026-11-24: "remove the visible block codes … Each citation becomes a small book
 * icon … The block id stays in the link, so every quote still cites its block. … The words don't change."), checked
 * on rendered HTML, for the Learn more panels (scripts/test-challenge-moments.ts, every character) and the Ephelion
 * challenge's intro and Learn more (scripts/test-voice.ts):
 * - no block code is shown as text;
 * - each citation is one icon (adjacent citations one each): a link to its first block in the reader, its block (or
 *   range) in data-block, named and titled "In the book: chapter N", an SVG with no text and no ⓘ;
 * - every link to the reader there is such an icon;
 * - every quotation (a <q>, or words in quotation marks) has a citation icon after it, before the next quotation, and
 *   the quoted words are in a block it cites there (so a quote whose own citation is dropped fails, even when a later
 *   citation in the paragraph is another quote's);
 * - the words are the texts' own (the data's text and terms, in order), the citations removed.
 * Each is proven to fail on a planted fault by the tests.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { CITE, citeHref, citeLabel } from '../../src/lib/book-cite';
import type { LearnMoreView, Rendered } from '../../src/lib/challenge/learn-more-view';

const CODE = /c\d+-b\d+(?:–b\d+)?/;
const ROOT = path.resolve(import.meta.dirname, '../..');
const chapters = new Map<number, Map<number, string>>();
/** The words of a block or a range, as plain text. */
function bookText(cite: string): string {
  const m = CITE.exec(cite);
  if (!m) return '';
  const n = Number(m[1]);
  if (!chapters.has(n)) chapters.set(n, new Map((JSON.parse(readFileSync(path.join(ROOT, `content/snowmoon/text/chapter-${n}.json`), 'utf8')) as { blocks: { idx: number; content: string }[] }).blocks.map((b) => [b.idx, b.content.replace(/<[^>]+>/g, ' ')])));
  const c = chapters.get(n)!;
  const [a, z] = [Number(m[2]), Number(m[3] ?? m[2])];
  return Array.from({ length: z - a + 1 }, (_, i) => c.get(a + i) ?? '').join(' ');
}
const plain = (t: string) => t.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();

/** The citation problems of an HTML fragment, and the icons' blocks in order. */
export function citeProblems(html: string, where: string): { problems: string[]; blocks: string[] } {
  const $ = cheerio.load(html, null, false);
  const problems: string[] = [];
  const shown = $.root().text();
  if (CODE.test(shown)) problems.push(`${where}: a block code is shown as text (${CODE.exec(shown)![0]})`);
  const blocks: string[] = [];
  $('a.book-cite').each((_, a) => {
    const el = $(a);
    const b = el.attr('data-block') ?? '';
    blocks.push(b);
    if (!CITE.test(b)) problems.push(`${where}: a citation icon without its block in data-block ("${b}")`);
    else {
      if (el.attr('href') !== citeHref(b)) problems.push(`${where}: ${b}'s icon links to ${el.attr('href')}, not ${citeHref(b)}`);
      if (el.attr('aria-label') !== citeLabel(b) || el.attr('title') !== citeLabel(b)) problems.push(`${where}: ${b}'s icon is named "${el.attr('aria-label')}" / titled "${el.attr('title')}", not "${citeLabel(b)}"`);
    }
    if (el.text().trim() !== '' || el.find('svg').length !== 1) problems.push(`${where}: ${b}'s citation isn't the icon alone (text "${el.text().trim()}")`);
  });
  $('a[href^="/chapter/"]').not('.book-cite').each((_, a) => void problems.push(`${where}: a link to the reader that isn't the book icon (${$(a).attr('href')})`));
  $('q').each((_, q) => {
    const next = $(q).nextAll().first();
    if (!(next.is('a.book-cite') || next.children('a.book-cite').length)) problems.push(`${where}: a quote with no citation link ("${$(q).text().slice(0, 50)}")`);
  });
  // Words in quotation marks in running text: a citation before the next quotation or the end of the paragraph.
  $('p, li').each((_, el) => {
    const c = $(el).clone();
    c.find('[popover], q, .chc-term-i, p, li').remove();
    c.find('a.book-cite').each((_, a) => void $(a).replaceWith(`\u0001${$(a).attr('data-block') ?? ''}\u0002`));
    const s = c.text();
    for (const m of s.matchAll(/["“][^"”]*["”]/g)) {
      const after = s.slice(m.index! + m[0].length);
      const next = after.search(/["“]/);
      const cited = [...(next < 0 ? after : after.slice(0, next)).matchAll(/\u0001([^\u0002]*)\u0002/g)].map((x) => x[1]);
      if (!cited.length) problems.push(`${where}: a quote with no citation link (${m[0].slice(0, 50)})`);
      else if (!cited.some((b) => plain(bookText(b)).includes(plain(m[0])))) problems.push(`${where}: a quote whose words aren't in the block it cites (${m[0].slice(0, 50)}; ${cited.join(', ')})`);
    }
  });
  return { problems, blocks };
}

const said = (segs: Rendered[]) => segs.map((s) => (s.kind === 'text' ? s.text : s.kind === 'term' ? s.term : '')).join('');
const cites = (segs: Rendered[]) => segs.flatMap((s) => (s.kind === 'cite' ? [s.block] : s.kind === 'term' && s.note ? [s.note.cite] : []));

/** A Learn more panel (LearnMoreParts) against its view: its citations, one icon each in order, and its words. */
export function learnMoreCiteProblems(view: LearnMoreView, html: string, where: string): string[] {
  const { problems, blocks } = citeProblems(html, where);
  const $ = cheerio.load(html, null, false);
  const words = (sel: string) => {
    const c = $(sel).first().clone();
    c.find('[popover], .chc-term-i, a.book-cite').remove();
    return c.text();
  };
  let want: string[];
  if (view.text) {
    const t = view.text;
    want = [t.who, t.start, t.later, t.drives].flatMap((p) => cites(p.segs)).concat(t.invent.items.flatMap(cites));
    for (const [part, p] of [['who', t.who], ['start', t.start], ['later', t.later], ['drives', t.drives]] as const) {
      const got = words(`[data-part="${part}"]`);
      if (got !== `${p.head} ${said(p.segs)}`) problems.push(`${where} ${part}: the words changed: "${got}" ≠ "${p.head} ${said(p.segs)}"`);
    }
    t.invent.items.forEach((it, i) => {
      const got = words(`[data-part="invent"] li:nth-of-type(${i + 1})`);
      if (got !== said(it)) problems.push(`${where} invent ${i + 1}: the words changed: "${got}" ≠ "${said(it)}"`);
    });
    const notes = [t.who, t.start, t.later, t.drives].flatMap((p) => p.segs).concat(t.invent.items.flat()).flatMap((s) => (s.kind === 'term' && s.note ? [s.note.text] : []));
    const q = $('[popover] q').map((_, e) => $(e).text()).get();
    if (q.join('\n') !== notes.join('\n')) problems.push(`${where}: the glossary notes' quotes changed`);
  } else {
    want = view.facts.map((f) => f.block);
    view.facts.forEach((f, i) => {
      const li = $('li.chc-fact').eq(i);
      if (li.find('.chc-fact-text').text() !== f.text || li.find('q').text() !== f.quote || li.find('.chc-fact-cite').text().trim() !== view.chips[i]) problems.push(`${where} fact ${i + 1}: the words changed`);
    });
  }
  if (blocks.join(' ') !== want.join(' ')) problems.push(`${where}: the icons' blocks are ${blocks.join(' ')}, not one per citation (${want.join(' ')})`);
  return problems;
}

/** The Ephelion challenge's intro as reread on 2026-11-22, as it showed until 2026-11-24 (its codes visible). */
export const INTRO_WITH_CODES = [
  'Lord Ephelion is the Arctic Empire\'s consul to Veridia (c3-b5). In the book his messages reach Veridians everywhere: on a poster in a tunnel (c3-b4), in a live debate (c8-b17), on a restaurant screen that cuts into a Helisport game (c13-b62). As one character puts it, "Ephelion\'s goal is to inspire people inside Veridia to join the Arctic cause." (c21-b76)',
  'Give one of his speeches a voice: perform it yourself, or start from a ready-made reading, then storyboard it.',
];
export const INTRO_BLOCKS = ['c3-b5', 'c3-b4', 'c8-b17', 'c13-b62', 'c21-b76'];

/** The intro (EphelionIntro): its words are the old text minus the codes, and its icons are its five citations. */
export function introCiteProblems(html: string): string[] {
  const { problems, blocks } = citeProblems(html, 'the Ephelion intro');
  const $ = cheerio.load(html, null, false);
  const got = $('.vr-intro > p').map((_, p) => $(p).text()).get();
  // Nate, 2026-11-24: no parentheses either, so each "(code)" goes, leaving the icon right after the words.
  const want = INTRO_WITH_CODES.map((p) => p.replace(new RegExp(`\\(${CODE.source}\\)`, 'g'), ''));
  if (got.join('\n') !== want.join('\n')) problems.push(`the Ephelion intro: the words changed: "${got.join(' / ')}"`);
  if (blocks.join(' ') !== INTRO_BLOCKS.join(' ')) problems.push(`the Ephelion intro: the icons' blocks are ${blocks.join(' ')}, not ${INTRO_BLOCKS.join(' ')}`);
  return problems;
}
