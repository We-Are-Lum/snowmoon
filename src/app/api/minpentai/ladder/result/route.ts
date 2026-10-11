import { body, play } from '~/lib/minpentai/play-server/route';
import { postLadder } from '~/lib/minpentai/play-server/store';

/** Record a ladder try (LadderResultBody): the rung must be open. Returns LadderProgress. */
export async function POST(request: Request) {
  return play(request, async ({ sql, fid }) => postLadder(sql, fid, await body(request)));
}
