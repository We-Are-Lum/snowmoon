import { lookupPfp } from '~/lib/names';

/**
 * /api/pfp/<fid>: a Farcaster account's profile picture, for the avatar in the top bar that opens the
 * You page (owner, 2026-10-18). Served from this site, so the visitor's browser never asks a third
 * party (principle 6: production pages make no third-party requests): our server looks up where the
 * picture is (Farcaster's public API, the FID only) and fetches it, so its host sees our server, not
 * the visitor. Only https, a named host, no redirects, an image type, at most 1 MB. Public data,
 * cached a day. Anything else is 404, and the avatar shows an initial instead.
 * DRAFT: the Privacy line for this is in docs/legal/privacy-you-page-draft.md.
 */
const MAX = 1_000_000;
const TYPES = /^image\/(png|jpeg|webp|gif)$/;

export async function GET(_req: Request, { params }: { params: Promise<{ fid: string }> }) {
  const fid = Number((await params).fid);
  const none = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=3600' } });
  if (!Number.isInteger(fid) || fid <= 0 || fid > 1e10) return none();
  const url = await lookupPfp(fid);
  if (!url) return none();
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) }).catch(() => null);
  const type = res?.headers.get('content-type')?.split(';')[0].trim() ?? '';
  if (!res?.ok || !TYPES.test(type) || Number(res.headers.get('content-length') ?? 0) > MAX) return none();
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX) return none();
  return new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400, s-maxage=86400', 'X-Content-Type-Options': 'nosniff' } });
}
