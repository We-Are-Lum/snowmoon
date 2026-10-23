import { NextResponse, type NextRequest } from 'next/server';
import { wantsSnap } from '~/lib/minpentai/snap/negotiate';

/**
 * /minpentai/play, the snap's own link: the snap to anything that doesn't clearly want a web page
 * (src/lib/minpentai/snap/negotiate.ts), the static Play page otherwise. Preflights are routed by
 * next.config.ts. Each request logs its Accept and user agent (cut to 120 characters, nothing else),
 * to see what Farcaster's clients send (owner, 2026-10-23).
 */
export function middleware(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next();
  const accept = request.headers.get('accept');
  const ua = request.headers.get('user-agent');
  const snap = wantsSnap(accept, ua);
  console.log(JSON.stringify({ snapLink: '/minpentai/play', snap, accept: (accept ?? '').slice(0, 120), ua: (ua ?? '').slice(0, 120) }));
  if (!snap) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('x-snap-serve', '1');
  return NextResponse.rewrite(new URL('/snap/minpentai', request.url), { request: { headers } });
}

export const config = { matcher: ['/minpentai/play'] };
