import { play } from '~/lib/minpentai/play-server/route';
import { readInvite } from '~/lib/minpentai/play-server/store';

type Ctx = { params: Promise<{ token: string }> };

/** Who sent the invite, and whether it is still open → { from, open }. */
export async function GET(request: Request, { params }: Ctx) {
  const { token } = await params;
  return play(request, ({ sql, fid, now }) => readInvite(sql, fid, token, now));
}
