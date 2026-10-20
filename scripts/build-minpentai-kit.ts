/**
 * The Minpentai build-on kit's generated files, from the rules table (src/lib/minpentai/kit-rules.ts),
 * the book (content/snowmoon/text) and the code:
 * - public/minpentai/rules.json: the rules (from the book, with block and quote; or invented, with where
 *   in the code), the numbers Play uses, and the 152 passages (ids only: the words stay in the book);
 * - docs/minpentai/rules.md: the table;
 * - docs/minpentai/passages.md: every passage, word for word, the later ones under a spoiler heading.
 *
 * Before writing, it checks: 152 passages; every cited block exists and is a passage; every quote is
 * word for word in its block; every code place is in its file. `--check` also fails if a file is stale.
 *
 *   npx tsx scripts/build-minpentai-kit.ts [--check]      (npm run test:minpentai-kit)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LEARN_TEXT } from '../src/lib/minpentai/learn-text';
import { AREAS, KIT_RULES, type KitRule } from '../src/lib/minpentai/kit-rules';
import {
  PASSAGE_COUNT, SHOWN_CHAPTERS, blockParagraphs, counts, figureWords, findPassages, passageProblems, tableProblems,
  type BookBlock, type Passage,
} from '../src/lib/minpentai/kit';
import { COST, H, MAXS, RULES, ROCKS, W } from '../src/lib/minpentai/play-game/game';
import { POINTS, SETUP_MS, TURN_MS } from '../src/lib/minpentai/play-server/match';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const CHECK = process.argv.includes('--check');

export function loadKit() {
  const book: Record<number, BookBlock[]> = {};
  for (let n = 1; n <= 32; n++) book[n] = JSON.parse(read(`content/snowmoon/text/chapter-${n}.json`)).blocks;
  const passages = findPassages(book, read('docs/minpentai-rules.md'), JSON.stringify(LEARN_TEXT));
  const files: Record<string, string | undefined> = {};
  for (const r of KIT_RULES) for (const c of r.code ?? []) files[c.file] = existsSync(path.join(ROOT, c.file)) ? read(c.file) : undefined;
  return { book, passages, files };
}

const REASON_WORDS = { names: 'names Minpentai', 'rules-doc': 'cited in docs/minpentai-rules.md', learn: 'cited in Learn' } as const;
const SITE_WORDS = { yes: 'Yes', partly: 'Partly', no: 'No' } as const;
const DRAFT = 'DRAFT. Written by the coding agent (Anthropic\'s Claude, a closed model) from the book and the code, for the owner to rewrite or approve. The quotes are the book\'s words, unchanged. Rules invented for this edition · not affiliated with the author.';

function rulesJson(passages: Passage[]) {
  return {
    about: 'Minpentai in this edition: every rule, marked from the book (with the block and its words) or invented for this edition (with where it is in the code), and whether the site follows it. The 152 passages are listed by block id; their words are in the book (content/snowmoon/text, or /chapter/N#cN-bM).',
    status: DRAFT,
    generatedBy: 'scripts/build-minpentai-kit.ts from src/lib/minpentai/kit-rules.ts',
    page: '/minpentai/build',
    docs: 'docs/minpentai/',
    site: {
      play: 'Practice, the computer ladder, free play and one-on-one: src/lib/minpentai/play-game/game.ts',
      learn: "The lessons: src/lib/minpentai/learn-game/ (Design's v3; the rules page says Play's rules replace it)",
      rulePage: "/minpentai/rule, the rule recovered from the book's figure: src/lib/minpentai/engine.ts",
    },
    counts: { ...counts(), passages: passages.length, passagesShown: passages.filter((p) => p.shown).length },
    /** Play's numbers, read from the code. All invented. */
    config: {
      board: { width: W, height: H },
      steps: MAXS,
      turnEvery: 12,
      pointsPerTurn: POINTS,
      costs: { glider: 4, square: COST.s, tower: COST.t },
      sight: 3,
      squareHits: 2,
      towersAtStart: 2,
      rocks: ROCKS,
      oneOnOneSeconds: { setup: SETUP_MS / 1000, turn: TURN_MS / 1000 },
      drawnRules: RULES,
    },
    rules: KIT_RULES.map((r) => ({
      id: r.id, area: r.area, rule: r.rule, source: r.source, ...(r.how ? { how: r.how } : {}),
      cites: r.cites ?? [], code: r.code ?? [], site: r.site, siteNote: r.siteNote,
    })),
    passages: passages.map((p) => ({ block: p.block, chapter: p.chapter, kind: p.kind, reasons: p.reasons, rulePassage: p.rulePassage, shownOnPage: p.shown, href: `/chapter/${p.chapter}#${p.block}` })),
  };
}

const md = (s: string) => s.replace(/\|/g, '\\|');
const cite = (r: KitRule) => (r.cites ?? []).map((c) => (c.quote ? `${c.block}: "${md(c.quote)}"` : `${c.block} (figure)`)).join('<br>');
const code = (r: KitRule) => (r.code ?? []).map((c) => `\`${c.file}\``).filter((x, i, a) => a.indexOf(x) === i).join('<br>');

