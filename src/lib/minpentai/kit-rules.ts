/**
 * The Minpentai build-on kit's rules table (step 2 of the kit, owner's go 2026-10-20). DRAFT: written by
 * the coding agent (Claude, a closed model) from the book's passages and from reading the code; every
 * word here waits for the owner to rewrite or approve.
 *
 * Each rule is either FROM THE BOOK (cites blocks; each quote is word for word in its block, checked by
 * scripts/build-minpentai-kit.ts and check:principles P8g) or INVENTED for this edition (names where in
 * the code it lives; each `find` must appear in its file). `site` says whether the site follows it today:
 * - Play: practice, the computer ladder, free play and one-on-one (the one engine, src/lib/minpentai/versions/engine.ts,
 *   with Play's numbers as its base settings in versions/schema.ts; play-game/game.ts adapts it for older callers);
 * - Learn: the lessons (src/lib/minpentai/learn-game/, Design's v3, which the rules page says Play replaces);
 * - the book's rule page, /minpentai/rule (src/lib/minpentai/engine.ts).
 *
 * The book's reading behind the "from the book" rows is docs/minpentai-rules.md ("stated" and "implied"
 * are its labels). Generated from this file: public/minpentai/rules.json, docs/minpentai/rules.md.
 * Never paraphrase c4-b84 as a rule for each match: quote it (P8d, P8f).
 */

export type Verdict = 'yes' | 'partly' | 'no';
export type Area = 'board' | 'pieces' | 'turns' | 'sight' | 'ending' | 'sandbox' | 'match-rules' | 'computer';
/** A block of the book, and words quoted from it (word for word). A figure has no words to quote. */
export interface Cite { block: string; quote?: string }
/** A place in the code: `find` must appear in `file`. */
export interface CodeRef { file: string; find: string }
export interface KitRule {
  id: string;
  area: Area;
  /** The rule, in a sentence. */
  rule: string;
  source: 'book' | 'invented';
  /** From the book: said outright (stated), or following from what the text describes (implied). */
  how?: 'stated' | 'implied';
  /** From the book: the blocks it rests on. Invented: optional, the book's words it departs from or stands in for. */
  cites?: Cite[];
  /** Invented: where it is in the code (required). From the book: where the site does it, if it does. */
  code?: CodeRef[];
  site: Verdict;
  /** Which part of the site follows it, and how. */
  siteNote: string;
}

export const AREAS: Record<Area, string> = {
  board: 'The board and how it changes',
  pieces: 'Pieces',
  turns: 'Turns to act',
  sight: 'Sight',
  ending: 'How a match ends',
  sandbox: 'The sandbox',
  'match-rules': "Each match's new rule",
  computer: 'Computer players',
};

const GAME = 'src/lib/minpentai/play-game/game.ts';
const CTRL = 'src/lib/minpentai/play-game/controller.ts';
const LIVE = 'src/lib/minpentai/play-server/match.ts';
const ENGINE = 'src/lib/minpentai/engine.ts';
/** Play's rules run on the one engine (versions/engine.ts); Play's numbers are its base settings (versions/schema.ts). */
const VENG = 'src/lib/minpentai/versions/engine.ts';
const SCHEMA = 'src/lib/minpentai/versions/schema.ts';

