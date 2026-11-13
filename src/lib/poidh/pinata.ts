import 'server-only';

/**
 * Pinning a backstory's claim to IPFS through Pinata, on the server only (ported from warplore's lib/comic/pinata.ts).
 * PINATA_JWT is a key the owner adds to Vercel himself, ideally scoped to exactly pinFileToIPFS and pinJSONToIPFS; it is
 * read by name only, never printed, logged or sent anywhere but Pinata's API. PINATA_GATEWAY (optional) is the
 * account's dedicated gateway host; unset, Pinata's public gateway. Without PINATA_JWT nothing is pinned and the caller
 * answers "not set up yet".
 *
 * The link is an https gateway URL (`https://<gateway>/ipfs/<cid>`), in poidh's own form: poidh.xyz fetches the claim's
 * URI over http, so an ipfs:// URI wouldn't show there.
 */
const API = 'https://api.pinata.cloud/pinning';

export const pinataReady = () => Boolean(process.env.PINATA_JWT);

export function gatewayUrl(cid: string): string {
  const host = (process.env.PINATA_GATEWAY || 'gateway.pinata.cloud').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${host}/ipfs/${cid}`;
}

export type Pinned = { ok: true; cid: string; url: string } | { ok: false; error: string };

async function post(path: string, body: BodyInit, json: boolean): Promise<Pinned> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return { ok: false, error: 'not-set-up' };
  try {
    const res = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}`, ...(json ? { 'content-type': 'application/json' } : {}) },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { ok: false, error: `pinata ${res.status}` };
    const v = (await res.json()) as { IpfsHash?: string };
    if (!v.IpfsHash || !/^[A-Za-z0-9]+$/.test(v.IpfsHash)) return { ok: false, error: 'pinata returned no hash' };
    return { ok: true, cid: v.IpfsHash, url: gatewayUrl(v.IpfsHash) };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.name ?? 'error').slice(0, 60) };
  }
}

export function pinFile(bytes: Uint8Array, name: string, type: string): Promise<Pinned> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
  form.append('pinataMetadata', JSON.stringify({ name }));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  return post('pinFileToIPFS', form, false);
}

export function pinJson(content: unknown, name: string): Promise<Pinned> {
  return post('pinJSONToIPFS', JSON.stringify({ pinataContent: content, pinataMetadata: { name }, pinataOptions: { cidVersion: 1 } }), true);
}
