import { body, play, verifiedName } from '~/lib/minpentai/play-server/route';
import { acceptInvite } from '~/lib/minpentai/play-server/store';

type Ctx = { params: Promise<{ token: string }> };

/** Accept an invite {nameProof} → { matchId }. Not your own; one use. The inviter plays Cyan. */
export async function POST(request: Request, { params }: Ctx) {
  const { token } = await params;
  return play(request, async ({ sql, fid, now }) => {
    const { nameProof } = await body(request);
    return acceptInvite(sql, fid, await verifiedName(fid, nameProof), token, now);
  });
}
