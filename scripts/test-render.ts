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
 * - A figure's minimum width keeps its smallest text at 12px or more.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blockFacts, READABLE_KINDS, type BlockLike } from '../src/lib/reading';
import { figureMinWidth, MIN_TEXT_PX, renderScreen } from '../src/lib/render';
import type { ScreenTemplate } from '../src/templates';

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
