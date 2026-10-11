import { body, play, verifiedName } from '~/lib/minpentai/play-server/route';
import { createInvite } from '~/lib/minpentai/play-server/store';

/** A new invite link {nameProof} → { token }; the link is /minpentai?invite=<token>. One use, 24 h. */
export async function POST(request: Request) {
  return play(request, async ({ sql, fid, now }) => {
    const { nameProof } = await body(request);
    return createInvite(sql, fid, await verifiedName(fid, nameProof), now);
  });
}
