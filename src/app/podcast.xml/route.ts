import { feedXml } from '~/lib/podcast';
import podcast from '../../../config/podcast.json';

/** The podcast feed (src/lib/podcast.ts), built once at deploy time. */
export const dynamic = 'force-static';

export function GET() {
  const cover = (podcast as { cover_url?: string }).cover_url ?? null;
  return new Response(feedXml(cover), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
