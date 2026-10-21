/**
 * Onchain Minpentai v1 (spike): the ruleset manifest. One JSON document pins everything a recorded
 * match means: the engine's commit and the hash of each file it runs, the board, the numbers, every
 * rule (from the book, with its block, or invented for this edition), the four drawn rules, and
 * each computer player's code. Its keccak256 (of the canonical JSON: keys sorted, no spaces) is
 * the ruleset ID a match records. Changing any rule makes a new ruleset with a new ID; a match
 * recorded under the old ID still replays under the old one.
 *
 * Built by scripts/build-minpentai-ruleset.ts into docs/minpentai/rulesets/; checked by
 * scripts/test-minpentai-onchain-ruleset.ts.
 */
import { keccak256, toBytes } from 'viem';

/** Canonical JSON: object keys sorted, no whitespace. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}
export const rulesetId = (manifest: unknown) => keccak256(toBytes(canonical(manifest)));
export const hashText = (text: string) => keccak256(toBytes(text));

/** Where a rule comes from: the book (with the blocks it rests on) or this edition. */
/**
 * Where a rule comes from. `book`: what the book says, the blocks it rests on, and whether the book
 * states it in so many words ('stated') or only implies it ('implied'). `edition`: the details this
 * edition made up. A rule has one or both; a rule with no `book` part is invented outright.
 */
export interface BookPart { says: string; blocks: string[]; basis: 'stated' | 'implied' }
export interface Rule { id: string; text: string; book?: BookPart; edition?: string }

/** Where a replay starts: everything it reaches from here is pinned (importClosure). */
export const REPLAY_ENTRY = 'src/lib/minpentai/onchain/replay.ts';

/**
 * Every source file `entry` reaches through import, export-from, side-effect import, dynamic
 * import() and require(), type-only imports included, and every npm package it reaches (by name;
 * the builder pins each one's exact version from package-lock.json). `read` returns a file's text,
 * or null if there is no such file. Paths are repository-relative; '~/' is src/.
 */
export function importClosure(entry: string, read: (path: string) => string | null): { files: Record<string, string>; packages: string[]; builtins: string[] } {
  const files: Record<string, string> = {}, packages = new Set<string>(), builtins = new Set<string>();
  const norm = (p: string) => { const out: string[] = []; for (const part of p.split('/')) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); } return out.join('/'); };
  const resolve = (from: string, spec: string): string => {
    const base = spec.startsWith('~/') ? 'src/' + spec.slice(2) : norm(from.split('/').slice(0, -1).join('/') + '/' + spec);
    for (const c of [base, base + '.ts', base + '.tsx', base + '.js', base + '/index.ts', base + '/index.tsx']) if (/\.(ts|tsx|js|mjs|json)$/.test(c) && read(c) !== null) return c;
    throw new Error(`${from}: cannot resolve '${spec}'`);
  };
  const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!;
    if (f in files) continue;
    const text = read(f);
    if (text === null) throw new Error(`no file ${f}`);
    files[f] = text;
    const specs = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((x) => x[1]);
    for (const spec of specs) {
      if (spec.startsWith('.') || spec.startsWith('~/')) todo.push(resolve(f, spec));
      else if (spec.startsWith('node:')) builtins.add(spec);
      else packages.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
    }
  }
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(files).sort()) sorted[k] = files[k];
  return { files: sorted, packages: [...packages].sort(), builtins: [...builtins].sort() };
}

const book = (says: string, blocks: string[], basis: 'stated' | 'implied' = 'stated'): BookPart => ({ says, blocks, basis });

/**
 * Play's rules, as game.ts, controller.ts and play-server/match.ts run them, marked as the rules
 * page (draft 1) and docs/minpentai/agents.md mark them. Block ids are chapter-block (c4-b84).
 */
