import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import sharp from 'sharp';
import { BOUNTY_REVIEW as B } from '../config';

/**
 * A claim's picture, for /admin/bounty only (owner, 2026-11-23; branch bounty-review; ported from warplore's
 * lib/comic/remote-image.ts). Fetched on the server, so an admin's browser never asks the claimer's host for anything
 * (P6: the page loads only from this site), and drawn again as a JPEG, so what the browser gets is plain pixels.
 *
 * THE URL IS A STRANGER'S. Anyone can claim with any tokenURI. So, on every fetch (the metadata and the image):
 * - https only (ipfs:// is read through BOUNTY_REVIEW.ipfsGateway), to a host name, never an address, localhost or an
 *   internal name; the name must not resolve to a private, loopback or link-local address;
 * - redirects followed by hand, at most MAX_HOPS, each checked the same way before it is asked;
 * - the body read as a stream and dropped past MAX_BYTES (content-length isn't trusted);
 * - sharp refuses anything over MAX_PIXELS before decoding.
 * Anything that trips one of these is "picture not readable", and the claim is still listed.
 */
export const MAX_BYTES = 12 * 1024 * 1024;
export const MAX_HOPS = 3;
export const MAX_PIXELS = 40_000_000;
const TIMEOUT_MS = 15_000;

/** Null if the URL may not be fetched. */
export function allowedUrl(raw: string, base?: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(host)) return null;
  if (isIP(host.replace(/^\[|\]$/g, '')) || host.startsWith('[')) return null;
  return u;
}

/** Whether an address is one a stranger's URL must never reach. */
export function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateAddress(v.slice(7));
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
}

export type Resolve = (host: string) => Promise<string[]>;
const resolveHost: Resolve = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** GET with checked, hand-followed redirects and a streamed byte cap. Throws on any breach. */
export async function cappedFetch(raw: string, opts: { resolve?: Resolve; fetcher?: typeof fetch } = {}): Promise<{ url: string; contentType: string; body: Buffer }> {
  const resolve = opts.resolve ?? resolveHost;
  const fetcher = opts.fetcher ?? fetch;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = allowedUrl(raw);
  for (let hop = 0; ; hop++) {
    if (!url) throw new Error('url not allowed');
    const addrs = await resolve(url.hostname);
    if (!addrs.length || addrs.some(privateAddress)) throw new Error('host not allowed');
    const res = await fetcher(url, { redirect: 'manual', signal, headers: { accept: 'image/*, application/json;q=0.9' } });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      const next = res.headers.get('location');
      if (!next || hop >= MAX_HOPS) throw new Error('redirect not followed');
      url = allowedUrl(next, url.href);
      continue;
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      throw new Error(`status ${res.status}`);
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > MAX_BYTES) {
        await reader.cancel();
        throw new Error('too large');
      }
      chunks.push(value);
    }
    return { url: url.href, contentType: res.headers.get('content-type') ?? '', body: Buffer.concat(chunks) };
  }
}

export const toHttps = (u: string) => (u.startsWith('ipfs://') ? `${B.ipfsGateway}${u.slice(7).replace(/^ipfs\//, '')}` : u);

const looksLikeImage = (b: Buffer) =>
  (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.subarray(0, 4).toString('latin1') === 'RIFF' || b.subarray(0, 3).toString('latin1') === 'GIF' || b.subarray(4, 12).toString('latin1').includes('ftyp');

/**
 * The picture a claim's tokenURI names, drawn again as a JPEG at most `size` px on its long side; and the address it
 * came from. A tokenURI may be JSON naming an image (poidh's own claims) or the image itself. Null if unreadable.
 */
export async function claimPicture(tokenUri: string, size = 1200, opts: { resolve?: Resolve; fetcher?: typeof fetch } = {}): Promise<{ jpeg: Buffer; from: string } | null> {
  try {
    let got = await cappedFetch(toHttps(tokenUri), opts);
    if (!got.contentType.startsWith('image/') && !looksLikeImage(got.body)) {
      const meta = JSON.parse(got.body.toString('utf8')) as { image?: unknown };
      if (typeof meta.image !== 'string') return null;
      got = await cappedFetch(toHttps(meta.image), opts);
    }
    const jpeg = await sharp(got.body, { limitInputPixels: MAX_PIXELS }).rotate().resize(size, size, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return { jpeg, from: got.url };
  } catch {
    return null;
  }
}
