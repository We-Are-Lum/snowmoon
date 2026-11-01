import { play } from '~/lib/minpentai/play-server/route';
import { getLadder } from '~/lib/minpentai/play-server/store';

/** The computer ladder's progress (LadderProgress), the signed-in player's own only. ?l=3: the search computer's ladder, with the old one as history. */
export async function GET(request: Request) {
  const ladder = new URL(request.url).searchParams.get('l') === '3' ? 3 : 1;
  return play(request, ({ sql, fid }) => getLadder(sql, fid, ladder));
}
