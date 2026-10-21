import { sender } from '~/lib/minpentai/snap/auth';
import { Unplayable } from '~/lib/minpentai/snap/match';
import { act, intro, MINI_APP, SNAP_PATH, type Here } from '~/lib/minpentai/snap/pages';
import { parse, verified } from '~/lib/minpentai/snap/state';

/**
 * Minpentai as a Farcaster snap (spike, 2026-10-21; docs/proposals/minpentai-snap.md). GET is the
 * tutorial (or a version's "What's different"); every button POSTs here with the signed match in
 * its target. Practice only: nothing is stored or recorded.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEDIA = 'application/vnd.farcaster.snap+json';
/** A preview deployment's bypass, kept on every link so the emulator can reach it. */
const KEEP = ['x-vercel-protection-bypass'];

function here(request: Request): Here {
  const u = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? u.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() ?? u.host;
  return { base: `${proto}://${host}`, keep: KEEP.flatMap((k) => (u.searchParams.has(k) ? [[k, u.searchParams.get(k)!] as [string, string]] : [])) };
}

const snap = (body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': MEDIA, Vary: 'Accept', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', ...extra },
  });

export async function GET(request: Request) {
  const h = here(request);
  const ver = new URL(request.url).searchParams.get('v') ?? '';
  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes(MEDIA)) {
    // A browser: point at the game, and say there is a snap here.
    const link = `<${h.base}${SNAP_PATH}${ver ? `?v=${encodeURIComponent(ver)}` : ''}>; rel="alternate"; type="${MEDIA}"`;
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Minpentai</title><p>Minpentai plays inside a Farcaster cast. <a href="${MINI_APP}">Play it on snowmoon.party</a>.</p>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8', Link: link, Vary: 'Accept' } },
    );
  }
  return snap(intro(h, ver), { 'Cache-Control': 'public, max-age=300' });
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
    const page = act(h, q.get('a') ?? 'start', st, who.fid, who.inputs, q.get('v') ?? '');
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
