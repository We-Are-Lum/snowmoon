/**
 * The rules of an agent-play match as short plain lines for an AI (owner, 2026-11-02: "My AI learned these only by
 * error or guessing, and searched the web without finding the rules page … Generate these from the ruleset object so
 * they can't drift"). Every number comes from the match's resolved settings (solo.ts rulesOf(m).s) and every
 * behaviour that depends on a setting branches on it, read from versions/engine.ts as it plays (step, converge, apply,
 * refuse, fog). Nothing here changes a rule; scripts/test-minpentai-agent-play.ts checks lines against the engine.
 *
 * The rules are this edition's inventions (the pieces are drawn from the book; what they do is this edition's).
 * Pure: depends only on the settings, so a view that carries these lines stays the same whatever is hidden.
 * Written by the coding agent (Claude, Anthropic's closed model); DRAFT wording until the owner approves it.
 */
import { PIECES, type Settings } from '../versions/schema';

/** Where a person reads how the pieces work (invite-only, noindex: an AI can't open it; it has these lines). */
export const PIECES_PAGE = '/minpentai/book';

const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;
const box = (r: number) => `${2 * r + 1} x ${2 * r + 1}`;
/** The schema's option text, continuing a sentence ("Rocks: turns it straight back"). */
const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
/** "a, b and c". */
const and = (xs: (string | 0 | false | undefined)[], word = 'and') => { const l = xs.filter(Boolean) as string[]; return l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} ${word} ${l[l.length - 1]}`; };
/** A rock's option text with its subject: "Turns it straight back" as "a rock turns a glider straight back". */
const rockDoes = (x: string) => `a rock ${lower(x).replace(/\bit\b/, 'a glider')}`;

/** The launch directions a glider (and a symbol glider) may take under these settings. */
export const directionsLine = (s: Pick<Settings, 'directions' | 'costSeed' | 'costMirror'>) => {
  const who = s.costSeed ? 'Gliders and symbol gliders' : 'Gliders';
  return s.directions === 8
    ? `${who} may fly in any of 8 directions: N, NE, E, SE, S, SW, W, NW.`
    : `${who} fly N, E, S or W only (no diagonals in this ruleset): to hit something on a diagonal you need a launch cell in its row or column${s.costMirror ? ', or a mirror to turn the glider' : ''}.`;
};

/** The convergence rule, the walled-in rule and a worked example (book-edition rulesets, where symbol gliders exist). */
export function convergenceLines(s: Settings): string[] {
  if (!s.costSeed) return [];
  const around = s.directions === 8 ? 'all 8 squares around it' : 'the 4 squares beside it (N, E, S, W)';
  return [
    `Symbol glider (costs ${s.costSeed}): flies like a glider, one square a step, and destroys an enemy tower it hits. It comes to rest on the square it is on (one square short of the obstacle) when it flies into a rock, a square (anyone's; the square takes no hit), a factory, a moving wall or another resting symbol glider. It does NOT stop at the board's edge, at your own tower or at a mirror: ${s.edges === 'bounce' ? 'the edge turns it back' : s.edges === 'wrap' ? 'off the edge it comes in on the far side' : 'off the edge it is gone'}, ${s.ownTower === 'destroy' ? 'your own tower is destroyed by it' : 'your own tower turns it back'}, a mirror turns it (and takes a hit). Gliders are not something to rest against: it meets them like any glider.`,
    'A resting symbol glider is solid: any other glider that flies into it breaks both, and another symbol glider comes to rest against it. It rests until something breaks it or it joins a symbol. If a glider is standing on its square as it stops, it is lost instead of resting.',
    `Convergence: when three of your resting symbol gliders fit inside one 3 x 3 box (all three within 2 columns and 2 rows of each other), they become your symbol at once, during the step, on the square of the one that came to rest last (several in the same step: the first in reading order, top row first, then left first); the other two are removed. ${s.symbolsCapped && s.maxTowers ? `No symbol forms while you hold ${s.maxTowers} towers (the cap); the three keep resting.` : ''}`.trim(),
    `The symbol is a tower from that moment: it gives sight and placing reach for your next turn to act. At that turn, after both sides' placements appear, it stays only if ${around} are solid (rock, square, tower, mirror, factory, moving wall or resting symbol glider) or off the board; otherwise it is removed. Gliders don't wall it in. So wall it in with that turn's placements.`,
    'Convergence example: three symbol gliders launched E from (10,4), (10,5) and (10,6), with rocks or squares at (15,4), (15,5) and (15,6): each comes to rest at x = 14, rows 4 to 6, a column inside one 3 x 3 box, so they form your symbol at (14,4). Launched on rows 3, 5 and 8 they never can (rows 3 and 8 are 5 apart). Gliders move one at a time within a step, in the order they were placed (yours in the order you list them): two launched E one behind the other on the same row work only if the front one is listed first; the other way round, the back one reaches the front one\'s square as it stops there, and the front one is lost. The minpentai_symbol_launches tool finds three that work for a target square.',
  ];
}

