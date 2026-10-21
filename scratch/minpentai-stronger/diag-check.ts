/** SCRATCH: does the search player use diagonal gliders under "diag" (and never otherwise)? */
import { playMatch, rung } from '../../src/lib/minpentai/play-game/players';
import { searchPlayer } from './search-player';
let diagUnderDiag = 0, gUnderDiag = 0, diagOtherwise = 0, matchesDiag = 0;
for (let seed = 1; seed <= 40; seed++) {
  const r = playMatch(rung(3), searchPlayer(3), seed);
  const gl = r.moves.flatMap((m) => m.A).filter((p) => p.t === 'g');
  const diag = gl.filter((p) => p.dx !== 0 && p.dy !== 0).length;
  if (r.rule === 'diag') { matchesDiag++; diagUnderDiag += diag; gUnderDiag += gl.length; } else diagOtherwise += diag;
}
console.log(`${matchesDiag} "diag" matches: ${diagUnderDiag} of ${gUnderDiag} gliders diagonal; other rules: ${diagOtherwise} diagonal gliders`);
