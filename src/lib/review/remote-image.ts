import 'server-only';
import { lookup } from 'node:dns/promises';
import { get as httpsGet } from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { LookupFunction } from 'node:net';
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
 *   internal name;
 * - the address the connection actually uses must not be private, loopback or link-local (owner, 2026-11-23: DNS
 *   rebinding). The check is in the connection's own DNS lookup (node:https's `lookup` option, on every hop), not a
 *   separate lookup before it, so a host can't answer the check with a public address and the connection with a
 *   private one. Node's own https is used rather than undici's Agent: undici isn't one of the site's dependencies, and
 *   the `lookup` hook is the same thing (the address the socket connects to);
 * - redirects followed by hand, at most MAX_HOPS, each checked the same way;
 * - the body read as a stream and dropped past MAX_BYTES (content-length isn't trusted);
 * - only raster pictures (owner, 2026-11-23): JPEG, PNG, WebP, GIF or AVIF, known by their bytes and confirmed by
 *   sharp's own reading, never SVG or anything else; sharp refuses anything over MAX_PIXELS before decoding.
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
  return isIP(v) !== 6 || v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
}

export type Resolve = (host: string) => Promise<string[]>;
const resolveHost: Resolve = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/**
 * The connection's own DNS lookup: the addresses the socket will use, refused if any is private. Answers both ways
 * Node asks (one address, or all of them for happy eyeballs).
 */
export function guardedLookup(resolve: Resolve = resolveHost): LookupFunction {
  return ((hostname: string, options: { all?: boolean } | number | undefined, cb: (...a: unknown[]) => void) => {
    const all = typeof options === 'object' && options !== null && options.all === true;
    resolve(hostname).then(
      (addrs) => {
        if (!addrs.length || addrs.some(privateAddress)) return cb(Object.assign(new Error('host not allowed'), { code: 'EHOSTNOTALLOWED' }));
        const list = addrs.map((address) => ({ address, family: isIP(address) }));
        return all ? cb(null, list) : cb(null, list[0].address, list[0].family);
      },
      (e) => cb(e),
    );
  }) as unknown as LookupFunction;
}

/** One GET over node:https, connecting only where guardedLookup allows. */
export type Getter = (url: URL, signal: AbortSignal) => Promise<{ status: number; location: string | null; contentType: string; body: AsyncIterable<Uint8Array>; cancel: () => void }>;
export function httpsGetter(resolve: Resolve = resolveHost): Getter {
  const lookupFn = guardedLookup(resolve);
  return (url, signal) =>
    new Promise((ok, fail) => {
      const req = httpsGet(url, { lookup: lookupFn, agent: false, signal, headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,application/json;q=0.9' } }, (res: IncomingMessage) =>
        ok({
          status: res.statusCode ?? 0,
          location: typeof res.headers.location === 'string' ? res.headers.location : null,
          contentType: String(res.headers['content-type'] ?? ''),
          body: res,
          cancel: () => res.destroy(),
        }),
      );
      req.on('error', fail);
    });
}

/** GET with checked, hand-followed redirects and a streamed byte cap. Throws on any breach. */
export async function cappedFetch(raw: string, opts: { resolve?: Resolve; getter?: Getter } = {}): Promise<{ url: string; contentType: string; body: Buffer }> {
  const getter = opts.getter ?? httpsGetter(opts.resolve);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = allowedUrl(raw);
  for (let hop = 0; ; hop++) {
    if (!url) throw new Error('url not allowed');
    const res = await getter(url, signal);
    if (res.status >= 300 && res.status < 400) {
      res.cancel();
      if (!res.location || hop >= MAX_HOPS) throw new Error('redirect not followed');
      url = allowedUrl(res.location, url.href);
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      res.cancel();
      throw new Error(`status ${res.status}`);
    }
    const chunks: Uint8Array[] = [];
    let n = 0;
    for await (const value of res.body) {
      n += value.byteLength;
      if (n > MAX_BYTES) {
        res.cancel();
        throw new Error('too large');
      }
      chunks.push(value);
    }
    return { url: url.href, contentType: res.contentType, body: Buffer.concat(chunks) };
  }
}

export const toHttps = (u: string) => (u.startsWith('ipfs://') ? `${B.ipfsGateway}${u.slice(7).replace(/^ipfs\//, '')}` : u);

export type Raster = 'jpeg' | 'png' | 'webp' | 'gif' | 'avif';
/** The raster kind these bytes start with, or null (SVG, HTML, JSON, HEIC and anything else). */
export function rasterKind(b: Buffer): Raster | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1'))) return 'gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.length >= 16 && b.subarray(4, 8).toString('latin1') === 'ftyp') {
    const size = Math.min(b.readUInt32BE(0), b.length, 256);
    const brands = [b.subarray(8, 12).toString('latin1')];
    for (let i = 16; i + 4 <= size; i += 4) brands.push(b.subarray(i, i + 4).toString('latin1'));
    if (brands.includes('avif') || brands.includes('avis')) return 'avif';
  }
  return null;
}
/** sharp's name for each raster kind (AVIF is read by sharp's HEIF reader, with AV1 compression). */
const SHARP_FORMAT: Record<Raster, string> = { jpeg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif', avif: 'heif' };

/**
 * The picture a claim's tokenURI names, drawn again as a JPEG at most `size` px on its long side; and the address it
 * came from. A tokenURI may be JSON naming an image (poidh's own claims) or the image itself. Null if unreadable or
 * not one of the five raster kinds.
 */
export async function claimPicture(tokenUri: string, size = 1200, opts: { resolve?: Resolve; getter?: Getter } = {}): Promise<{ jpeg: Buffer; from: string; kind: Raster } | null> {
  try {
    let got = await cappedFetch(toHttps(tokenUri), opts);
    let kind = rasterKind(got.body);
    if (!kind) {
      // Not a picture: only JSON naming one goes on (an image/* type, SVG or HTML here is refused).
      if (/^image\//i.test(got.contentType) || /^\s*</.test(got.body.subarray(0, 64).toString('utf8'))) return null;
      const meta = JSON.parse(got.body.toString('utf8')) as { image?: unknown };
      if (typeof meta.image !== 'string') return null;
      got = await cappedFetch(toHttps(meta.image), opts);
      kind = rasterKind(got.body);
      if (!kind) return null;
    }
    const img = sharp(got.body, { limitInputPixels: MAX_PIXELS });
    const meta = await img.metadata();
    if (meta.format !== SHARP_FORMAT[kind] || (kind === 'avif' && meta.compression !== 'av1')) return null;
    const jpeg = await img.rotate().resize(size, size, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return { jpeg, from: got.url, kind };
  } catch {
    return null;
  }
}
