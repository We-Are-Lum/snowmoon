/**
 * Who sent a snap POST (https://docs.farcaster.xyz/snap/auth): the JFS envelope parsed and its
 * payload checked by @farcaster/snap's parseRequest (schema, timestamp skew, audience), the
 * signature checked by @farcaster/jfs, and the signing key looked up on a hub. The lookup is the
 * slow part (a request to the hub), so each FID's active keys are kept for five minutes; an
 * unknown key refreshes them once.
 *
 * SNAP_SKIP_JFS=1 skips the signature in development only (`next dev`), for curl and the tests.
 */
import { verify } from '@farcaster/jfs';
import { DEFAULT_SNAP_HUB_HTTP_BASE_URL, getActiveEd25519SignerKeysFromHubHttp, parseJfs, parseRequest } from '@farcaster/snap/server';

const KEEP_MS = 5 * 60_000;
const keys = new Map<number, { at: number; hex: Set<string> }>();

async function activeKeys(fid: number, fresh: boolean): Promise<Set<string> | null> {
  const k = keys.get(fid);
  if (k && !fresh && Date.now() - k.at < KEEP_MS) return k.hex;
  const r = await getActiveEd25519SignerKeysFromHubHttp(DEFAULT_SNAP_HUB_HTTP_BASE_URL, fid);
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
  let t2 = t1, t3 = t1;
  if (!(process.env.SNAP_SKIP_JFS === '1' && process.env.NODE_ENV !== 'production')) {
    const jfs = parseJfs(body);
    if (!jfs.ok) return { ok: false, status: 400, error: 'invalid_json' };
    try {
      await verify({ data: jfs.jfs, strict: true, keyTypes: ['app_key'] });
    } catch {
      return { ok: false, status: 401, error: 'signature' };
    }
    t2 = performance.now();
    const header = JSON.parse(Buffer.from(jfs.jfs.header, 'base64url').toString()) as { fid: number; key: string };
    if (header.fid !== user.fid) return { ok: false, status: 401, error: 'fid_mismatch' };
    const key = header.key.replace(/^0x/, '').toLowerCase();
    let active = await activeKeys(header.fid, false);
    if (active && !active.has(key)) active = await activeKeys(header.fid, true);
    if (!active) return { ok: false, status: 503, error: 'hub unavailable' };
    if (!active.has(key)) return { ok: false, status: 401, error: 'signer not active' };
    t3 = performance.now();
  }
  return { ok: true, fid: user.fid, inputs: inputs as Record<string, unknown>, ms: { parse: t1 - t0, sig: t2 - t1, hub: t3 - t2 } };
}
