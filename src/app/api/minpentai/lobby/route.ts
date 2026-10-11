import { play } from '~/lib/minpentai/play-server/route';
import { lobbyView, stopReady } from '~/lib/minpentai/play-server/store';

/** The lobby (LobbyView): other ready players by username, challenges, my open match. */
export async function GET(request: Request) {
  return play(request, ({ sql, fid, now }) => lobbyView(sql, fid, now));
}

/** Stop being ready; open challenges from and to me are cancelled. Returns LobbyView. */
export async function DELETE(request: Request) {
  return play(request, ({ sql, fid, now }) => stopReady(sql, fid, now));
}
