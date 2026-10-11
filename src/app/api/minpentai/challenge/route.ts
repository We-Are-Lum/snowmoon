import { body, play } from '~/lib/minpentai/play-server/route';
import { challenge } from '~/lib/minpentai/play-server/store';

/** Challenge a ready player {toFid} → { id }. 20 seconds to accept; one open challenge at a time. */
export async function POST(request: Request) {
  return play(request, async ({ sql, fid, now }) => challenge(sql, fid, (await body(request)).toFid, now));
}
