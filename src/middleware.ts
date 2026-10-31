import { NextResponse, type NextRequest } from 'next/server';
import { prefersHtml, wantsSnap } from '~/lib/minpentai/snap/negotiate';

/**
 * /minpentai/play, the snap's own link: the snap to anything that doesn't clearly want a web page
 * (src/lib/minpentai/snap/negotiate.ts), the static Play page otherwise. Preflights are routed by
 * next.config.ts. Routing unchanged on 2026-10-30.
 *
 * DIAGNOSTIC (owner, 2026-10-30): every request to the four snap links (/minpentai, /minpentai/play,
 * /snap/minpentai and challenge links /minpentai/c/<…>), any method, logs the headers that could tell
 * Farcaster's fetches apart: Accept, whether X-Snap-Payload is present, Origin, Sec-Fetch-Mode and the
 * user agent (each cut short; no cookies, tokens, IPs or bodies). Only /minpentai/play's GETs are
 * routed here, as before; every other request passes through untouched. Removed when the rule flips.
 */
export function middleware(request: NextRequest) {
  const h = request.headers;
  const path = request.nextUrl.pathname;
  const routed = path === '/minpentai/play' && (request.method === 'GET' || request.method === 'HEAD');
  const accept = h.get('accept');
  const ua = h.get('user-agent');
  const snap = routed ? wantsSnap(accept, ua) : null;
  console.log(JSON.stringify({
    snapLog: path.startsWith('/minpentai/c/') ? '/minpentai/c/*' : path,
    method: request.method,
    snap,
    accept: (accept ?? '').slice(0, 120),
    payload: h.has('x-snap-payload'),
    origin: (h.get('origin') ?? '').slice(0, 60),
    mode: (h.get('sec-fetch-mode') ?? '').slice(0, 20),
    ua: (ua ?? '').slice(0, 160),
  }));
  // TEMPORARY EXPERIMENT (owner, 2026-10-30): only Farcaster's composer fetcher (user agent "FCBot") with ?x=1, 2
  // or 3 on /minpentai/play, to find what makes the composer show a snap (src/app/snap/minpentai/probe/route.ts).
  // Every other request is routed exactly as before. Removed once the rule is chosen.
  const x = request.nextUrl.searchParams.get('x');
  if (routed && /FCBot/.test(ua ?? '') && (x === '1' || x === '2' || x === '3')) {
    if (x === '3' && !prefersHtml(accept ?? '')) {
      const fwd = new Headers(h);
      fwd.set('x-snap-serve', '1');
      return NextResponse.rewrite(new URL('/snap/minpentai', request.url), { request: { headers: fwd } });
    }
    return NextResponse.rewrite(new URL(`/snap/minpentai/probe?x=${x}`, request.url));
  }
  if (!routed || !snap) return NextResponse.next();
  const headers = new Headers(h);
  headers.set('x-snap-serve', '1');
  return NextResponse.rewrite(new URL('/snap/minpentai', request.url), { request: { headers } });
}

export const config = { matcher: ['/minpentai', '/minpentai/play', '/minpentai/c/:seg', '/snap/minpentai'] };
