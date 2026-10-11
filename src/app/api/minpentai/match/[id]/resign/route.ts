import { play } from '~/lib/minpentai/play-server/route';
import { onMatch } from '~/lib/minpentai/play-server/store';

type Ctx = { params: Promise<{ id: string }> };

/** Resign: counts as a loss → MatchView. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  return play(request, async ({ sql, fid, now }) => onMatch(sql, fid, id, now, 'resign'));
}