/**
 * Every rule of a match under these settings, as plain lines. `name` is the ruleset as the view names it; `drawn` the
 * match's drawn rule (Play's rules draw one per match), if any.
 */
export function rulesText(s: Settings, o: { name: string; drawn?: string | null }): string[] {
  const L: string[] = [];
  const add = (x: string | false | 0 | undefined | null) => { if (x) L.push(x); };
  const book = !!(s.costMirror || s.costSeed || s.costWall || s.costFactory);
  add(`These are this edition's invented rules for ${o.name}${book ? ', with pieces drawn from the book' : ''}; they are not the book's rules. Generated from the ruleset's settings, so they match the engine.`);
  add(o.drawn && `This match's drawn rule: ${o.drawn}`);
  // Board, time, points.
  add(`Board: ${s.width} x ${s.height} squares; x counts from 0 at the left, y from 0 at the top. Each side starts with ${n(s.startTowers, 'tower')}.`);
  add(`Time runs in steps. Every glider moves exactly one square a step (there is no faster or slower glider). A turn to act comes every ${n(s.every, 'step')}: both sides place at the same time, the placements appear at once, then ${n(s.every, 'step')} run. Turn 0 is setup, at step 0. The match stops at step ${s.maxSteps}.`);
  add(`Points: ${s.setupPoints} at setup, ${s.points} each later turn. ${s.carryOver ? `Unspent points (up to ${s.carryOver}) carry over.` : 'Unspent points are lost (nothing carries over).'}`);
  const costs = [`glider ${s.costGlider}`, `square ${s.costSquare}`, `tower ${s.costTower}`, s.costMirror && `mirror ${s.costMirror}`, s.costSeed && `symbol glider ${s.costSeed}`, s.costWall && `moving wall ${s.costWall}`, s.costFactory && `factory ${s.costFactory}`].filter(Boolean);
  add(`Costs: ${costs.join(', ')}.`);
  // Placing.
  add(`Placing: only on an empty square within ${s.reach} squares (counting diagonals: the ${box(s.reach)} box) of a tower you had when the turn began; get_view's can_place lists them. Empty means no rock, square, tower, glider or other piece, your own included: your own ${and(['squares', s.costMirror && 'mirrors', s.costFactory && 'factories', s.costWall && 'moving walls', 'towers'])} take away launch cells, and a square with a glider on it when the turn opens can't take a placement.`);
  add('Two placements by the two sides on the same square cancel each other: neither appears. A glider you place starts on that square and moves on the first step.');
  add(directionsLine(s));
  add((s.costWall || s.costFactory) && `${[s.costWall && 'Moving walls', s.costFactory && 'factories'].filter(Boolean).join(' and ')} face N, E, S or W only.`);
  // Gliders against the board.
  const edge = (PIECES.edges.options[s.edges as keyof typeof PIECES.edges.options]?.text ?? '').replace(/^It /, 'a glider ');
  add(s.edges === 'bounce'
    ? `Board edge: ${edge} A diagonal glider flips only the part of its direction that would leave the board (like a ball off a wall); in a corner, both.`
    : `Board edge: ${edge}`);
  const rockHits = n(s.rockHits, 'hit');
  add(s.rocks === 'bounce' ? `Rocks: ${rockDoes(PIECES.rocks.options.bounce.text)} The glider stays put for that step, then flies back the way it came.`
    : s.rocks === 'absorb' ? `Rocks: ${rockDoes(PIECES.rocks.options.absorb.text)}`
      : s.rocks === 'breakable' ? `Rocks: a rock turns a glider straight back (it stays put that step) and breaks after ${rockHits}; the hit that breaks it breaks the glider too.`
        : `Rocks: ${rockDoes(PIECES.rocks.options.split.text)}`);
  add(s.squareHits > 1
    ? `Squares: a square starts with ${s.squareHits} hits. A glider that hits a square, anyone's (your own too), takes 1 hit off it and turns straight back, staying put that step; the hit that takes its last breaks the square and the glider.`
    : 'Squares: a glider that hits a square, anyone\'s (your own too), breaks it and is broken.');
  add(s.debris === 'rock' && 'A broken square or tower leaves a rock.');
  add(`Bouncing: a glider that bounces (off ${and([s.edges === 'bounce' && 'an edge', s.rocks !== 'absorb' && 'a rock', s.squareHits > 1 && 'a square', s.ownTower === 'bounce' && 'your own tower', s.costFactory && 'a factory', s.costWall && 'a moving wall\'s front'], 'or')}) flies back the way it came and can hit and chip your own ${and(['squares', s.costMirror && 'mirrors', s.costFactory && 'factories'])} on the way back: being yours doesn't let it through.`);
  add(s.ownTower === 'bounce' ? 'Towers: a glider that hits an enemy tower destroys it and is broken. Your own tower turns your glider straight back, unharmed.' : 'Towers: any glider destroys any tower it hits, your own too, and is broken.');
  add(`Gliders meeting: two enemy gliders that would land on the same square, swap squares or cross paths in one step destroy each other (head-on, side-on or crossing diagonals; flying into the square of a glider pausing there for a bounce counts). ${s.sameSide === 'pass' ? 'Your own gliders pass through each other.' : 'Your own gliders break each other the same way.'}`);
  // Sight.
  add(`Sight: you see every square within ${s.sight} of any of your towers (the ${box(s.sight)} box around each, counting diagonals). Only towers give sight${s.costSeed ? ' (a symbol is a tower while it stands)' : ''}; gliders, squares and other pieces give none. Out of sight, rocks show as they were at the start and enemy towers where you last saw them (last_seen_enemy_towers). Placing reach (${s.reach}) never exceeds sight.`);
  add(s.maxTowers ? `Towers: you may hold at most ${s.maxTowers}; a tower placement past that is refused.${s.costSeed ? (s.symbolsCapped ? ' Symbols count toward the cap, and none forms while you are at it.' : ' Symbols are not stopped by the cap.') : ''}` : 'Towers: no limit on how many you hold.');
  // Book pieces.
  if (s.costMirror) add(`Mirror (costs ${s.costMirror}): one square leaning "/" or "\\". "/" turns E to N, N to E, W to S, S to W; "\\" turns E to S, S to E, W to N, N to W. The glider stays put that step. A diagonal glider goes straight back. It turns every glider, yours and symbol gliders too, and each turn is a hit: after ${n(s.mirrorHits ?? 3, 'hit')} it breaks, with the glider that broke it.`);
  L.push(...convergenceLines(s));
  if (s.costFactory) add(`Factory (costs ${s.costFactory}): placed on an empty square beside a rock (N, E, S or W of it), facing away from the rock; the rock must be within your reach too. Each rock holds ${s.ore ?? 0} ore. Each time any glider (either side's, symbol gliders too) hits that rock, the factory fires one of your gliders from the square in front of it (only if that square is empty at the end of the step; each glider fired spends 1 of the rock's ore).${s.factoryEvery ? ` It also fires on its own every ${n(s.factoryEvery, 'step')} (on each step that starts at a multiple of ${s.factoryEvery}: 0, ${s.factoryEvery}, ${2 * s.factoryEvery} …) while its rock has ore.` : ' It fires only when its rock is hit.'} A rock whose ore runs out crumbles away. A factory takes ${n(s.factoryHits ?? 2, 'hit')}; each hit before the last turns the glider back. Symbol gliders come to rest against it.`);
  if (s.costWall) add(`Moving wall (costs ${s.costWall}): three squares in a line across its direction of flight; you place its middle square and its direction, and all three squares must be placeable. It moves one square every second step. A glider flying into its front is sent straight back and the wall is unharmed; from the side or behind, the glider breaks the one square it hits and is broken. It waits while a glider stands where it would go, and stops for good at the board's edge, a rock, a tower or any other piece. It never destroys anything.`);
  // The end.
  add(s.win === 'first-blood' ? `Winning: ${lower(PIECES.win.options['first-blood'].text)}` : `Winning: lose your last tower and you lose (both at once: a draw). At step ${s.maxSteps}, the side with more towers wins; level is ${s.tieBreak ? 'won by the side that destroyed more enemy towers, and a draw if that is level too' : 'a draw'}.`);
  return L;
}

