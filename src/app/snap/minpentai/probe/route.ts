/**
 * TEMPORARY EXPERIMENT (owner, 2026-10-30): what makes Farcaster's composer show /minpentai/play as a snap.
 * src/middleware.ts sends a request here only when its user agent contains "FCBot" (the composer's fetcher)
 * and its URL has ?x=1, 2 or 3; nothing else ever reaches this route. Removed once the rule is chosen.
 *
 *   x=1  Play's page exactly as today, but with an absolute Link header.
 *   x=2  A minimal page like /snap/minpentai's: absolute Link, the og/twitter card tags, no fc:frame or fc:miniapp.
 *   x=3  (only HTML requests reach here) the same as x=2; the composer's non-HTML request gets the snap itself
 *        (the middleware rewrites that one to the snap route).
 */
const SNAP = 'application/vnd.farcaster.snap+json';

export async function GET(request: Request) {
  const u = new URL(request.url), x = u.searchParams.get('x');
  const base = `${u.protocol}//${u.host}`;
  const link = `<${base}/minpentai/play>; rel="alternate"; type="${SNAP}"`;
  const headers = { 'Content-Type': 'text/html; charset=utf-8', Link: link, 'Cache-Control': 'no-store', Vary: 'Accept, User-Agent' };
  // Play's own page, fetched as a browser would (not FCBot, no ?x), so the middleware leaves it alone.
  const page = await fetch(`${base}/minpentai/play`, { headers: { Accept: 'text/html', 'User-Agent': 'snowmoon-fcbot-probe' }, cache: 'no-store' });
  const html = await page.text();
  if (x === '1') return new Response(html, { status: page.status, headers });
  // x=2 and x=3: keep only the card tags (title, description, og:*, twitter:*), drop fc:frame and fc:miniapp.
  const keep = (html.match(/<meta (?:name|property)="(?:og:[^"]+|twitter:[^"]+|description)"[^>]*>/g) ?? []).join('');
  const title = html.match(/<title>[^<]*<\/title>/)?.[0] ?? '<title>Minpentai</title>';
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${title}${keep}</head><body><p>Minpentai plays inside a Farcaster cast. <a href="${base}/minpentai/play">Play it here</a>.</p></body></html>`;
  return new Response(body, { status: 200, headers });
}

