import { play } from '~/lib/minpentai/play-server/route';
import { onMatch } from '~/lib/minpentai/play-server/store';

type Ctx = { params: Promise<{ id: string }> };

/** My view of the match (MatchView); 204 when ?v= is the current version. Polling counts as being there. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const raw = new URL(request.url).searchParams.get('v');
  const v = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  return play(request, async ({ sql, fid, now }) => {
    const out = await onMatch(sql, fid, id, now, null, undefined, v);
    return out === 'unchanged' ? new Response(null, { status: 204 }) : out;
  });
}
