import { play } from '~/lib/minpentai/play-server/route';
import { getLadder } from '~/lib/minpentai/play-server/store';

/** The computer ladder's progress (LadderProgress), the signed-in player's own only. */
export async function GET(request: Request) {
  return play(request, ({ sql, fid }) => getLadder(sql, fid));
}
