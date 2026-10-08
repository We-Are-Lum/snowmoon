import { coverUrl, feedXml } from '~/lib/podcast';

/** The podcast feed (src/lib/podcast.ts), built once at deploy time. */
export const dynamic = 'force-static';

export function GET() {
  return new Response(feedXml(coverUrl()), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
