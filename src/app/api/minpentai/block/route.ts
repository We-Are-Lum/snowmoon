import { body, play } from '~/lib/minpentai/play-server/route';
import { block } from '~/lib/minpentai/play-server/store';

/** Block a player {fid}, for good: never listed, challenged or matched with me again → { ok }. */
export async function POST(request: Request) {
  return play(request, async ({ sql, fid, now }) => block(sql, fid, (await body(request)).fid, now));
}
