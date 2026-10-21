import { play, Unplayable } from '~/lib/minpentai/snap/match';
import { runGif } from '~/lib/minpentai/snap/run';
import { parseRunToken, verified } from '~/lib/minpentai/snap/state';

/**
 * The run that followed a snap turn, as an animated GIF (src/lib/minpentai/snap/run.ts). The link
 * holds the match up to that turn, signed; the same link always draws the same picture, so it is
 * cached for a year at the CDN and in clients.
 */
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const g = q.get('g');
  if (!verified(g, q.get('h'))) return new Response('Not a run', { status: 404 });
  const t = parseRunToken(g!);
  if (!t || !t.turns.length) return new Response('Not a run', { status: 404 });
  try {
    const p = play({ ...t, resigned: false });
    const t0 = performance.now();
    const gif = await runGif(p.runs[t.turns.length - 1], p.R);
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
