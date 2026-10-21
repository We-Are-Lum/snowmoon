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
export type Source = { book: string[]; note?: string } | { invented: true; note?: string };
export interface Rule { id: string; text: string; source: Source }

/** The files a replay runs: the engine, the placement check, the replay itself. */
export const ENGINE_FILES = [
  'src/lib/minpentai/play-game/game.ts',
  'src/lib/minpentai/play-server/match.ts',
  'src/lib/minpentai/onchain/replay.ts',
] as const;

const book = (blocks: string[], note?: string): Source => ({ book: blocks, note });
const invented = (note?: string): Source => ({ invented: true, note });

/**
 * Play's rules, as game.ts, controller.ts and play-server/match.ts run them, marked as the rules
 * page (draft 1) and docs/minpentai/agents.md mark them. Block ids are chapter-block (c4-b84).
 */
export const RULES_V1: Rule[] = [
  { id: 'board-size', text: 'The board is 15 × 10 squares.', source: invented() },
  { id: 'board-edges', text: 'The board has edges and corners.', source: book(['c4-b113', 'c7-b81']) },
  { id: 'edge-bounce', text: 'A glider that would leave the board turns back on that side instead, and stays put for that step.', source: invented() },
  { id: 'starts', text: 'Each side starts with 2 towers (Cyan at (1, 2) and (1, 7), Amber at (13, 2) and (13, 7)) and there are six rocks, all mirrored.', source: invented('Starting in your own corner is from the book (c4-b94).') },
  { id: 'tower', text: 'A tower is your score, your sight, and where you may place.', source: book(['c4-b93'], 'In the book they are "symbols"; the tower shape is invented.') },
  { id: 'glider', text: 'A glider moves one square a step in a straight line, up, down, left or right (diagonally too only under the "diag" rule), and never stops on its own.', source: book(['c4-b84'], 'Their speed is invented.') },
  { id: 'square', text: 'A square blocks a glider: the first hit cracks it and turns the glider straight back; the second breaks the square and the glider. Any glider cracks any square, its own side\'s too.', source: book(['c2-b12', 'c4-b9'], 'Two hits is invented.') },
  { id: 'rock', text: 'A rock is fixed, turns every glider straight back, and never breaks.', source: book(['c4-b108'], 'Bouncing only is invented; in the book gliders hitting rocks can make more gliders.') },
  { id: 'step-together', text: 'Every glider moves at the same moment.', source: invented() },
  { id: 'glider-collide', text: 'Two gliders of different sides break each other if they head for the same square, swap squares, or cross. A side\'s own gliders pass through each other.', source: invented() },
  { id: 'tower-hit', text: 'A glider reaching an opponent\'s tower destroys it and breaks. Your own tower turns it straight back.', source: invented('In the book a stray glider can wreck its own side (c4-b109); left out here.') },
  { id: 'no-debris', text: 'Broken pieces leave nothing behind.', source: invented('The book\'s boards fill with debris (c4-b140).') },
  { id: 'turns', text: 'A setup turn at step 0, then a turn to act every 12 steps; between turns the match runs on its own.', source: book(['c4-b110', 'c14-b45'], '12 is invented.') },
  { id: 'points', text: '8 points a turn: glider 4, square 1, tower 4. Unspent points are lost.', source: invented() },
  { id: 'placing', text: 'Place on any empty square within 3 squares, counting diagonals, of a tower you had when the turn began.', source: book(['c4-b110'], 'The distance is invented.') },
  { id: 'simultaneous', text: 'Both sides place at the same time without seeing each other\'s choices; two pieces placed on one square cancel each other.', source: invented() },
  { id: 'sight', text: 'You see every square within 3 of one of your towers; the rest is dark.', source: book(['c4-b93'], '3 is invented.') },
  { id: 'last-seen', text: 'Rocks are shown everywhere; an opponent\'s tower you cannot see is shown where you last saw it.', source: invented() },
  { id: 'end-towers', text: 'A side with no towers left loses; both at the same step is a draw.', source: book(['c4-b136', 'c4-b137', 'c4-b138']) },
  { id: 'end-time', text: 'At step 96 the match stops: most towers wins, equal is a draw.', source: invented() },
  { id: 'resign', text: 'You may resign; it counts as a loss.', source: book(['c4-b141', 'c10-b164']) },
  { id: 'new-rule', text: 'One of four new rules is drawn from the seed at the start of every match, and both players see it.', source: book(['c4-b84'], 'The four rules are invented.') },
  { id: 'computer-sight', text: 'The computer players see only what their towers light (Play\'s; Learn\'s practice bot is not part of this ruleset).', source: invented() },
  { id: 'seed', text: 'A match\'s seed is a whole number from 0 to 999,999. Its first random number draws the new rule; the computer player takes the rest, in order.', source: invented() },
];

export const DRAWN_RULES_V1 = [
  { id: 'diag', text: 'Gliders may also fly diagonally.', source: invented() },
  { id: 'cost3', text: 'Gliders cost 3 points.', source: invented() },
  { id: 'sight2', text: 'You see only 2 squares around your towers.', source: invented() },
  { id: 'every8', text: 'Turns to act come every 8 steps.', source: invented() },
];

export const PLAYERS_V1 = [
  { level: 0, name: 'Practice' },
  { level: 1, name: 'Rival' },
  { level: 2, name: 'Blocker' },
  { level: 3, name: 'Builder' },
  { level: 4, name: 'Opportunist' },
  { level: 5, name: 'Planner' },
];

/** The text of `export function name(…) {…}` in a source file (by brace matching). */
export function functionSource(src: string, name: string): string {
  const at = src.indexOf(`export function ${name}(`);
  if (at < 0) throw new Error(`no function ${name}`);
  let i = src.indexOf('{', src.indexOf(')', at)), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced function ${name}`);
}

export interface ManifestInput {
  commit: string;
  files: Record<string, string>; // path → file text at that commit
}

/** The solo v1 manifest for the engine at `commit`. */
export function soloManifestV1({ commit, files }: ManifestInput) {
  const game = files['src/lib/minpentai/play-game/game.ts'];
  const botPlanHash = hashText(functionSource(game, 'botPlan'));
  return {
    format: 'snowmoon.minpentai.ruleset/1',
    name: 'Minpentai Play, solo against the computer, v1',
    edition: 'snowmoon.party: an independent edition of Vitalik Buterin\'s Snowmoon, not affiliated with or endorsed by the author. Rules marked invented were made up for this edition.',
    license: 'GPL-3.0-only',
    engine: {
      repository: 'https://github.com/We-Are-Lum/snowmoon',
      commit,
      files: Object.fromEntries(ENGINE_FILES.map((f) => [f, hashText(files[f])])),
      replay: 'replaySolo in src/lib/minpentai/onchain/replay.ts',
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
      // One function plays every level; a player's hash is that function's source with its level.
      codeHash: keccak256(toBytes(`${botPlanHash}:level:${p.level}`)),
      source: invented(p.level ? 'Behaviours are invented; the book has bots too (c7-b14).' : 'Practice: the same code at its simplest level.'),
    })),
    sides: { person: 'C', computer: 'A' },
  };
}
export type SoloManifestV1 = ReturnType<typeof soloManifestV1>;