function rulesMd(passages: Passage[]) {
  const n = counts();
  const out = [
    '# Minpentai: the rules table',
    '',
    `> ${DRAFT}`,
    '',
    '> **Spoilers** for chapters 2–14: the quotes come from the matches in those chapters.',
    '',
    `Generated by \`scripts/build-minpentai-kit.ts\` from \`src/lib/minpentai/kit-rules.ts\`; do not edit by hand. The same table is \`public/minpentai/rules.json\` and the page \`/minpentai/build\`.`,
    '',
    `**${KIT_RULES.length} rules: ${n.book} from the book, ${n.invented} invented.** The site follows ${n.site.yes}, partly follows ${n.site.partly}, and does not follow ${n.site.no}.`,
    '',
    '- **From the book**: the cited blocks say it (stated) or it follows from what they describe (implied), as read in `docs/minpentai-rules.md`. Every quote is word for word in its block; `npm run test:minpentai-kit` checks.',
    '- **Invented**: this edition\'s, with where it is in the code. Where the book says something nearby, its words are cited too.',
    '- **Site**: whether the site follows the rule today. Play is practice, the ladder, free play and one-on-one (`play-game/game.ts`); Learn is the lessons (`learn-game/`, v3); the book\'s rule page is `/minpentai/rule` (`engine.ts`).',
    '',
  ];
  for (const [area, title] of Object.entries(AREAS)) {
    const rows = KIT_RULES.filter((r) => r.area === area);
    if (!rows.length) continue;
    out.push(`## ${title}`, '', '| Rule | Source | The book\'s words | Code | Site |', '|---|---|---|---|---|');
    for (const r of rows) {
      const src = r.source === 'book' ? `From the book (${r.how})` : 'Invented';
      out.push(`| ${md(r.rule)} | ${src} | ${cite(r) || '–'} | ${code(r) || '–'} | ${SITE_WORDS[r.site]}: ${md(r.siteNote)} |`);
    }
    out.push('');
  }
  out.push(`The ${passages.filter((p) => p.rulePassage).length} passages these rules cite are in \`docs/minpentai/passages.md\`, with the rest of the ${passages.length}.`, '');
  return out.join('\n');
}

function passagesMd(book: Record<number, BookBlock[]>, passages: Passage[]) {
  const shown = passages.filter((p) => p.shown), rest = passages.filter((p) => !p.shown);
  const one = (p: Passage) => {
    const b = book[p.chapter].find((x) => x.idx === p.idx)!;
    const head = `**${p.block}** (${p.reasons.map((r) => REASON_WORDS[r]).join(', ')}${p.kind === 'figure' ? '; figure' : p.kind === 'screen' ? '; screen' : ''})`;
    const words = figureWords(b);
    const body = p.kind === 'figure' ? [words.length ? `(figure; its only words: ${words.join(' ')})` : '(figure, no words)'] : blockParagraphs(b);
    return [head, ...body.map((t) => `> ${t}`), ''].join('\n');
  };
  const byChapter = (list: Passage[]) => {
    const out: string[] = [];
    let ch = 0;
    for (const p of list) {
      if (p.chapter !== ch) { ch = p.chapter; out.push(`### Chapter ${ch}`, ''); }
      out.push(one(p));
    }
    return out.join('\n');
  };
  return [
    '# Minpentai: every passage, word for word',
    '',
    `> Generated by \`scripts/build-minpentai-kit.ts\`; do not edit by hand. The words are the book's, as committed in \`content/snowmoon/text\`, with markup removed (\`*word*\` is the book's emphasis). The headings and notes are the coding agent's (DRAFT).`,
    '',
    `**${passages.length} passages.** A block is listed if it names Minpentai, is cited in \`docs/minpentai-rules.md\`, or is cited by Learn's words (\`src/lib/minpentai/learn-text.ts\`); a cited range counts each of its blocks.`,
    '',
    `## The rule passages, chapters ${SHOWN_CHAPTERS[0]}–${SHOWN_CHAPTERS[1]} (${shown.length})`,
    '',
    `The blocks the rules table cites. **Spoilers** for chapters ${SHOWN_CHAPTERS[0]}–${SHOWN_CHAPTERS[1]}.`,
    '',
    byChapter(shown),
    `## Spoilers: the other ${rest.length} passages`,
    '',
    `Everything else: passages in chapters ${SHOWN_CHAPTERS[0]}–${SHOWN_CHAPTERS[1]} that no rule cites, and every passage after chapter ${SHOWN_CHAPTERS[1]}, through chapter ${Math.max(...passages.map((p) => p.chapter))}. On the page they are inside a closed Spoilers section.`,
    '',
    byChapter(rest),
  ].join('\n');
}

const { book, passages, files } = loadKit();
const problems = [...passageProblems(passages), ...tableProblems(KIT_RULES, book, passages, files)];
if (problems.length) {
  console.error(`minpentai kit: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const out: Record<string, string> = {
  'public/minpentai/rules.json': JSON.stringify(rulesJson(passages), null, 2) + '\n',
  'docs/minpentai/rules.md': rulesMd(passages),
  'docs/minpentai/passages.md': passagesMd(book, passages),
};
let stale = 0;
for (const [p, body] of Object.entries(out)) {
  const full = path.join(ROOT, p);
  if (CHECK) {
    if (!existsSync(full) || readFileSync(full, 'utf8') !== body) { console.error(`${p} is stale: run npx tsx scripts/build-minpentai-kit.ts`); stale++; }
  } else {
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
    console.log(`wrote ${p}`);
  }
}
const n = counts();
console.log(`minpentai kit: ${passages.length} passages (${PASSAGE_COUNT} expected; ${passages.filter((p) => p.shown).length} shown, ${passages.filter((p) => !p.shown).length} behind Spoilers); ${KIT_RULES.length} rules, ${n.book} from the book, ${n.invented} invented; every citation and quote checked against the book, every code place against its file`);
if (stale) process.exit(1);
