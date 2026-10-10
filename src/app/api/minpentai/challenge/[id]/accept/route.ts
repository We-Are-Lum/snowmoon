import { play } from '~/lib/minpentai/play-server/route';
import { acceptChallenge } from '~/lib/minpentai/play-server/store';

type Ctx = { params: Promise<{ id: string }> };

/** Accept a challenge to me → { matchId }. The challenger plays Cyan, I play Amber. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  return play(request, ({ sql, fid, now }) => acceptChallenge(sql, fid, id, now));
}
