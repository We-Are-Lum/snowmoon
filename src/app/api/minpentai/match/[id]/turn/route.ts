import { body, play } from '~/lib/minpentai/play-server/route';
import { onMatch } from '~/lib/minpentai/play-server/store';

type Ctx = { params: Promise<{ id: string }> };

/** Replace my placements for this turn to act (TurnBody) → MatchView. 409 outside my act phase. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  return play(request, async ({ sql, fid, now }) => onMatch(sql, fid, id, now, 'turn', await body(request)));
}
