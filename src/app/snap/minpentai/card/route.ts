/**
 * What Farcaster's composer (user agent "FCBot") gets on a snap link (owner, 2026-10-30): the link's own page
 * reduced to its title and card tags (description, og:*, twitter:*), without fc:frame / fc:miniapp, and an
 * absolute Link header to the snap at the same address. With the fc: tags the composer shows a mini app
 * card; without them it shows the snap (the owner's composer test of 2026-10-30). src/middleware.ts sends
 * only FCBot's GET and HEAD requests here, for the four snap links; anything else is refused.
 */
const SNAP = 'application/vnd.farcaster.snap+json';
const CHALLENGE = /^\/minpentai\/c\/[^/?#]{1,200}$/;

export async function GET(request: Request) {
  // The link's path: from src/middleware.ts's x-snap-card header (a rewritten request keeps its original URL).
  const u = new URL(request.url), p = request.headers.get('x-snap-card') ?? '';
  if (!['/minpentai', '/minpentai/play', '/snap/minpentai'].includes(p) && !CHALLENGE.test(p)) return new Response('Not found', { status: 404 });
  const base = `${u.protocol}//${u.host}`;
  // The page the link shows a browser (/snap/minpentai shows Play's), fetched as a browser so the middleware
  // serves the full page; its card tags are kept as they are.
  const from = p === '/snap/minpentai' ? '/minpentai/play' : p;
  const page = await fetch(`${base}${from}`, { headers: { Accept: 'text/html', 'User-Agent': 'snowmoon-composer-card' }, cache: 'no-store' });
  const html = await page.text();
  const keep = (html.match(/<meta (?:name|property)="(?:og:[^"]+|twitter:[^"]+|description)"[^>]*>/g) ?? []).join('');
  const title = html.match(/<title>[^<]*<\/title>/)?.[0] ?? '<title>Minpentai</title>';
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${title}${keep}</head><body><p>Minpentai plays inside a Farcaster cast. <a href="${base}${p}">Open it</a>.</p></body></html>`;
  return new Response(body, {
    status: page.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      Link: `<${base}${p}>; rel="alternate"; type="${SNAP}"`,
      'Cache-Control': 'no-store',
      Vary: 'Accept, User-Agent',
    },
  });
}
