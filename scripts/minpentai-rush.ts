/**
 * The rush player (scripts/lib/minpentai-rush.ts) against the site computer, as agent play serves a match (2026-11-04,
 * after the book-4 playtest). Prints, per level, the rush player's wins, draws and losses, and the middle game's
 * "dragging turns".
 *
 *   npx tsx scripts/minpentai-rush.ts <ruleset> <levels, e.g. 1,2,3> <matches> [computer revision | first]
 *
 * "first" plays the ruleset's first computer (COMPUTERS), as every match before its revision; with no fourth argument,
 * the computer a new match gets now.
 *
 * A dragging turn (the playtest's "6 to 8 identical turns"): a turn in which the computer places at least one tower and
 * loses at least one, and the match goes on. Reported: the mean per match, and the longest run of them in a row.
 */
import { playRush } from './lib/minpentai-rush';
import { REVISIONS, type RulesetName } from '../src/lib/minpentai/agent-play/solo';

const [ruleset, levelsArg, nArg, rev] = process.argv.slice(2) as [RulesetName, string, string, string | undefined];
const N = Number(nArg), levels = levelsArg.split(',').map(Number);
const computer = rev === 'first' ? 'first' : rev !== undefined ? Number(rev) : REVISIONS[ruleset]?.computer;
for (const level of levels) {
  let win = 0, draw = 0, loss = 0, early = 0, drag = 0, longest = 0, maxRun = 0, turns = 0, opening = 0, kr = 0, kc = 0, tr = 0, tcp = 0;
  const how: Record<string, number> = {};
  for (let seed = 1; seed <= N; seed++) {
    const r = playRush({ ruleset, level, seed, computer });
    if (r.result === 'win') win++; else if (r.result === 'draw') draw++; else loss++;
    how[`${r.result}/${r.how}`] = (how[`${r.result}/${r.how}`] ?? 0) + 1;
    if (r.result === 'win' && r.turns <= 2) early++;
    turns += r.turns; opening += r.perTurn[0]?.lost ?? 0; kr += r.kills.rush; kc += r.kills.computer; tr += r.towers.rush; tcp += r.towers.computer;
    let run = 0, best = 0;
    for (const t of r.perTurn.slice(0, -1)) { if (t.placed > 0 && t.lost > 0) { drag++; run++; best = Math.max(best, run); } else run = 0; }
    longest += best; maxRun = Math.max(maxRun, best);
  }
  const pc = (x: number) => `${Math.round((100 * x) / N)}%`;
  console.log(JSON.stringify({ ruleset, computer: computer ?? 'first', level, matches: N, rushWin: pc(win), draw: pc(draw), rushLoss: pc(loss), rushWonBy2ndTurn: early, how, openingKillsMean: +(opening / N).toFixed(2), rushKillsMean: +(kr / N).toFixed(1), computerKillsMean: +(kc / N).toFixed(1), towersAtEnd: { rush: +(tr / N).toFixed(1), computer: +(tcp / N).toFixed(1) }, turnsMean: +(turns / N).toFixed(1), draggingTurnsMean: +(drag / N).toFixed(1), longestDragRunMean: +(longest / N).toFixed(1), longestDragRunMax: maxRun }));
}
