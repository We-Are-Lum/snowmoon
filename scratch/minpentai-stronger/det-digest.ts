/** SCRATCH: the matches both Node and Chromium play (search levels 3 and 5 against rung 4, edge seeds included). */
import { playMatch, rung } from '../../src/lib/minpentai/play-game/players';
import { searchPlayer } from './search-player';
export const digest = () => JSON.stringify([1, 2, 99, 2 ** 31, 2 ** 32 - 1].flatMap((s) => [3, 5].map((l) => { const r = playMatch(rung(4), searchPlayer(l), s); return [r.win, r.step, r.moves]; })));
