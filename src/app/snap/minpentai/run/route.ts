import { play, Unplayable } from '~/lib/minpentai/snap/match';
import { boardGif, runGif } from '~/lib/minpentai/snap/run';
import { fullBoard } from '~/lib/minpentai/play-server/match';
import { parseRunToken, verified } from '~/lib/minpentai/snap/state';

/**
 * The run that followed a snap turn, as an animated GIF (src/lib/minpentai/snap/run.ts). The link
 * holds the match up to that turn, signed; the same link always draws the same picture, so it is
 * cached for a year at the CDN and in clients. `r=1` draws it unfogged, only for a match that is
 * over (the run that ended it, or the board where the player resigned).
 */
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const g = q.get('g');
  if (!verified(g, q.get('h'))) return new Response('Not a run', { status: 404 });
  const t = parseRunToken(g!);
  const reveal = q.get('r') === '1';
  if (!t || (!t.turns.length && !(reveal && t.resigned))) return new Response('Not a run', { status: 404 });
  try {
    const p = play(t);
    if (reveal && !p.over) return new Response('Not over', { status: 404 });
    const t0 = performance.now();
    const gif = t.turns.length ? await runGif(p.runs[t.turns.length - 1], p.R, reveal) : await boardGif(fullBoard(p.w), p.R);
    return new Response(new Uint8Array(gif), {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Server-Timing': `gif;dur=${(performance.now() - t0).toFixed(1)}`,
      },
    });
  } catch (e) {
    if (e instanceof Unplayable) return new Response('Not a run', { status: 404 });
    throw e;
  }
}