export const RULES_V1: Rule[] = [
  { id: 'board-size', text: 'The board is 15 x 10 squares.', edition: 'The whole rule.' },
  { id: 'board-edges', text: 'The board has edges and corners. A glider that would leave the board turns back on that side instead, and stays put for that step.',
    book: book('The field has corners (and so edges).', ['c4-b113', 'c7-b81'], 'implied'), edition: 'What a glider does at the edge.' },
  { id: 'starts', text: 'Each side starts with 2 towers (Cyan at (1, 2) and (1, 7), Amber at (13, 2) and (13, 7)) and there are six rocks, all mirrored.', edition: 'The whole rule. (Each player starting in a corner is in the book, c4-b94; these starts are not in corners.)' },
  { id: 'tower', text: 'A tower is your score, your sight, and where you may place.',
    book: book('Each player has a symbol; a copy of it anywhere on the board lets them see around it.', ['c4-b93']), edition: 'Symbols are drawn as towers, one square each; they are also the score.' },
  { id: 'glider', text: 'A glider moves one square a step in a straight line, up, down, left or right (diagonally too only under the "diag" rule), and never stops on its own.',
    book: book('Gliders exist and fly across the field.', ['c4-b84', 'c4-b108']), edition: 'One square a step, in a straight line, four directions (eight under "diag"), never stopping on its own.' },
  { id: 'square', text: 'A square blocks a glider: the first hit cracks it and turns the glider straight back; the second breaks the square and the glider. Any glider cracks any square, its own side\'s too.',
    book: book('Walls can reflect gliders, and a wall can be destroyed.', ['c2-b12', 'c4-b9']), edition: 'Walls are single squares; two hits to break; the first hit reflects; any side\'s glider cracks any square.' },
  { id: 'rock', text: 'A rock is fixed, turns every glider straight back, and never breaks.',
    book: book('There are rocks on the field.', ['c4-b84']), edition: 'Rocks are fixed, bounce every glider straight back, never break, and never make gliders (in the book, gliders hitting rocks make more gliders, c4-b108; not here).' },
  { id: 'step-together', text: 'Every glider moves at the same moment.', edition: 'The whole rule.' },
  { id: 'glider-collide', text: 'Two gliders of different sides break each other if they head for the same square, swap squares, or cross. A side\'s own gliders pass through each other.', edition: 'The whole rule.' },
  { id: 'tower-hit', text: 'A glider reaching an opponent\'s tower destroys it and breaks. Your own tower turns it straight back.', edition: 'The whole rule. (In the book a stray glider can wreck its own side, c4-b109; left out here.)' },
  { id: 'no-debris', text: 'Broken pieces leave nothing behind.', edition: 'The whole rule. (The book\'s boards fill with debris, c4-b140.)' },
  { id: 'turns', text: 'A setup turn at step 0, then a turn to act every 12 steps; between turns the match runs on its own.',
    book: book('Play begins with an initiation phase in which players put down squares, then runs on its own, with intervention turns from time to time.', ['c4-b94', 'c4-b110', 'c14-b45']), edition: 'A setup turn at step 0 and one every 12 steps (in the book the first comes after about a thousand turns).' },
  { id: 'points', text: '8 points a turn: glider 4, square 1, tower 4. Unspent points are lost.', edition: 'The whole rule.' },
  { id: 'placing', text: 'Place on any empty square within 3 squares, counting diagonals, of a tower you had when the turn began.',
    book: book('In an intervention turn, players put down more squares near any copy of their symbols.', ['c4-b110']), edition: 'Within 3 squares counting diagonals, of towers held when the turn began; gliders, squares or towers.' },
  { id: 'simultaneous', text: 'Both sides place at the same time without seeing each other\'s choices; two pieces placed on one square cancel each other.', edition: 'The whole rule.' },
  { id: 'sight', text: 'You see every square within 3 of one of your towers; the rest is dark.',
    book: book('A copy of your symbol lets you see everything within thirty squares; the field starts dark.', ['c4-b93']), edition: '3 squares, not thirty (2 under "sight2").' },
  { id: 'last-seen', text: 'Rocks are shown everywhere; an opponent\'s tower you cannot see is shown where you last saw it.', edition: 'The whole rule.' },
  { id: 'end-towers', text: 'A side with no towers left loses; both at the same step is a draw.',
    book: book('A player whose symbols have all been eliminated is out.', ['c4-b136', 'c4-b138']), edition: 'With two players, out means lost; both at once is a draw.' },
  { id: 'end-time', text: 'At step 96 the match stops: most towers wins, equal is a draw.', edition: 'The whole rule.' },
  { id: 'resign', text: 'You may resign; it counts as a loss.',
    book: book('A player may resign.', ['c4-b141', 'c10-b164']), edition: 'Resigning counts as a loss.' },
  { id: 'new-rule', text: 'One of four new rules is drawn from the seed at the start of every match, and both players see it.',
    book: book('Every game has some kind of new rule.', ['c4-b84']), edition: 'One of four rules, drawn from the seed; the four rules are invented.' },
  { id: 'computer-sight', text: 'The computer players see only what their towers light (Play\'s; Learn\'s practice bot is not part of this ruleset).', edition: 'The whole rule.' },
  { id: 'seed', text: 'A match\'s seed is a whole number from 0 to 999,999. Its first random number draws the new rule; the computer player takes the rest, in order.', edition: 'The whole rule.' },
];

