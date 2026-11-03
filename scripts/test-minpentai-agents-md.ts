/**
 * docs/minpentai/agents.md (served at /minpentai/agents.md) says only what is true of this checkout,
 * and docs/minpentai/passages.md is the book's words. Fails (exit 1) on any problem. No server, no network.
 *
 *   npm run test:minpentai-agents
 *
 * Checks:
 * - passages.md is up to date with the book (scripts/build-minpentai-passages.ts --check), holds 152
 *   passages, and every quoted line in it is word for word in its block of content/snowmoon/text;
 *   the spoiler heading comes before chapter 15 and nothing from chapter 15 on comes before it.
 * - agents.md: every repository path it names exists; every `npm run` script it names is in
 *   package.json; every block id it cites exists and is in passages.md; every "quote" (cN-bM) is
 *   word for word in that block; the ATTRIBUTION.md quote is word for word; the license is what
 *   LICENSE and package.json say; the example player is the file, word for word; the PlayerView
 *   fields are players.ts's; the rungs' names, the four drawn rules and the numbers it gives are the
 *   code's; it says DRAFT, names no lesson address, and never paraphrases c4-b84 as a rule for each match.
 * - README.md links it; the routes serve these two files.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { COST, H, RULES, RUNGS, W, maxStepsOf } from '../src/lib/minpentai/play-game/game';
import { GONE_MS, PAUSE_MS, POINTS, SETUP_MS, TURN_MS } from '../src/lib/minpentai/play-server/match';
import { blockParagraphs, loadBook } from './build-minpentai-passages';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const AGENTS = 'docs/minpentai/agents.md';
const md = read(AGENTS);
const passagesMd = read('docs/minpentai/passages.md');
const book = loadBook();
const problems: string[] = [];
let checks = 0;
const ok = (cond: boolean, msg: string) => { checks++; if (!cond) problems.push(msg); };
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const plain = (s: string) => s.replace(/\*([^*]+)\*/g, '$1');
const blockOf = (id: string) => { const m = /^c(\d+)-b(\d+)$/.exec(id); return m ? book[+m[1]]?.find((b) => b.idx === +m[2]) : undefined; };

// passages.md
try {
  execFileSync('npx', ['tsx', 'scripts/build-minpentai-passages.ts', '--check'], { cwd: ROOT, stdio: 'pipe' });
  ok(true, '');
} catch (e) { ok(false, `passages.md: ${String((e as { stderr?: Buffer }).stderr ?? e).trim()}`); }
const entries = [...passagesMd.matchAll(/^\*\*(c\d+-b\d+)\*\* \(([^)]*)\)\n((?:> .*\n?)+)/gm)];
ok(entries.length === 152, `passages.md: ${entries.length} passages, not 152`);
for (const [, id, , body] of entries) {
  const b = blockOf(id);
  if (!b) { ok(false, `passages.md: ${id} is not in the book`); continue; }
  const lines = body.trim().split('\n').map((l) => l.replace(/^> /, ''));
  if (b.kind === 'figure') { ok(lines[0].startsWith('(figure'), `passages.md: ${id} is a figure`); continue; }
  const paras = blockParagraphs(b);
  ok(lines.length === paras.length && lines.every((l, i) => l === paras[i]), `passages.md: ${id} is not word for word`);
}
const spoiler = passagesMd.indexOf('## Spoilers: chapters 15');
ok(spoiler > 0 && passagesMd.indexOf('### Chapter 15') > spoiler, 'passages.md: no spoiler heading before chapter 15');
ok(![...passagesMd.slice(0, Math.max(0, spoiler)).matchAll(/^\*\*c(\d+)-b/gm)].some((m) => +m[1] >= 15), 'passages.md: a passage from chapter 15 on comes before the spoiler heading');
const listed = new Set(entries.map((e) => e[1]));
// Every block the rules documents cite is in chapters 2–14 (passages.md says so).
for (const f of ['docs/minpentai-rules.md', 'src/app/minpentai/rules/rules-html.ts']) {
  for (const m of read(f).matchAll(/c(\d+)-b\d+/g)) ok(+m[1] >= 2 && +m[1] <= 14, `${f} cites ${m[0]}, outside chapters 2–14, but passages.md says it cites nothing later`);
}

