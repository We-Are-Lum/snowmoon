/**
 * Who sent a snap POST (https://docs.farcaster.xyz/snap/auth): the JFS envelope parsed and its
 * payload checked by @farcaster/snap's parseRequest (schema, timestamp skew, audience), the
 * signature checked by @farcaster/jfs, and the signing key looked up on Neynar's hub (owner,
 * 2026-10-22: Privacy §7 names Neynar), with the site's NEYNAR_API_KEY. Without the key, a
 * deployment other than production asks Farcaster's own hub instead (development, the test
 * project); production without it answers 503 rather than ask a hub Privacy doesn't name. The lookup is the
 * slow part (a request to the hub), so each FID's active keys are kept for five minutes; an
 * unknown key refreshes them once.
 *
 * The same check reads the optional signed viewer on a GET (viewer), for the first page's Resume.
 *
 * SNAP_SKIP_JFS=1 skips the signature in development only (`next dev`), for curl and the tests.
 */
import { verify } from '@farcaster/jfs';
import { DEFAULT_SNAP_HUB_HTTP_BASE_URL, getActiveEd25519SignerKeysFromHubHttp, parseJfs, parseRequest } from '@farcaster/snap/server';

const KEEP_MS = 5 * 60_000;
export const NEYNAR_HUB = 'https://hub-api.neynar.com';

/** Which hub to ask, or null when production has no Neynar key. */
function hub(): { base: string; fetchFn?: typeof fetch } | null {
  const key = process.env.NEYNAR_API_KEY;
  if (key) return { base: NEYNAR_HUB, fetchFn: (url, init) => fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), 'x-api-key': key } }) };
  return process.env.VERCEL_ENV === 'production' ? null : { base: DEFAULT_SNAP_HUB_HTTP_BASE_URL };
}
const keys = new Map<number, { at: number; hex: Set<string> }>();

async function activeKeys(fid: number, fresh: boolean): Promise<Set<string> | null> {
  const k = keys.get(fid);
  if (k && !fresh && Date.now() - k.at < KEEP_MS) return k.hex;
  const h = hub();
  if (!h) return null;
  const r = await getActiveEd25519SignerKeysFromHubHttp(h.base, fid, { fetchFn: h.fetchFn, signal: AbortSignal.timeout(3000) });
  if (!r.ok) return null;
  const hex = new Set(r.signers.map((s) => Buffer.from(s.publicKey).toString('hex')));
  keys.set(fid, { at: Date.now(), hex });
  return hex;
}

export type Sender = { ok: true; fid: number; inputs: Record<string, unknown>; ms: { parse: number; sig: number; hub: number } } | { ok: false; status: number; error: string };

export async function sender(request: Request, origin: string): Promise<Sender> {
  const t0 = performance.now();
  const body = await request.text();
  const parsed = await parseRequest(new Request(request.url, { method: 'POST', headers: request.headers, body }), { skipJFSVerification: true, requestOrigin: origin });
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.type };
  if (parsed.action.type !== 'post') return { ok: false, status: 400, error: 'not a snap post' };
  const { user, inputs } = parsed.action;
  const t1 = performance.now();
  const sig = await signature(body, user.fid);
  if (!sig.ok) return sig;
  const t3 = performance.now();
  return { ok: true, fid: user.fid, inputs: inputs as Record<string, unknown>, ms: { parse: t1 - t0, sig: sig.sigMs, hub: t3 - t1 - sig.sigMs } };
}

/** Check a JFS (JSON or compact) is signed by an active key of `fid`. Skipped only in development. */
async function signature(jfsText: string, fid: number): Promise<{ ok: true; sigMs: number } | { ok: false; status: number; error: string }> {
  if (process.env.SNAP_SKIP_JFS === '1' && process.env.NODE_ENV !== 'production') return { ok: true, sigMs: 0 };
  const t0 = performance.now();
  const jfs = parseJfs(jfsText);
  if (!jfs.ok) return { ok: false, status: 400, error: 'invalid_json' };
  try {
    await verify({ data: jfs.jfs, strict: true, keyTypes: ['app_key'] });
  } catch {
    return { ok: false, status: 401, error: 'signature' };
  }
  const sigMs = performance.now() - t0;
  const header = JSON.parse(Buffer.from(jfs.jfs.header, 'base64url').toString()) as { fid: number; key: string };
  if (header.fid !== fid) return { ok: false, status: 401, error: 'fid_mismatch' };
  const key = header.key.replace(/^0x/, '').toLowerCase();
  let active = await activeKeys(header.fid, false);
  if (active && !active.has(key)) active = await activeKeys(header.fid, true);
  if (!active) return { ok: false, status: 503, error: 'hub unavailable' };
  if (!active.has(key)) return { ok: false, status: 401, error: 'signer not active' };
  return { ok: true, sigMs };
}

/**
 * Who is viewing a GET, if the client said (X-Snap-Payload, optional and never guaranteed): null
 * when anonymous, an error when the header is there but bad (the spec asks for a 4xx then).
 */
export async function viewer(request: Request, origin: string): Promise<{ fid: number } | null | { error: string; status: number }> {
  const header = request.headers.get('x-snap-payload')?.trim();
  if (!header) return null;
  const parsed = await parseRequest(request, { skipJFSVerification: true, requestOrigin: origin });
  if (!parsed.success || parsed.action.type !== 'get' || !parsed.action.user) return { error: parsed.success ? 'no user' : parsed.error.type, status: 400 };
  const sig = await signature(header, parsed.action.user.fid);
  return sig.ok ? { fid: parsed.action.user.fid } : { error: sig.error, status: sig.status };
}
