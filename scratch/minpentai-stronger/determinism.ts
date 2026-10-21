/** SCRATCH: the search player is deterministic: the same seed gives the same match twice, and from a fresh module copy. */
import { playMatch, rung } from '../../src/lib/minpentai/play-game/players';
import { searchPlayer } from './search-player';
const key = (r: ReturnType<typeof playMatch>) => JSON.stringify([r.win, r.step, r.rule, r.moves]);
let same = 0, total = 0;
for (const seed of [1, 7, 42, 2 ** 31, 2 ** 32 - 1]) for (const lvl of [1, 3, 5]) {
  const a = key(playMatch(rung(4), searchPlayer(lvl), seed)), b = key(playMatch(rung(4), searchPlayer(lvl), seed));
  total++; if (a === b) same++;
}
console.log(`determinism: ${same}/${total} matches identical when replayed (search levels 1, 3, 5; seeds incl. 2^31 and 2^32 - 1)`);
