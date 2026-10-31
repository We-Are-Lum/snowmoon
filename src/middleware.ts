import { NextResponse, type NextRequest } from 'next/server';
import { snapRoute } from '~/lib/minpentai/snap/negotiate';

/**
 * The snap links (owner, 2026-10-30; src/lib/minpentai/snap/negotiate.ts): /minpentai, /minpentai/play,
 * challenge links /minpentai/c/<…> and /snap/minpentai.
 * - The snap Accept: passes through; next.config.ts rewrites the three pages to the snap route, and
 *   /snap/minpentai is the snap route.
 * - Farcaster's composer (FCBot): the link's card page without fc:frame / fc:miniapp, with an absolute
 *   Link to the snap (src/app/snap/minpentai/card/route.ts).
 * - Everyone else: the full page and card. /snap/minpentai, which is not a page, shows Play's.
 * Only GET and HEAD; taps (POST) and preflights (OPTIONS, next.config.ts) pass through untouched.
 */
export function middleware(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next();
  const path = request.nextUrl.pathname;
  const route = snapRoute(request.headers.get('accept'), request.headers.get('user-agent'));
  if (route === 'snap') return NextResponse.next();
  if (route === 'composer') {
    // The route handler sees the original URL after a rewrite, so the link's path goes in a header.
    const headers = new Headers(request.headers);
    headers.set('x-snap-card', path);
    return NextResponse.rewrite(new URL('/snap/minpentai/card', request.url), { request: { headers } });
  }
  if (path === '/snap/minpentai') return NextResponse.rewrite(new URL('/minpentai/play', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/minpentai', '/minpentai/play', '/minpentai/c/:seg', '/snap/minpentai'] };