// agents.md: paths.
const paths = new Set<string>();
for (const m of md.matchAll(/(?:^|[\s`(/'"])((?:src|docs|scripts|content|public|supabase)\/[\w.\-/[\]]*[\w/\]])/g)) paths.add(m[1]);
for (const f of ['LICENSE', 'package.json', 'ATTRIBUTION.md']) if (md.includes(`\`${f}\``)) paths.add(f);
ok(paths.size > 20, `agents.md: only ${paths.size} paths found; the path check is not reading it`);
for (const p of paths) {
  const real = p.replace('chapter-N.json', 'chapter-1.json');
  const exists = [real, `${real}.ts`, `${real}.tsx`].some((q) => existsSync(path.join(ROOT, q)));
  ok(exists, `agents.md names ${p}, which does not exist`);
}
// npm scripts.
const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string>; license: string; engines?: { node?: string } };
const named = [...md.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
ok(named.length > 5, 'agents.md: no npm scripts found');
for (const s of named) ok(s in pkg.scripts, `agents.md names npm run ${s}, which is not in package.json`);
ok(!/test:minpentai-ladder/.test(md) || 'test:minpentai-ladder' in pkg.scripts, 'agents.md names test:minpentai-ladder, which is not on this branch');
// Block ids and quotes.
const ids = new Set<string>();
for (const m of md.matchAll(/c(\d+)-b(\d+)(?:–b(\d+))?/g)) {
  const a = +m[2], z = m[3] ? +m[3] : a;
  for (let i = a; i <= z; i++) ids.add(`c${m[1]}-b${i}`);
}
for (const id of ids) {
  ok(!!blockOf(id), `agents.md cites ${id}, which is not in the book`);
  ok(listed.has(id), `agents.md cites ${id}, which is not in passages.md`);
}
const quotes = [...md.matchAll(/"([^"\n]{12,})" \((c\d+-b\d+)\)/g)];
ok(quotes.length >= 3, `agents.md: ${quotes.length} quotes found`);
for (const [, q, id] of quotes) {
  const b = blockOf(id);
  ok(!!b && plain(blockParagraphs(b).join(' ')).includes(q), `agents.md: "${q}" is not word for word in ${id}`);
}
// License and ATTRIBUTION.
const licence = read('LICENSE');
// The code is AGPL-3.0 and the book and what's made from it GPL-3.0 (owner, 2026-10-22; LICENSING.md).
ok(/GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/.test(licence), 'LICENSE is not the AGPL v3');
ok(/GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(read('LICENSE-GPL-3.0')), 'LICENSE-GPL-3.0 is not the GPL v3');
ok(pkg.license === 'AGPL-3.0-only' && md.includes('"license": "AGPL-3.0-only"'), `package.json's license is ${pkg.license}`);
const attr = /`ATTRIBUTION\.md`, under Contributions: "([^"]+)"/.exec(md)?.[1];
ok(!!attr && norm(read('ATTRIBUTION.md')).includes(norm(attr)), 'agents.md: the ATTRIBUTION.md quote is not word for word');
ok(/## Contributions/.test(read('ATTRIBUTION.md')), 'ATTRIBUTION.md has no Contributions section');
ok(md.includes('https://github.com/We-Are-Lum/snowmoon') && read('ATTRIBUTION.md').includes('https://github.com/We-Are-Lum/snowmoon'), 'the repository address is not the one ATTRIBUTION.md gives');
ok(pkg.engines?.node === '>=22.11.0' && md.includes('Node 22.11 or later'), `package.json's engines say node ${pkg.engines?.node}`);
// The example and the interface.
const example = read('scripts/minpentai-players/first-player.ts');
const blocks = [...md.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);
ok(blocks.includes(example), 'agents.md: the example player is not scripts/minpentai-players/first-player.ts word for word');
const viewBlock = blocks.find((b) => b.includes('interface PlayerView')) ?? '';
const fields = (s: string) => [...s.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]).sort();
const players = read('src/lib/minpentai/play-game/players.ts');
const realView = /export interface PlayerView \{([\s\S]*?)\n\}/.exec(players)?.[1] ?? '';
const docView = /interface PlayerView \{([\s\S]*?)\n\}/.exec(viewBlock)?.[1] ?? '';
ok(fields(realView).length > 5 && JSON.stringify(fields(realView)) === JSON.stringify(fields(docView)), `agents.md: PlayerView's fields are ${fields(docView)}, players.ts's are ${fields(realView)}`);
ok(/export type Player = \(view: PlayerView\) => Placement\[\];/.test(players) && viewBlock.includes('type Player = (view: PlayerView) => Placement[];'), 'agents.md: the Player type is not players.ts\'s');
ok(viewBlock.includes("interface Placement { t: 'g' | 's' | 't'; o: 'C' | 'A'; x: number; y: number; dx: number; dy: number }") && /export interface Placement<T extends AnyPiece = Piece> \{ t: T; o: Side; x: number; y: number; dx: number; dy: number \}/.test(read('src/lib/minpentai/versions/engine.ts')), 'agents.md: Placement is not the engine\'s (versions/engine.ts, Play\'s pieces by default; game.ts re-exports it)');
// The code's names and numbers.
const rungNames = RUNGS.slice(1).map((r) => r!.n);
ok(md.includes(rungNames.join(', ')) && rungNames.length === 5, `agents.md: the rungs are ${rungNames.join(', ')}`);
for (const t of Object.values(RULES)) ok(md.includes(`"${t}"`), `agents.md does not quote the drawn rule "${t}"`);
ok(W === 15 && H === 10 && md.includes('15 × 10'), 'the board is not 15 × 10');
ok(maxStepsOf(2) === 120 && md.includes('step 120'), 'the match does not stop at step 120 (Play today, ruleset 2)');
ok(POINTS === 8 && COST.s === 1 && COST.t === 4 && md.includes('8 points a turn: glider 4, square 1, tower 4'), 'the points or costs differ');
ok(SETUP_MS === 90_000 && TURN_MS === 45_000 && md.includes('90 seconds for setup and 45 for later turns'), 'the one-on-one clocks differ');
ok(PAUSE_MS === 15_000 && GONE_MS === 60_000 && md.includes('15 seconds pauses the match; 60 seconds more'), 'the pause times differ');
// Wording.
ok(/^> DRAFT\./m.test(md), 'agents.md does not say DRAFT');
ok(!/lesson=/.test(md), 'agents.md names a lesson address');
const CHANGES = /\b(?:the\s+)?rules?\s+(?:change|changes|changed|changing)\s+(?:(?:with|for|in)\s+)?(?:every|each)\s+(?:match|game)\b|\b(?:a\s+)?(?:new|different)\s+rules?\s+(?:every|each)\s+(?:match|game)\b/i;
ok(!CHANGES.test(md.replace(/"[^"\n]*"/g, ' ')), 'agents.md paraphrases c4-b84 as a rule for each match; quote the book instead');
ok(/not affiliated/.test(md), 'agents.md does not say the project is not affiliated');
// README and routes.
ok(read('README.md').includes('docs/minpentai/agents.md') && read('README.md').includes('https://snowmoon.party/minpentai/agents.md'), 'README.md does not link agents.md');
ok(read('src/app/minpentai/agents.md/route.ts').includes(`'${AGENTS}'`), 'the /minpentai/agents.md route does not serve docs/minpentai/agents.md');
ok(read('src/app/minpentai/passages.md/route.ts').includes("'docs/minpentai/passages.md'"), 'the /minpentai/passages.md route does not serve docs/minpentai/passages.md');
ok(read('src/lib/minpentai/markdown-route.ts').includes("'text/markdown; charset=utf-8'"), 'the routes do not say text/markdown');

if (problems.length) {
  console.error(`minpentai agents.md: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`minpentai agents.md: ${checks} checks passed (${paths.size} paths, ${named.length} npm scripts, ${ids.size} block ids, ${quotes.length} quotes, 152 passages)`);