/**
 * The few lines every Minpentai tool description carries, generated from the settings new matches start from (the book
 * edition's, and Play's before its drawn rule; `drawn` is what Play's drawn rules can change). Each match's view has
 * its exact rules in "rules".
 */
export function toolNotes(book: Settings, play: Settings, drawn: Partial<Settings>[]): { core: string; convergence: string; sight: string } {
  const drawsDiagonal = drawn.some((d) => d.directions === 8), drawsSight = drawn.some((d) => d.sight !== undefined && d.sight !== play.sight);
  const dirs = book.directions === 4 && play.directions === 4
    ? `Gliders fly N, E, S or W only${drawsDiagonal ? ' (in Play, unless the match\'s drawn rule allows diagonals)' : ''}.`
    : 'Gliders may fly diagonally in some rulesets: see the view\'s "rules".';
  const both = (f: (s: Settings) => boolean) => f(book) && f(play);
  const bounce = both((s) => s.edges === 'bounce' && s.rocks === 'bounce' && s.squareHits > 1)
    ? 'A glider bounces off rocks, edges and squares (taking a hit off the square) and flies back the way it came, and can chip your own squares on the way back.'
    : 'A bouncing glider flies back the way it came and can chip your own squares on the way back (what bounces it: see the view\'s "rules").';
  const meet = both((s) => s.sameSide === 'pass') ? 'Enemy gliders meeting head-on or crossing destroy each other; your own pass through each other.' : 'Gliders meeting head-on or crossing destroy each other.';
  const sight = book.sight === play.sight ? `${book.sight}` : `${book.sight} (book edition) or ${play.sight} (Play)`;
  return {
    core: `Rules (this edition's, invented; full list in the view's "rules"): ${dirs} You place only on empty squares within reach of a tower you had when the turn began, so your own squares and pieces take away your own launch cells. ${bounce} ${meet}`,
    convergence: book.costSeed
      ? 'Book edition: three of your symbol gliders resting inside one 3 x 3 box form your symbol (a tower) at once. A symbol glider rests one square short of a rock, square, factory, moving wall or resting symbol glider, never at an edge, a mirror or your own tower. Example: three launched E on rows 4, 5, 6 toward a column of rocks or squares at x = 15 rest at x = 14 and form at (14,4); rows 3, 5, 8 never can. It stays past your next turn only if walled in then.'
      : '',
    sight: `Sight: you see within ${sight} squares of your towers (counting diagonals)${drawsSight ? ', unless a drawn rule changes it' : ''}; only towers give sight.`,
  };
}
