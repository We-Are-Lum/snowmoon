import { body, play, verifiedName } from '~/lib/minpentai/play-server/route';
import { goReady } from '~/lib/minpentai/play-server/store';

/** Ready for 3 minutes {nameProof}; repeat to stay. Needs a verified username. Returns LobbyView. */
export async function POST(request: Request) {
  return play(request, async ({ sql, fid, now }) => {
    const { nameProof } = await body(request);
    return goReady(sql, fid, await verifiedName(fid, nameProof), now);
  });
}
