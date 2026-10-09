/**
 * Rendering rules, checked against the committed chapters. Fails (exit 1) on any problem.
 *
 *   npm run test:render
 *   PLANT=1 npm run test:render     relabel headings as paragraphs first; must fail
 *
 * - ¶ labels count readable blocks only (paragraph, quote, screen, figure), 1..N with
 *   no gaps; headings, datelines, and breaks have none. Block IDs are untouched.
 * - Each block's setting comes from the most recent dateline.
 * - An uncovered screen or figure renders from a matching default template, else as
 *   the source drew it; a covered one never uses the default.
 * - veridia/vote is the default for every vote screen in chapter 1 (b18, b31) and
 *   nothing else in the book, and shows the same words as the source; dzego/vote the same
 *   for the robot's voting view (c7-b6).
 * - The three voting screens are live: they start at the source's slider value, Reset
 *   returns there from anywhere, and the island and its logic neither store nor send.
 * - A render may replace only a span of screen and figure blocks.
 * - A figure's minimum width keeps its smallest text at 12px or more.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blockFacts, READABLE_KINDS, type BlockLike } from '../src/lib/reading';
import * as cheerio from 'cheerio';
import { figureMinWidth, MIN_TEXT_PX, renderMayReplace, renderScreen } from '../src/lib/render';
import { DEFAULT_TEMPLATES, type ScreenTemplate } from '../src/templates';
import { initialValue, liveReducer, sliderReading } from '../src/templates/live';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveScreen } from '../src/components/live-screen';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));

function chapter(n: number): BlockLike[] {
  const blocks = JSON.parse(readFileSync(path.join(ROOT, `content/snowmoon/text/chapter-${n}.json`), 'utf8')).blocks as BlockLike[];
  return process.env.PLANT ? blocks.map((b) => (b.kind === 'heading' ? { ...b, kind: 'paragraph' } : b)) : blocks;
}

// Labels
for (let n = 1; n <= 32; n++) {
  const blocks = chapter(n);
  const facts = blockFacts(blocks);
  const labels = facts.map((f) => f.label).filter((l): l is number => l !== null);
  check(`ch${n} labels run 1..N`, labels.every((l, i) => l === i + 1), labels.slice(0, 5).join(','));
  check(`ch${n} label count = readable blocks`, labels.length === blocks.filter((b) => READABLE_KINDS.has(b.kind)).length);
  check(`ch${n} headings, datelines, breaks unlabelled`,
    blocks.every((b, i) => READABLE_KINDS.has(b.kind) === (facts[i].label !== null)));
  check(`ch${n} block ids untouched`, blocks.every((b, i) => b.idx === i));
}
{
  const facts = blockFacts(chapter(1));
  check('c1-b2 (first paragraph) is ¶ 1', facts[2].label === 1, String(facts[2].label));
  check('c1-b18 (vote screen) is ¶ 16', facts[18].label === 16, String(facts[18].label));
}

// Settings
{
  const blocks = chapter(10);
  const facts = blockFacts(blocks);
  const at = (idx: number) => facts[blocks.findIndex((b) => b.idx === idx)].setting;
  check('ch10 opens in the United Cities', at(2) === 'united-cities', String(at(2)));
  check('ch10 moves to Veridia at its second dateline', at(30) === 'veridia', String(at(30)));
  check('ch10 ends in Dzego', at(blocks.length - 1) === 'dzego', String(at(blocks.length - 1)));
  check('ch2 is Dzego', blockFacts(chapter(2))[5].setting === 'dzego');
}

// Default templates
{
  const vote = chapter(1)[18];
  const fake: ScreenTemplate = {
    id: 'veridia/vote',
    matches: (b) => b.kind === 'screen' && (b.data as { setting?: string })?.setting === 'veridia' && b.content.includes('Vote on:'),
    render: () => '<div data-template="veridia/vote"></div>',
  };
  const none = renderScreen(vote, []);
  check('no template: as the source drew it', none.source.from === 'book' && none.html === vote.content);
  const used = renderScreen(vote, [fake]);
  check('matching template is the default', used.source.from === 'template' && used.html.includes('data-template'));
  const other = renderScreen(chapter(1)[23], [fake]);
  check('non-matching block stays as drawn', other.source.from === 'book');
  const covered = renderScreen(vote, [fake], true);
  check('a covered block ignores the default', covered.source.from === 'book');
}

// veridia/vote, the registered default
{
  const ids = DEFAULT_TEMPLATES.map((t) => t.id);
  check('template ids are unique', new Set(ids).size === ids.length, ids.join(','));
  const words = (html: string) => cheerio.load(html).text().replace(/\s+/g, '');
  const hits: string[] = [];
  const dzHits: string[] = [];
  for (let n = 1; n <= 32; n++) {
    for (const b of chapter(n)) {
      if (b.kind !== 'screen' && b.kind !== 'figure') continue;
      const matched = DEFAULT_TEMPLATES.filter((t) => t.matches(b));
      check(`c${n}-b${b.idx} matches at most one template`, matched.length <= 1, matched.map((t) => t.id).join(','));
      if (matched[0]?.id === 'veridia/vote') hits.push(`c${n}-b${b.idx}`);
      if (matched[0]?.id === 'dzego/vote') dzHits.push(`c${n}-b${b.idx}`);
    }
  }
  check('dzego/vote covers exactly the robot\'s voting view (c7-b6)', dzHits.join(',') === 'c7-b6', dzHits.join(','));
  {
    const b = chapter(7)[6];
    const r = renderScreen(b, DEFAULT_TEMPLATES);
    check('c7-b6 renders from dzego/vote', r.source.from === 'template' && r.source.templateId === 'dzego/vote');
    check('c7-b6 template shows the source\'s words', words(r.html) === words(b.content), `${words(r.html)} | ${words(b.content)}`);
    check('c7-b6 template is static', !/<(input|button|select|textarea|a|script)\b|\son\w+=/i.test(r.html));
    check('c7-b6 covered ignores dzego/vote', renderScreen(b, DEFAULT_TEMPLATES, true).source.from === 'book');
  }
  const voteScreens = chapter(1).filter((b) => b.kind === 'screen' && b.content.includes('Vote on:')).map((b) => `c1-b${b.idx}`);
  check('chapter 1 has the two vote screens', voteScreens.join(',') === 'c1-b18,c1-b31', voteScreens.join(','));
  check('veridia/vote covers exactly the vote screens', hits.join(',') === voteScreens.join(','), hits.join(','));
  for (const idx of [18, 31]) {
    const b = chapter(1)[idx];
    const r = renderScreen(b, DEFAULT_TEMPLATES);
    check(`c1-b${idx} renders from veridia/vote`, r.source.from === 'template' && r.source.templateId === 'veridia/vote');
    check(`c1-b${idx} template shows the source's words`, words(r.html) === words(b.content), `${words(r.html)} | ${words(b.content)}`);
    check(`c1-b${idx} template is static`, !/<(input|button|select|textarea|a|script)\b|\son\w+=/i.test(r.html));
    check(`c1-b${idx} template marks itself in-world`, r.html.includes('data-template="veridia/vote"'));
    check(`c1-b${idx} covered ignores veridia/vote`, renderScreen(b, DEFAULT_TEMPLATES, true).source.from === 'book');
  }
  const off = { ...chapter(1)[18], data: { ...chapter(1)[18].data, setting: 'dzego' } };
  check('veridia/vote needs a Veridian screen', !DEFAULT_TEMPLATES.some((t) => t.matches(off)));
}

// Live voting screens: they start where the book shows them, Reset returns there, nothing is stored or sent
{
  const live = [
    [1, 18],
    [1, 31],
    [7, 6],
  ] as const;
  const found: string[] = [];
  for (let n = 1; n <= 32; n++) {
    for (const b of chapter(n)) if (DEFAULT_TEMPLATES.find((t) => t.matches(b))?.live) found.push(`c${n}-b${b.idx}`);
  }
  check('the live screens are the three voting views', found.join(',') === 'c1-b18,c1-b31,c7-b6', found.join(','));
  for (const [n, idx] of live) {
    const b = chapter(n)[idx];
    const t = DEFAULT_TEMPLATES.find((t) => t.matches(b))!;
    const s = t.live!(b);
    const html = t.render(b);
    const start = initialValue(s);
    check(`c${n}-b${idx} live: starts at the source's value`, start === s.start && start === 50, String(start));
    check(`c${n}-b${idx} live: the track is marked for the island`, (html.match(/data-live-track/g) ?? []).length === 1);
    // Reset, from anywhere, returns to the start.
    const step = liveReducer(s);
    for (const v of [0, 37, 80, 100, 250, -9]) {
      const moved = step(start, { type: 'set', value: v });
      check(`c${n}-b${idx} live: set ${v} stays on the track`, moved >= s.min && moved <= s.max);
      check(`c${n}-b${idx} live: Reset after ${v} returns to the source`, step(moved, { type: 'reset' }) === start);
    }
    check(`c${n}-b${idx} live: the slider moves`, sliderReading(s, step(start, { type: 'set', value: 100 })) !== sliderReading(s, start));
    // The island's server render: the template's HTML untouched, at the start.
    const ssr = renderToStaticMarkup(createElement(LiveScreen, { html, slider: s, draftLine: false }));
    check(`c${n}-b${idx} live: the island's server HTML contains the template's HTML`, ssr.includes(html));
    check(`c${n}-b${idx} live: the island renders no control before it mounts but Reset`, !/<(input|select|textarea)\b/.test(ssr));
    check(`c${n}-b${idx} live: the island starts at the source's value`, ssr.includes(`data-value="${start}"`));
  }
  const readings = live.map(([n, idx]) => {
    const b = chapter(n)[idx];
    const s = DEFAULT_TEMPLATES.find((t) => t.matches(b))!.live!(b);
    return [0, 50, 55, 75, 100].map((v) => sliderReading(s, v)).join(' ');
  });
  check('Veridia readings', readings[0] === '-5.0 0 +0.5 +2.5 +5.0', readings[0]);
  check('Dzego readings', readings[2] === '🙁2 😐 😐 😊 😊2', readings[2]);
  // Nothing is stored or sent: a static scan of the island and its logic.
  const NOPE = /localStorage|sessionStorage|indexedDB|document\.cookie|cookieStore|caches\.|fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|serviceWorker|import\s*\(|\bform\b|action=|navigator\./;
  for (const f of ['src/components/live-screen.tsx', 'src/templates/live.ts', 'src/templates/veridia-vote.ts', 'src/templates/dzego-vote.ts']) {
    const code = readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    const hit = code.match(NOPE);
    check(`${f} neither stores nor sends`, !hit, hit?.[0]);
  }
  // The scan catches a planted write.
  check('the storage scan catches localStorage', NOPE.test('useEffect(() => localStorage.setItem("v", v))'));
}

// A render replaces only screens and figures
{
  const c1 = chapter(1);
  check('render may replace one screen (b18)', renderMayReplace(c1, 18, 18));
  check('render may not replace a screen and its paragraph (b17-b18)', !renderMayReplace(c1, 17, 18));
  check('render may not replace a paragraph (b2)', !renderMayReplace(c1, 2, 2));
  check('render may not replace past the chapter end', !renderMayReplace(c1, c1.length - 1, c1.length));
  const isScreen = (b?: BlockLike) => b?.kind === 'screen' || b?.kind === 'figure';
  const pair = Array.from({ length: 32 }, (_, i) => i + 1).flatMap((n) => {
    const bs = chapter(n);
    const i = bs.findIndex((b, j) => isScreen(b) && isScreen(bs[j + 1]));
    return i >= 0 ? [{ n, bs, i }] : [];
  })[0];
  check('render may replace adjacent screens or figures', !!pair && renderMayReplace(pair.bs, pair.bs[pair.i].idx, pair.bs[pair.i + 1].idx));
}

// Figures keep text at 12px or more
{
  const fig = chapter(1)[67];
  const w = figureMinWidth(fig);
  check('c1-b67 min width keeps 9-unit text at 12px', w === Math.ceil((400 * MIN_TEXT_PX) / 9), String(w));
  check('a figure with no text has no minimum', figureMinWidth(chapter(4)[137]) === null);
}

if (failures.length) {
  console.error(`\nRENDER TESTS FAILED (${failures.length}, ${passed} passed):\n- ` + failures.slice(0, 20).join('\n- '));
  process.exit(1);
}
console.log(`render tests passed: ${passed} checks`);