export const KIT_RULES: KitRule[] = [
  /* ---------------- the board and how it changes ---------------- */
  {
    id: 'square-grid', area: 'board', source: 'book', how: 'implied',
    rule: 'The game is played on a grid of squares; a hex grid is announced as a rule change.',
    cites: [{ block: 'c12-b147', quote: 'Today, Minpentai will be played on a hex grid.' }, { block: 'c4-b94', quote: 'put down squares' }, { block: 'c14-b36', quote: 'intervene in only a few cells' }],
    code: [{ file: SCHEMA, find: "width: { text: 'Board width in squares', min: 9, max: 25, base: 15," }, { file: ENGINE, find: 'export const WIDTH = 48;' }],
    site: 'yes', siteNote: 'Every board on the site is a grid of squares.',
  },
  {
    id: 'cell-rule', area: 'board', source: 'book', how: 'stated',
    rule: 'The board is cells that change by a rule; one variant is "rotate one eighty if three", animated in the figure c4-b5.',
    cites: [{ block: 'c4-b7', quote: "We were playing with the 'rotate one eighty if three' rule." }, { block: 'c4-b5' }],
    code: [{ file: ENGINE, find: 'export function blockRule' }],
    site: 'partly', siteNote: "The book's rule page runs the rule recovered from c4-b5. Play and Learn use pieces instead of cells (invented); Learn's Under the hood shows the cell rule.",
  },
  {
    id: 'reversible', area: 'board', source: 'book', how: 'stated',
    rule: 'The rules are time-reversible: anything that can be created can be destroyed.',
    cites: [{ block: 'c4-b9', quote: 'Well, remember, the rules are time-reversible.' }, { block: 'c4-b13', quote: 'Anything that can be created can be destroyed.' }],
    code: [{ file: ENGINE, find: 'export function stepBack' }],
    site: 'partly', siteNote: "The book's rule page steps back exactly. Play is not reversible: broken pieces are gone, and rocks never break.",
  },
  {
    id: 'no-wrapper', area: 'board', source: 'book', how: 'stated',
    rule: 'The rule loses no information (unlike a hash, it has no truncate-and-xor step).',
    cites: [{ block: 'c12-b163', quote: 'But unlike the hash function, here there was no truncate-and-xor wrapper at the end.' }],
    code: [{ file: ENGINE, find: 'export function blockRule' }],
    site: 'partly', siteNote: "The book's rule page: each step is one-to-one. Play: no.",
  },
  {
    id: 'mass-conserved', area: 'board', source: 'book', how: 'stated',
    rule: 'Live cells are conserved; only the shrines of one match break this.',
    cites: [{ block: 'c14-b35', quote: 'The shrines are the only objects that violate mass conservation' }],
    code: [{ file: ENGINE, find: 'export function liveCount' }],
    site: 'partly', siteNote: "The book's rule page conserves live cells. Play adds pieces on turns to act and removes broken ones.",
  },
  {
    id: 'edges', area: 'board', source: 'book', how: 'stated',
    rule: 'The board has edges and corners.',
    cites: [{ block: 'c4-b113', quote: 'along the edge' }, { block: 'c7-b81', quote: 'the southeast corner' }],
    code: [{ file: GAME, find: 'export const inb' }],
    site: 'yes', siteNote: "Play's board has edges and corners. (The book's rule page wraps; see the invented rows.)",
  },
  {
    id: 'turn-is-update', area: 'board', source: 'book', how: 'implied',
    rule: 'One turn is one update of the whole board.',
    cites: [{ block: 'c4-b126', quote: 'Sixty turns until the next intervention turn.' }, { block: 'c14-b94', quote: 'Ten thousand two hundred turns into the game' }],
    code: [{ file: VENG, find: 'function step(w: World, s: Settings, kills?: Kills): World {' }],
    site: 'yes', siteNote: 'Play counts steps; each step moves every glider once.',
  },
  {
    id: 'hex-rule', area: 'board', source: 'book', how: 'stated',
    rule: 'Hex grid: each step the board splits into triangles; a triangle with one filled hex rotates clockwise, with two counterclockwise; the tiling shifts after each step.',
    cites: [
      { block: 'c12-b169', quote: 'During each step, the game board split up into triangles, and the hexagons rotated inside each triangle - clockwise if it had one hex filled, counterclockwise if it had two hexes filled.' },
      { block: 'c12-b170', quote: 'after each time step, the split into triangles shifted' },
    ],
    site: 'no', siteNote: 'No hex board on the site.',
  },
  {
    id: 'hex-gliders', area: 'board', source: 'book', how: 'stated',
    rule: 'On the hex grid the fastest gliders move east, and no vertical glider was found.',
    cites: [{ block: 'c12-b152', quote: 'the gliders that moved the fastest moved ... directly east' }, { block: 'c12-b192', quote: 'Neither player had managed to figure out any gliders that move vertically' }],
    site: 'no', siteNote: 'No hex board on the site.',
  },
  {
    id: 'debris', area: 'board', source: 'book', how: 'stated',
    rule: 'Collisions leave debris, and the board grows more disordered.',
    cites: [{ block: 'c4-b140', quote: 'most of the game field had become a high-entropy wasteland' }, { block: 'c14-b79', quote: 'More and more debris.' }],
    site: 'no', siteNote: "Play: broken pieces leave nothing. Learn's broadcast draws debris that gliders fly through.",
  },
  {
    id: 'play-board-size', area: 'board', source: 'invented',
    rule: 'The board is 15 × 10 squares.',
    code: [{ file: SCHEMA, find: "width: { text: 'Board width in squares', min: 9, max: 25, base: 15," }, { file: SCHEMA, find: "height: { text: 'Board height in squares', min: 6, max: 16, base: 10," }],
    site: 'yes', siteNote: 'Play and Learn.',
  },
  {
    id: 'play-start', area: 'board', source: 'invented',
    rule: 'Each player starts with 2 towers near their own side; the six rocks and the towers are mirrored, so both start even.',
    cites: [{ block: 'c4-b94', quote: 'He drew a few copies of his symbol in the bottom right corner of the board, where he was allowed to put down squares during the initiation phase.' }],
    code: [{ file: VENG, find: 'const PLAY_ROCKS: [number, number][] = [[6, 0], [9, 3], [7, 4], [7, 5], [5, 6], [8, 9]];' }, { file: VENG, find: 'function world(s: Settings, blank?: boolean): World {' }],
    site: 'yes', siteNote: 'Play. In the book, players draw their own symbols in a home corner at setup.',
  },
  {
    id: 'play-edges-bounce', area: 'board', source: 'invented',
    rule: 'A glider that would leave the board turns back on that side and waits a step.',
    code: [{ file: VENG, find: 'if (bx) g.dx = -g.dx;' }],
    site: 'yes', siteNote: 'Play and Learn.',
  },
  {
    id: 'play-no-debris', area: 'board', source: 'invented',
    rule: 'Broken pieces leave nothing behind.',
    cites: [{ block: 'c4-b140', quote: 'a high-entropy wasteland' }],
    code: [{ file: VENG, find: 'w.gl = gl.filter((g) => !g.dead);' }],
    site: 'yes', siteNote: 'Play and Learn.',
  },
  {
    id: 'rule-page-board', area: 'board', source: 'invented',
    rule: "The book's rule page runs on a 48 × 32 board that wraps on all edges; a block holding a rock is left unchanged; the board beyond the figure's right edge is a reconstruction that replays all 120 frames.",
    code: [{ file: ENGINE, find: 'Board size 48 × 32, wrapping on all edges.' }, { file: 'src/lib/minpentai/presets.ts', find: 'export const C4B5_HIDDEN_SIDE' }],
    site: 'yes', siteNote: "The book's rule page.",
  },

  /* ---------------- pieces ---------------- */
  {
    id: 'moving-structures', area: 'pieces', source: 'book', how: 'stated',
    rule: 'Moving structures: gliders, and spaceships (large, slow gliders); a "moving wall" is a large glider at half speed.',
    cites: [{ block: 'c4-b108', quote: 'Spaceships flew out, acting as large slow-moving gliders' }, { block: 'c4-b111', quote: 'a sort of large glider that flew half as fast' }],
    code: [{ file: VENG, find: 'export interface Glider' }],
    site: 'partly', siteNote: 'Play has gliders only; no spaceships or moving walls.',
  },
  {
    id: 'static-structures', area: 'pieces', source: 'book', how: 'stated',
    rule: 'Static structures: walls, rocks and glider factories.',
    cites: [{ block: 'c4-b84', quote: 'Walls, gliders, rocks, techniques for extracting usable negentropy from rocks, sideways attacks.' }, { block: 'c14-b38', quote: 'an eternal glider factory' }],
    code: [{ file: VENG, find: 'export interface Square' }],
    site: 'partly', siteNote: 'Play has squares (walls) and rocks; no factories.',
  },
  {
    id: 'rocks-resource', area: 'pieces', source: 'book', how: 'stated',
    rule: 'Rock formations are a resource: gliders hitting them make more gliders and build structures.',
    cites: [{ block: 'c4-b108', quote: 'Gliders flew out, interacted with rock formations, and created more gliders.' }, { block: 'c7-b107', quote: 'constructed in real time out of nearby rock formations by gliders' }],
    site: 'no', siteNote: 'Play: rocks only send gliders back. The rules page marks this OPEN.',
  },
  {
    id: 'no-owner', area: 'pieces', source: 'book', how: 'implied',
    rule: "Cells have no owner: a stray glider can wreck its own side's structures.",
    cites: [{ block: 'c4-b109', quote: "A few stray gliders from Bai accidentally flew into Zei's territory, and wrecked one of his factories." }, { block: 'c4-b109', quote: 'began to fly back toward his own base' }],
    code: [{ file: VENG, find: 'if (q.hp > 1) { q.hp--; bounce(g); }' }],
    site: 'partly', siteNote: "Play: any glider cracks any square, its own side's included; but a glider bounces off its own side's tower, and a side's gliders pass through each other.",
  },
  {
    id: 'play-tower', area: 'pieces', source: 'invented',
    rule: "A symbol is drawn as a tower: one square that is a player's score, sight and place to build. Its shape is invented.",
    cites: [{ block: 'c4-b93', quote: 'a pattern of dots' }],
    code: [{ file: VENG, find: 'tw: Record<number, Side>;' }],
    site: 'yes', siteNote: 'Play and Learn.',
  },
  {
    id: 'play-glider', area: 'pieces', source: 'invented',
    rule: 'A glider moves one square per step in a straight line, up, down, left or right (diagonals only under one drawn rule), and never stops.',
    code: [{ file: GAME, find: 'export const D4' }],
    site: 'yes', siteNote: 'Play and Learn.',
  },
  {
    id: 'play-square', area: 'pieces', source: 'invented',
    rule: 'A square sends a glider back; the first hit cracks it, the second breaks it and the glider.',
    cites: [{ block: 'c4-b9', quote: 'any wall that can be created in some way can be destroyed in some way' }],
    code: [{ file: VENG, find: "else if (p.t === 's') w.sq[k] = { o: p.o, hp: s.squareHits };" }],
    site: 'yes', siteNote: 'Play and Learn.',
  },
  {
    id: 'play-rock', area: 'pieces', source: 'invented',
    rule: 'A rock is fixed, sends every glider straight back, and never breaks.',
    code: [{ file: VENG, find: 'const bounce = (g: Glider) => { g.dx = -g.dx; g.dy = -g.dy; };' }],
    site: 'yes', siteNote: 'Play and Learn. In the book, rocks are a resource (see above).',
  },
  {
    id: 'play-collisions', area: 'pieces', source: 'invented',
    rule: "All gliders move at once. Two gliders of different players break each other if they head for the same square, swap squares or cross; a player's own gliders pass through each other. A glider that hits an opponent's tower destroys it and breaks; one that hits its own side's tower turns back.",
    code: [{ file: VENG, find: "if (a.o === b.o && s.sameSide === 'pass') continue;" }, { file: VENG, find: "if (t !== g.o || s.ownTower === 'destroy') { delete w.tw[k];" }],
    site: 'partly', siteNote: 'Play. Learn (v3) still moves gliders one at a time in list order, and lets diagonal gliders crossing in an X pass (rules page §11).',
  },

  /* ---------------- turns to act ---------------- */
  {
    id: 'setup-phase', area: 'turns', source: 'book', how: 'stated',
    rule: 'Before the battle there is a setup phase, with placing allowed only in a home area.',
    cites: [{ block: 'c4-b94', quote: 'where he was allowed to put down squares during the initiation phase' }],
    code: [{ file: CTRL, find: 'v.strip = `SETUP · CYAN ${m.e.towers(w, \'C\').length} · AMBER 0 SEEN`;' }],
    site: 'yes', siteNote: 'Play: a setup turn at step 0, placing near your own towers.',
  },
  {
    id: 'setup-time', area: 'turns', source: 'book', how: 'stated',
    rule: 'Setup time is set per match (twenty minutes in one).',
    cites: [{ block: 'c12-b149', quote: 'You will have twenty minutes to figure out your structures' }],
    code: [{ file: LIVE, find: 'export const SETUP_MS = 90_000;' }],
    site: 'partly', siteNote: 'One-on-one gives 90 seconds for setup; against the computer there is no limit (invented numbers).',
  },
  {
    id: 'act-on-interventions', area: 'turns', source: 'book', how: 'implied',
    rule: 'During the battle, players act only on intervention turns; in between, the board runs on its own.',
    cites: [{ block: 'c7-b92', quote: 'He knew that he would not get to see the results of his attack for a long time.' }],
    code: [{ file: CTRL, find: 'if (m.w.step - m.turnAt >= m.s.every) { this.env.clearInterval(this.rt); this.beginAct(); }' }],
    site: 'yes', siteNote: 'Play.',
  },
  {
    id: 'place-near-symbols', area: 'turns', source: 'book', how: 'stated',
    rule: 'On an intervention turn, a player may put down squares near any copy of their symbol.',
    cites: [{ block: 'c4-b110', quote: 'all players were able to put down more squares near any copy of their symbols' }],
    code: [{ file: CTRL, find: 'Place in the lit area: within' }],
    site: 'yes', siteNote: 'Play: within 3 squares of a tower you had when the turn began (the distance is invented).',
  },
  {
    id: 'symbol-at-the-moment', area: 'turns', source: 'book', how: 'implied',
    rule: 'A symbol only has to exist at the moment of the intervention turn to anchor placing.',
    cites: [{ block: 'c4-b113', quote: "came together into Zei's symbol for exactly one turn - Zei's next intervention turn" }],
    code: [{ file: GAME, find: 'snap: Record<Side, number[]>;' }],
    site: 'partly', siteNote: 'Play anchors placing to the towers standing when the turn began; towers never form by collision there.',
  },
  {
    id: 'remove-cells', area: 'turns', source: 'book', how: 'stated',
    rule: 'Interventions may remove cells as well as place them.',
    cites: [{ block: 'c4-b113', quote: 'Zei quickly removed junk' }, { block: 'c4-b135', quote: 'Zei used his intervention turn to remove his own wall.' }],
    site: 'no', siteNote: 'Play: you can only take back a piece placed this turn. Free play has an eraser, outside any match.',
  },
  {
    id: 'budget', area: 'turns', source: 'book', how: 'stated',
    rule: 'Each intervention turn has a budget of resources per player.',
    cites: [{ block: 'c7-b102', quote: 'Allocate eighty percent of resources this intervention turn to this.' }],
    code: [{ file: LIVE, find: 'export const POINTS = 8;' }],
    site: 'yes', siteNote: 'Play: 8 points a turn (the number and the costs are invented).',
  },
  {
    id: 'team-capacity', area: 'turns', source: 'book', how: 'stated',
    rule: 'Two teammates can do twice as much in their intervention turns as one player.',
    cites: [{ block: 'c4-b138', quote: 'Zei and Bai could do twice as much together in their intervention turns as Pan could do alone in his.' }],
    site: 'no', siteNote: 'No teams on the site.',
  },
  {
    id: 'multi-turn-builds', area: 'turns', source: 'book', how: 'stated',
    rule: 'A large structure can take several intervention turns to build.',
    cites: [{ block: 'c14-b46', quote: 'it would take him four intervention turns to make a symbol-carrying spaceship or glider factory' }],
    site: 'no', siteNote: 'Play: points not spent are lost, and every piece is placed whole.',
  },
  {
    id: 'interval', area: 'turns', source: 'book', how: 'implied',
    rule: 'Intervention turns come about a thousand turns apart.',
    cites: [{ block: 'c14-b45', quote: 'A thousand turns later, the first intervention turn came.' }, { block: 'c4-b110', quote: 'A thousand turns later, the two sides\' gliders and ships met. At the same time, the first intervention turn came.' }],
    code: [{ file: SCHEMA, find: "text: 'A turn to act comes every this many steps', min: 4, max: 32, base: 12," }],
    site: 'partly', siteNote: 'Play: every 12 steps (8 under one drawn rule), on a far smaller board. The rules page marks the interval OPEN.',
  },
  {
    id: 'copy-paste', area: 'turns', source: 'book', how: 'stated',
    rule: 'Copy and paste is allowed when placing.',
    cites: [{ block: 'c12-b182', quote: 'deployment is just copy and paste' }, { block: 'c7-b70', quote: 'copying and pasting pieces of what the AI had already made' }],
    site: 'no', siteNote: 'Play places one piece at a time.',
  },
  {
    id: 'countdown', area: 'turns', source: 'book', how: 'stated',
    rule: 'Countdowns are announced in Dzegoban before the start and before the battle.',
    cites: [{ block: 'c4-b83', quote: 'MU GU GEI FA' }, { block: 'c4-b97', quote: 'MU GU GEI TAU FA' }, { block: 'c4-b98', quote: 'The battle begins in fifty ticks.' }],
    code: [{ file: 'src/app/minpentai/play-live.tsx', find: 'MU GU GEI TAU FA' }],
    site: 'yes', siteNote: "One-on-one and Learn's broadcast show c4-b97 and c4-b98.",
  },
  {
    id: 'play-points', area: 'turns', source: 'invented',
    rule: '8 points each turn: glider 4, square 1, tower 4. Points not spent are lost.',
    code: [{ file: SCHEMA, find: "costSquare: { text: 'A square costs', min: 1, max: 6, base: 1," }, { file: SCHEMA, find: "costTower: { text: 'A tower costs', min: 1, max: 16, base: 4," }, { file: LIVE, find: 'export const POINTS = 8;' }],
    site: 'yes', siteNote: 'Play and Learn.',
  },
  {
    id: 'play-every-12', area: 'turns', source: 'invented',
    rule: 'A setup turn at step 0, then a turn to act every 12 steps.',
    code: [{ file: SCHEMA, find: "text: 'A turn to act comes every this many steps', min: 4, max: 32, base: 12," }, { file: SCHEMA, find: "{ id: 'every8', text: 'Turns to act come every 8 steps.', set: { every: 8 } }," }],
    site: 'yes', siteNote: 'Play.',
  },
  {
    id: 'play-simultaneous', area: 'turns', source: 'invented',
    rule: "Both players act at the same time without seeing each other's choices; everything placed appears at once, and two pieces put on one square cancel each other.",
    code: [{ file: VENG, find: 'function apply(w: World, s: Settings, pend: Record<Side, Placement<AnyPiece>[]>) {' }],
    site: 'yes', siteNote: 'Play.',
  },
  {
    id: 'play-take-back', area: 'turns', source: 'invented',
    rule: 'A piece placed this turn can be tapped to take it back, with its points.',
    code: [{ file: CTRL, find: 'const p = m.pend.C.splice(i, 1)[0];' }],
    site: 'yes', siteNote: 'Play.',
  },
  {
    id: 'play-clock', area: 'turns', source: 'invented',
    rule: 'One-on-one gives 45 seconds a turn and 90 for setup; what is placed when time runs out stands. Against the computer, time is unlimited.',
    code: [{ file: LIVE, find: 'export const TURN_MS = 45_000;' }],
    site: 'yes', siteNote: 'Play.',
  },

  /* ---------------- sight ---------------- */
  {
    id: 'symbol', area: 'sight', source: 'book', how: 'stated',
    rule: 'Each player has a symbol, a pattern of dots; a copy of it anywhere lets its player see within thirty squares.',
    cites: [{ block: 'c4-b93', quote: 'would allow him to see everything within thirty squares' }],
    code: [{ file: VENG, find: 'function lit(w: World, o: Side, R: number, tws?: number[]): Set<number> {' }],
    site: 'partly', siteNote: 'Play: towers light 3 squares around them (counting diagonals), not 30; the tower is one square, not a pattern.',
  },
  {
    id: 'dark-start', area: 'sight', source: 'book', how: 'stated',
    rule: 'The board starts dark.',
    cites: [{ block: 'c4-b93', quote: 'the game field, which at the beginning appeared completely black' }],
    code: [{ file: 'src/lib/minpentai/play-game/board.ts', find: "c.label = 'dark';" }],
    site: 'yes', siteNote: 'Play: everything outside your lit area is dark (rocks excepted, see below).',
  },
  {
    id: 'symbols-made', area: 'sight', source: 'book', how: 'stated',
    rule: 'Symbols are made by placing them, or by gliders and ships crashing into rock.',
    cites: [{ block: 'c4-b108', quote: "leaving behind copies of each player's symbols" }, { block: 'c12-b187', quote: 'One of his gliders had successfully created a symbol' }],
    code: [{ file: VENG, find: 'else w.tw[k] = p.o;' }],
    site: 'partly', siteNote: 'Play: towers are only placed, never formed by a collision.',
  },
  {
    id: 'anyone-forms-any-symbol', area: 'sight', source: 'book', how: 'stated',
    rule: "A crash can form any player's symbol, a teammate's included.",
    cites: [{ block: 'c4-b132', quote: 'for one single turn, the chaos came together into a symbol' }, { block: 'c4-b133', quote: "Bai's symbol." }],
    site: 'no', siteNote: 'Not on the site.',
  },
  {
    id: 'symbols-destroyed', area: 'sight', source: 'book', how: 'stated',
    rule: 'Gliders destroy symbols.',
    cites: [{ block: 'c10-b163', quote: 'shredded through both of his remaining symbols' }],
    code: [{ file: VENG, find: "if (t !== g.o || s.ownTower === 'destroy') { delete w.tw[k];" }],
    site: 'yes', siteNote: "Play: an opponent's glider destroys a tower.",
  },
  {
    id: 'shared-vision', area: 'sight', source: 'book', how: 'implied',
    rule: 'Teammates share what they see.',
    cites: [{ block: 'c4-b94', quote: 'he also became able to see a few parts of the field at the bottom left. Bai had put down her symbols too.' }],
    site: 'no', siteNote: 'No teams on the site.',
  },
  {
    id: 'hidden-watcher', area: 'sight', source: 'book', how: 'stated',
    rule: 'A symbol the opponent cannot see can watch their moves.',
    cites: [{ block: 'c10-b162', quote: 'I had a symbol along the path, right in the position where you could not see it.' }],
    code: [{ file: VENG, find: 'function updLS(w: World, R: number, ls: Record<Side, Record<number, number>>) {' }],
    site: 'yes', siteNote: "Play: each side sees only what its own towers light, so a tower in the opponent's dark can watch.",
  },
  {
    id: 'audience-sees-more', area: 'sight', source: 'book', how: 'stated',
    rule: 'The players see less than the audience.',
    cites: [{ block: 'c14-b51', quote: 'Zei and Gun could not see the full view of what was going on, but the audience could.' }],
    site: 'yes', siteNote: "Learn's broadcast and Play's replays show the whole board; players in a match never see it.",
  },
  {
    id: 'voice-chat', area: 'sight', source: 'book', how: 'stated',
    rule: 'Teammates normally talk by voice during the game.',
    cites: [{ block: 'c4-b99', quote: 'Normally, at this stage, the players would be speaking intensely by voice chat' }],
    site: 'no', siteNote: 'No teams or chat in a match.',
  },
  {
    id: 'play-sight-3', area: 'sight', source: 'invented',
    rule: 'You see every square within 3 of one of your towers (counting diagonals), right now.',
    code: [{ file: SCHEMA, find: "text: 'You see every square within this many of your towers', min: 1, max: 30, base: 3," }, { file: SCHEMA, find: "{ id: 'sight2', text: 'You see only 2 squares around your towers.', set: { sight: 2, reach: 2 } }," }],
    site: 'yes', siteNote: 'Play and Learn.',
  },
  {
    id: 'play-rocks-known', area: 'sight', source: 'invented',
    rule: 'Rocks are shown everywhere, all match.',
    cites: [{ block: 'c12-b187', quote: 'revealed a part of the board that showed what the rock formations look like' }],
    code: [{ file: 'src/lib/minpentai/play-game/board.ts', find: "if (w.rock[k]) { c.bg = '#3A3B42'; c.label = 'rock'; return c; }" }],
    site: 'yes', siteNote: 'Play. In the book, rocks are hidden until seen.',
  },
  {
    id: 'play-last-seen', area: 'sight', source: 'invented',
    rule: "An opponent's tower out of sight is drawn as an outline where it was last seen; the count shows only the opponent's towers you can see now.",
    code: [{ file: VENG, find: 'function updLS(w: World, R: number, ls: Record<Side, Record<number, number>>) {' }, { file: CTRL, find: 'AMBER ${seen} SEEN' }],
    site: 'yes', siteNote: 'Play.',
  },

  /* ---------------- how a match ends ---------------- */
  {
    id: 'out', area: 'ending', source: 'book', how: 'stated',
    rule: 'A player with no symbols left is out.',
    cites: [{ block: 'c4-b136', quote: "all of Dza's remaining symbols had been eliminated" }, { block: 'c4-b138', quote: 'now, Dza was out' }],
    code: [{ file: LIVE, find: 'export function checkEnd' }],
    site: 'yes', siteNote: 'Play: a player with no towers left loses.',
  },
  {
    id: 'win-by-elimination', area: 'ending', source: 'book', how: 'stated',
    rule: "One-on-one is won by destroying all the opponent's symbols.",
    cites: [{ block: 'c12-b196', quote: "all of Bo's symbols were destroyed, and Zei was announced the winner" }],
    code: [{ file: LIVE, find: 'export function checkEnd' }],
    site: 'yes', siteNote: 'Play.',
  },
  {
    id: 'resign', area: 'ending', source: 'book', how: 'stated',
    rule: 'Players may resign.',
    cites: [{ block: 'c4-b141', quote: 'At that moment, Pan resigned.' }, { block: 'c10-b164', quote: 'Zei clicked a button to resign.' }],
    code: [{ file: LIVE, find: 'export function resign' }],
    site: 'yes', siteNote: 'Play: from the ··· menu, after one confirmation; it counts as a loss.',
  },
  {
    id: 'symbol-count', area: 'ending', source: 'book', how: 'implied',
    rule: 'Standing is measured by symbol count, which does not decide the game by itself.',
    cites: [{ block: 'c4-b138', quote: 'By total symbol count, it was fifteen to fifteen - exactly even.' }, { block: 'c7-b98', quote: 'Seventeen symbols to twenty-two' }],
    code: [{ file: CTRL, find: 'Time ran out at step ${last}.' }],
    site: 'partly', siteNote: 'Play: the count decides only at the step limit (invented).',
  },
  {
    id: 'formats', area: 'ending', source: 'book', how: 'stated',
    rule: 'Games are played two against two, one-on-one, or by several players with placings.',
    cites: [{ block: 'c4-b89', quote: 'fated by chance to be on team Ja' }, { block: 'c7-b62', quote: 'Today, we have our two finalists' }, { block: 'c2-b12', quote: 'I got third place!' }],
    site: 'partly', siteNote: 'Play is one-on-one only.',
  },
  {
    id: 'random-teams', area: 'ending', source: 'book', how: 'stated',
    rule: 'Teams are normally assigned by cryptographic randomness.',
    cites: [{ block: 'c4-b68', quote: 'the teams are randomly assigned!' }, { block: 'c4-b148', quote: 'the team selection was not done through cryptographic randomness' }],
    site: 'no', siteNote: 'No teams on the site.',
  },
  {
    id: 'no-turn-limit', area: 'ending', source: 'book', how: 'implied',
    rule: 'Games have no fixed turn limit.',
    cites: [{ block: 'c14-b94', quote: 'Ten thousand two hundred turns into the game, Deluin was announced the winner.' }],
    site: 'no', siteNote: 'Play stops at step 96 (invented).',
  },
  {
    id: 'qualifying-tiebreak', area: 'ending', source: 'book', how: 'stated',
    rule: 'Qualifying rounds rank by wins, with a tiebreak on turns survived or needed, counted up to eight thousand turns.',
    cites: [{ block: 'c12-b91', quote: 'counted up to a maximum of eight thousand turns' }],
    site: 'no', siteNote: 'No tournaments on the site.',
  },
  {
    id: 'play-step-limit', area: 'ending', source: 'invented',
    rule: 'At step 96 the match stops; most towers wins, and equal is a draw.',
    code: [{ file: SCHEMA, find: "maxSteps: { text: 'The match stops at this step; most towers wins', min: 24, max: 240, base: 96," }, { file: VENG, find: "if (w.step >= s.maxSteps) return nc > na ? 'C' : na > nc ? 'A' : 'D';" }],
    site: 'yes', siteNote: 'Play.',
  },
  {
    id: 'play-leaving', area: 'ending', source: 'invented',
    rule: 'In one-on-one, a player not heard from for 15 seconds pauses the match; after 60 seconds more it counts as resigning (during setup, the match is cancelled).',
    code: [{ file: LIVE, find: 'export const PAUSE_MS = 15_000;' }, { file: LIVE, find: 'export const GONE_MS = 60_000;' }],
    site: 'yes', siteNote: 'Play.',
  },

  /* ---------------- the sandbox ---------------- */
  {
    id: 'sandbox', area: 'sandbox', source: 'book', how: 'stated',
    rule: 'Players have a private sandbox for trying structures before placing them; moves found there are repeated live by hand.',
    cites: [{ block: 'c4-b96', quote: 'He experimented with a few glider and wall formations in his sandbox, and after confirming that they work, deployed them to the field.' }, { block: 'c4-b135', quote: 'she repeated her moves live' }],
    code: [{ file: CTRL, find: 'fpReset' }],
    site: 'partly', siteNote: 'Free play is a board to try things on, outside any match; a match has no sandbox (the dotted line shows a glider\'s path).',
  },
  {
    id: 'sandbox-controls', area: 'sandbox', source: 'book', how: 'stated',
    rule: 'The sandbox has a button to play one step forward, and two to shift time forward or back; running backward is done by hand.',
    cites: [{ block: 'c12-b171', quote: 'there was a button to play one step forward, and two buttons to shift time - either forward or backward' }, { block: 'c12-b173', quote: 'It was an arduous process, and his fingers quickly tired.' }],
    code: [{ file: 'src/app/minpentai/rule/rule-view.tsx', find: 'stepBack(b)' }],
    site: 'partly', siteNote: "The book's rule page has step forward and step back (one button, not by hand).",
  },
  {
    id: 'sampled-past', area: 'sandbox', source: 'book', how: 'stated',
    rule: 'Running backward from an end state shows one possible past.',
    cites: [{ block: 'c12-b176', quote: 'So in that particular history that Zei had just sampled, before the crash, the symbol had been there all along.' }],
    site: 'no', siteNote: 'Not on the site.',
  },
  {
    id: 'sandbox-symbol', area: 'sandbox', source: 'invented',
    rule: "The older sandbox's symbol is a skew tetromino, counted only in one orientation with an empty margin. The book never gives a symbol's shape.",
    code: [{ file: 'src/lib/minpentai/symbol.ts', find: "export const SYMBOL_ROWS = ['#..', '.##', '.#.'] as const;" }],
    site: 'no', siteNote: 'Kept in the repo (sandbox.tsx); out of the menus since 2026-10-09.',
  },

  /* ---------------- each match's new rule ---------------- */
  {
    id: 'new-rule', area: 'match-rules', source: 'book', how: 'stated',
    rule: 'In the book, "every game there\'s always some kind of new rule"; the priests decide the rule sets in secret.',
    cites: [{ block: 'c4-b84', quote: "every game there's always some kind of new rule" }, { block: 'c4-b148', quote: 'the priests went into the dungeon to decide on the rule sets' }],
    code: [{ file: LIVE, find: 'export function drawRule' }],
    site: 'yes', siteNote: 'Play draws one of four invented rules at the start of each practice, ladder and one-on-one match. Learn\'s lessons have none.',
  },
  {
    id: 'rule-kept-secret', area: 'match-rules', source: 'book', how: 'stated',
    rule: 'Players are kept offline beforehand, so they cannot learn the new rule early.',
    cites: [{ block: 'c12-b133', quote: "so we don't learn the new rule ahead of time?" }, { block: 'c12-b134', quote: 'Exactly.' }],
    code: [{ file: CTRL, find: 'NEW RULE THIS MATCH' }],
    site: 'yes', siteNote: 'Play shows the rule to both players only when the match starts.',
  },
  {
    id: 'rule-mid-game', area: 'match-rules', source: 'book', how: 'stated',
    rule: 'A rule can change partway through a game.',
    cites: [{ block: 'c5-b30', quote: 'the sudden rule change four thousand turns in' }],
    site: 'no', siteNote: 'Not on the site.',
  },
  {
    id: 'ai-assistants', area: 'match-rules', source: 'book', how: 'stated',
    rule: "One match's rule: each player has an AI, and each side can read the other AI's thoughts.",
    cites: [{ block: 'c7-b63', quote: 'Both players will have access to a powerful personal AI' }, { block: 'c7-b65', quote: "the players and their AIs will have full read access to the thought transcripts of each other's AI" }],
    site: 'no', siteNote: 'Not on the site.',
  },
  {
    id: 'shrines', area: 'match-rules', source: 'book', how: 'stated',
    rule: "One match's rule: the budget is cut by eighty percent, and five shrines apply their changes as an XOR every thousand turns, then reset.",
    cites: [
      { block: 'c14-b33', quote: 'The resources you can allocate in each intervention turn are reduced by eighty percent.' },
      { block: 'c14-b33', quote: 'any changes that had taken place to the contents of the shrine will be applied as an XOR to the regions near the four corners of the shrine' },
      { block: 'c14-b35', quote: 'XOR is not weight-preserving, but it is reversible.' },
    ],
    site: 'no', siteNote: 'Not on the site.',
  },
  {
    id: 'custom-games', area: 'match-rules', source: 'book', how: 'stated',
    rule: 'Practice games against bots can be set up with custom starts and teams.',
    cites: [{ block: 'c12-b10', quote: 'he had adjusted the game to only give him one corner and three other AIs the other three corners' }],
    code: [{ file: CTRL, find: "v.fpRules = " }],
    site: 'partly', siteNote: 'Free play lets you set up any board and switch two rules; there are no teams or four corners.',
  },
  {
    id: 'play-four-rules', area: 'match-rules', source: 'invented',
    rule: 'The four rules one is drawn from: gliders may also fly diagonally; gliders cost 3 points; you see only 2 squares around your towers; turns to act come every 8 steps.',
    code: [{ file: SCHEMA, find: 'export const BASE_DRAWN: DrawnRule[] = [' }, { file: 'src/lib/minpentai/learn-game/pieces.ts', find: 'export const RULES: NewRule[]' }],
    site: 'yes', siteNote: "Play, and Learn's practice match (the same four).",
  },

  /* ---------------- computer players ---------------- */
  {
    id: 'bots-and-new-rules', area: 'computer', source: 'book', how: 'stated',
    rule: 'Bots play the usual rules better than people, but adapt badly to a new rule.',
    cites: [{ block: 'c7-b14', quote: 'the bots play better than me on stock Minpentai, but they are much worse at adapting to any new situation they don\'t have training data for' }],
    code: [{ file: VENG, find: 'const dirs = m.diag && Lv >= 4 ? D8 : D4;' }],
    site: 'partly', siteNote: 'On the ladder, only rungs 4 and 5 fly diagonally under that rule; every rung pays the same costs and sees as far.',
  },
  {
    id: 'play-ladder', area: 'computer', source: 'invented',
    rule: 'Five computer players (Rival, Blocker, Builder, Opportunist, Planner) see only what their towers light, get the same 8 points, and give the same result for the same seed.',
    code: [{ file: GAME, find: 'export const RUNGS' }, { file: GAME, find: 'export function botPlan' }],
    site: 'yes', siteNote: 'Play: the computer ladder and practice (practice plays the simplest).',
  },
  {
    id: 'learn-bot', area: 'computer', source: 'invented',
    rule: "Learn's practice bot reads the whole board (it ignores the dark), blocks threats with squares, and fires along its targets' rows.",
    code: [{ file: 'src/lib/minpentai/learn-game/bot.ts', find: 'export function botTurn' }],
    site: 'yes', siteNote: "Learn's practice match (v3); the rules page lists it as changing.",
  },
];