export const DRAWN_RULES_V1: Rule[] = [
  { id: 'diag', text: 'Gliders may also fly diagonally.', edition: 'The whole rule.' },
  { id: 'cost3', text: 'Gliders cost 3 points.', edition: 'The whole rule.' },
  { id: 'sight2', text: 'You see only 2 squares around your towers.', edition: 'The whole rule.' },
  { id: 'every8', text: 'Turns to act come every 8 steps.', edition: 'The whole rule.' },
];

export const PLAYERS_V1 = [
  { level: 0, name: 'Practice' },
  { level: 1, name: 'Rival' },
  { level: 2, name: 'Blocker' },
  { level: 3, name: 'Builder' },
  { level: 4, name: 'Opportunist' },
  { level: 5, name: 'Planner' },
];

export interface ManifestInput {
  /** The full 40-character commit the closure is read from. */
  commit: string;
  /** replay.ts's import closure at that commit: path → file text. */
  files: Record<string, string>;
  /** Exact versions (package-lock.json at that commit) of every npm package in the closure. */
  packages: Record<string, string>;
}

/** The hash of the whole closure: every file's hash and every package's version. */
export const closureHash = (files: Record<string, string>, packages: Record<string, string>) =>
  keccak256(toBytes(canonical({ files: Object.fromEntries(Object.entries(files).map(([f, t]) => [f, hashText(t)])), packages })));

/** The solo v1 manifest for the engine at `commit`. */
export function soloManifestV1({ commit, files, packages }: ManifestInput) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`pin a full 40-character commit, not ${commit}`);
  const closure = closureHash(files, packages);
  return {
    format: 'snowmoon.minpentai.ruleset/1',
    name: 'Minpentai Play, solo against the computer, v1',
    edition: 'snowmoon.party: an independent edition of Vitalik Buterin\'s Snowmoon, not affiliated with or endorsed by the author. Rules marked invented were made up for this edition.',
    license: 'GPL-3.0-only',
    engine: {
      repository: 'https://github.com/We-Are-Lum/snowmoon',
      commit,
      entry: REPLAY_ENTRY,
      replay: 'replaySolo',
      // replay.ts's whole import closure at that commit (type-only imports included), and the exact
      // version of every npm package in it; closureHash covers both.
      files: Object.fromEntries(Object.entries(files).map(([f, t]) => [f, hashText(t)])),
      packages,
      closureHash: closure,
    },
    board: {
      width: 15, height: 10, maxSteps: 96,
      rocks: [[6, 0], [9, 3], [7, 4], [7, 5], [5, 6], [8, 9]],
      towers: { C: [[1, 2], [1, 7]], A: [[13, 2], [13, 7]] },
    },
    settings: { points: 8, cost: { glider: 4, square: 1, tower: 4 }, sight: 3, every: 12, squareHits: 2, seeds: [0, 999_999] },
    rules: RULES_V1,
    drawnRules: DRAWN_RULES_V1,
    computerPlayers: PLAYERS_V1.map((p) => ({
      ...p,
      code: { file: 'src/lib/minpentai/play-game/game.ts', function: 'botPlan', level: p.level },
      // One function (botPlan) plays every level, inside the closure; a player is the closure and its level.
      codeHash: keccak256(toBytes(`${closure}:level:${p.level}`)),
      edition: p.level ? 'Behaviours are invented. (The book has bots too, c7-b14.)' : 'Practice: the same code at its simplest level.',
    })),
    sides: { person: 'C', computer: 'A' },
  };
}
export type SoloManifestV1 = ReturnType<typeof soloManifestV1>;
