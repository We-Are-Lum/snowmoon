import { sender, viewer } from '~/lib/minpentai/snap/auth';
import { CHALLENGE_PATH, decChallenge, splitChallenge } from '~/lib/minpentai/snap/challenge';
import { Unplayable } from '~/lib/minpentai/snap/match';
import { act, intro, SNAP_PATH, type Here, type Incoming } from '~/lib/minpentai/snap/pages';
import { askOf, wantsSnap } from '~/lib/minpentai/snap/negotiate';
import { drop, load, save } from '~/lib/minpentai/snap/resume';
import { parse, verified } from '~/lib/minpentai/snap/state';

/**
 * Minpentai as a Farcaster snap (spike, 2026-10-21; docs/proposals/minpentai-snap.md). GET is the
 * tutorial (or a version's "What's different", or a challenge); every button POSTs here with the
 * signed match in its target. snowmoon.party/minpentai and its challenge links /minpentai/c/… are
 * rewritten here when the request asks for a snap (next.config.ts); browsers get Play. Practice only: nothing is recorded; each FID's latest match (seed and finished turns)
 * is kept so the first page can offer "Resume" (resume.ts).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEDIA = 'application/vnd.farcaster.snap+json';
/** What the choice between the snap and a page depends on (negotiate.ts). */
const VARY = 'Accept, X-Snap-Payload, Origin';
/** A preview deployment's bypass, kept on every link so the emulator can reach it. */
const KEEP = ['x-vercel-protection-bypass'];

function here(request: Request): Here {
  const u = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? u.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() ?? u.host;
  return { base: `${proto}://${host}`, keep: KEEP.flatMap((k) => (u.searchParams.has(k) ? [[k, u.searchParams.get(k)!] as [string, string]] : [])) };
}

/** A challenge link's segment (?c=, from /minpentai/c/<seg>), if its signature holds. */
function incoming(seg: string | null): Incoming | null {
  const x = seg ? splitChallenge(seg) : null;
  const c = x && verified(x.body, x.sig) ? decChallenge(x.body) : null;
  return c && { c, seg: `${x!.body}.${x!.sig}` };
}

const snap = (body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': MEDIA, Vary: VARY, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', ...extra },
  });

export async function GET(request: Request) {
  const h = here(request);
  const u = new URL(request.url), q = u.searchParams;
  const ver = q.get('v') ?? '';
  // A challenge: ?c=, or the link's own path when the rewrite hands over the original URL.
  const seg = q.get('c') ?? (u.pathname.startsWith(CHALLENGE_PATH) ? u.pathname.slice(CHALLENGE_PATH.length) : null);
  const ch = incoming(seg);
  // The snap only to a request that asks for it or is Farcaster's fetch (negotiate.ts), or one
  // src/middleware.ts forwards from a snap link with x-snap-serve. Everyone else reaching this route
  // directly is sent to Play's page by the middleware; this answer is the fallback if it doesn't run.
  const forced = request.headers.get('x-snap-serve') === '1';
  if (!wantsSnap(askOf(request.headers)) && !forced) {
    // A browser: point at the game, and say there is a snap here.
    const link = `<${h.base}${ch ? CHALLENGE_PATH + ch.seg : SNAP_PATH + (ver ? `?v=${encodeURIComponent(ver)}` : '')}>; rel="alternate"; type="${MEDIA}"`;
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Minpentai</title><p>Minpentai plays inside a Farcaster cast. <a href="${h.base}/minpentai">Play it here</a>.</p>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8', Link: link, Vary: VARY } },
    );
  }
  if (seg && !ch) return Response.json({ error: 'Not a challenge link' }, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  // A challenge's first page is the same for everyone (no Resume on it).
  if (ch) return snap(intro(h, ch.c.ver, 'no', ch), { 'Cache-Control': 'public, max-age=3600', Vary: VARY });
  // A signed viewer (optional): offer Resume only if they have a match kept. Anonymous: always
  // offer it, and the POST (always signed) finds out. A viewer we can't verify (a bad header, the hub
  // down) gets the anonymous page rather than an error, so the cast still shows the snap.
  let who = await viewer(request, h.base);
  if (who && 'error' in who) {
    console.log(JSON.stringify({ snap: 'minpentai', viewer: who.error, status: who.status }));
    who = null;
  }
  const vary = { Vary: VARY };
  if (!who) return snap(intro(h, ver, 'maybe'), { 'Cache-Control': 'public, max-age=300', ...vary });
  const kept = await load(who.fid);
  return snap(intro(h, ver, kept ? 'yes' : 'no'), { 'Cache-Control': 'private, no-store', ...vary });
}

export async function POST(request: Request) {
  const t0 = performance.now();
  const h = here(request);
  const who = await sender(request, h.base);
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status, headers: { 'Access-Control-Allow-Origin': '*' } });
  const t1 = performance.now();
  const q = new URL(request.url).searchParams;
  const s = q.get('s');
  const st = s && verified(s, q.get('h')) ? parse(s) : null;
  try {
    const a = q.get('a') ?? 'start';
    const saved = a === 'resume' ? await load(who.fid) : undefined;
    const { page, keep } = act(h, a, st, who.fid, who.inputs, { ver: q.get('v') ?? '', saved, challenge: incoming(q.get('c'))?.c ?? null });
    if (keep === 'drop') await drop(who.fid);
    else if (keep) await save(who.fid, keep.save);
    const t2 = performance.now();
    const timing = `auth;dur=${(t1 - t0).toFixed(1)}, hub;dur=${who.ms.hub.toFixed(1)}, game;dur=${(t2 - t1).toFixed(1)}`;
    console.log(JSON.stringify({ snap: 'minpentai', a: q.get('a'), fid: who.fid, ms: { auth: +(t1 - t0).toFixed(1), hub: +who.ms.hub.toFixed(1), game: +(t2 - t1).toFixed(1) }, bytes: JSON.stringify(page).length }));
    return snap(page, { 'Server-Timing': timing });
  } catch (e) {
    if (e instanceof Unplayable) return Response.json({ error: e.message }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    throw e;
  }
}

export function OPTIONS() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
}
