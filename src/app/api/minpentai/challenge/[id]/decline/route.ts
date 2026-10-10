import { play } from '~/lib/minpentai/play-server/route';
import { declineChallenge } from '~/lib/minpentai/play-server/store';

type Ctx = { params: Promise<{ id: string }> };

/** Decline a challenge to me, or take back my own → { ok }. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  return play(request, ({ sql, fid, now }) => declineChallenge(sql, fid, id, now));
}
