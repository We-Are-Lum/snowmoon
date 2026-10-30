import { NextResponse, type NextRequest } from 'next/server';
import { askOf, wantsSnap } from '~/lib/minpentai/snap/negotiate';

/**
 * The snap links (owner, 2026-10-30): the snap only to a request that asks for it or comes from
 * Farcaster's fetch (src/lib/minpentai/snap/negotiate.ts), the web page with its share card to everyone
 * else. /minpentai, /minpentai/play and challenge links /minpentai/c/<…> are pages that rewrite to the
 * snap; /snap/minpentai (the launch cast) is the snap route, which rewrites to Play's page (and its
 * card) for everyone else. Preflights are routed by next.config.ts.
 *
 * DIAGNOSTIC, to remove after the owner's composer check: each GET logs which of the three signals it
 * carried, its Accept and user agent (cut to 120 characters, nothing else), to see what Farcaster sends.
 */
export function middleware(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next();
  const path = request.nextUrl.pathname;
  const ask = askOf(request.headers);
  const snap = wantsSnap(ask);
  console.log(JSON.stringify({ snapLink: path, snap, accept: (ask.accept ?? '').slice(0, 120), payload: !!ask.payload, origin: (ask.origin ?? '').slice(0, 60), ua: (request.headers.get('user-agent') ?? '').slice(0, 120) }));
  if (path === '/snap/minpentai') return snap ? NextResponse.next() : NextResponse.rewrite(new URL('/minpentai/play', request.url));
  if (!snap) return NextResponse.next();
  const to = new URL('/snap/minpentai', request.url);
  if (path.startsWith('/minpentai/c/')) to.searchParams.set('c', path.slice('/minpentai/c/'.length));
  const headers = new Headers(request.headers);
  headers.set('x-snap-serve', '1');
  return NextResponse.rewrite(to, { request: { headers } });
}

export const config = { matcher: ['/minpentai', '/minpentai/play', '/minpentai/c/:seg', '/snap/minpentai'] };
