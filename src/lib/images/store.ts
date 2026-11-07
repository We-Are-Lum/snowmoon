import 'server-only';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { IMAGES, REHEARSAL } from '../config';
import { THUMBS, thumbKeyFor } from './thumb-url';
import { makeThumbs } from './thumbs';

/**
 * The rehearsal's own store (branch contest, 2026-11-04): under the rehearsal switch only (REHEARSAL.on: this machine,
 * never on Vercel, a database on this machine) and with REHEARSAL_STORE set to a folder, every picture is kept in that
 * folder instead of R2, and served by /api/rehearsal/file/<key> on that server (R2_IMAGES_PUBLIC_URL points there). So
 * a rehearsal writes nothing to the real buckets. `public/` and `private/` stand in for the two buckets.
 */
export function rehearsalStore(): string | null {
  const dir = process.env.REHEARSAL_STORE;
  return REHEARSAL.on && dir && path.isAbsolute(dir) ? dir : null;
}
/** A key the rehearsal store accepts: the readers' images and the rehearsal's seeded bases, nothing else. */
export const REHEARSAL_KEY = /^(images\/readers\/[0-9a-f]{32}\.jpg|images\/readers\/thumbs\/[0-9a-f]{32}-w\d{3,4}\.webp|brought-in\/[A-Za-z0-9/_.-]{1,200})$/;
const localPath = (which: 'public' | 'private', key: string) => {
  const dir = rehearsalStore();
  if (!dir || !REHEARSAL_KEY.test(key) || key.includes('..')) throw new Error('rehearsal store: refused key');
  return path.join(dir, which, key);
};
const localPut = (which: 'public' | 'private', key: string, bytes: Buffer) => {
  const f = localPath(which, key);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, bytes);
};
/** A file of the rehearsal store's public half, for its route; null when the switch is off or there's no such file. */
export function rehearsalFile(key: string): Buffer | null {
  if (!rehearsalStore() || !REHEARSAL_KEY.test(key) || key.includes('..')) return null;
  const f = localPath('public', key);
  return existsSync(f) ? readFileSync(f) : null;
}

/**
 * Readers' images on Cloudflare R2 (decision 25): published images in the public media bucket,
 * under images/readers/; a hidden image's file moved to a private bucket and deleted from the
 * public one (decision 21), so its link stops working. Public copies are cached for only
 * IMAGES.cacheSeconds, so a hidden image also leaves the cache within minutes, with no cache-purge
 * key. Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (a key scoped to these two
 * buckets), R2_BUCKET (readers' images: snowmoon-readers), R2_PRIVATE_BUCKET, and
 * R2_IMAGES_PUBLIC_URL (https://pictures.snowmoon.party). Readers' images have their own bucket
 * (owner, 2026-10-08), so the production key can't write to the book's audio and images.
 */
function r2() {
  const need = NEED;
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  return { client, pub: process.env.R2_BUCKET!, priv: process.env.R2_PRIVATE_BUCKET!, url: process.env.R2_IMAGES_PUBLIC_URL!.replace(/\/$/, '') };
}

const NEED = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PRIVATE_BUCKET', 'R2_IMAGES_PUBLIC_URL'];
/** Which storage variables are missing (names only). */
export const missingStorage = () => NEED.filter((k) => !process.env[k]);

/** The bucket that holds the book's audio and images. The production key must not be able to write to it. */
export const BOOK_MEDIA_BUCKET = 'snowmoon-media';

/**
 * The owner's storage check (2026-10-08), run on production by the maintainer: a small text file
 * written to the readers' bucket, read back through its public address and deleted; the same in the
 * private bucket; and a write to the book's media bucket, which must be refused. Error names only.
 */
export async function checkStorage() {
  const missing = missingStorage();
  if (missing.length) return { ok: false, missing };
  const { client, pub, priv, url } = r2();
  const key = `checks/storage-check-${Date.now()}.txt`;
  const body = 'storage check: safe to delete';
  const step = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return 'ok';
    } catch (e) {
      return `failed: ${(e as { name?: string }).name ?? 'error'}`;
    }
  };
  const readersWrite = await step(() => client.send(new PutObjectCommand({ Bucket: pub, Key: key, Body: body, ContentType: 'text/plain', CacheControl: 'no-store' })));
  const publicRead = readersWrite === 'ok' ? await step(async () => {
    const r = await fetch(`${url}/${key}`, { cache: 'no-store' });
    if (r.status !== 200 || (await r.text()) !== body) throw Object.assign(new Error(), { name: `HTTP ${r.status}` });
  }) : 'not tried';
  const readersDelete = readersWrite === 'ok' ? await step(() => client.send(new DeleteObjectCommand({ Bucket: pub, Key: key }))) : 'not tried';
  const privateWrite = await step(() => client.send(new PutObjectCommand({ Bucket: priv, Key: key, Body: body, ContentType: 'text/plain' })));
  const privateDelete = privateWrite === 'ok' ? await step(() => client.send(new DeleteObjectCommand({ Bucket: priv, Key: key }))) : 'not tried';
  // Must be refused. If it ever succeeds, the file is removed at once and the check fails.
  const mediaWrite = await step(() => client.send(new PutObjectCommand({ Bucket: BOOK_MEDIA_BUCKET, Key: key, Body: body, ContentType: 'text/plain' })));
  if (mediaWrite === 'ok') await step(() => client.send(new DeleteObjectCommand({ Bucket: BOOK_MEDIA_BUCKET, Key: key })));
  const mediaRefused = mediaWrite !== 'ok';
  const ok = [readersWrite, publicRead, readersDelete, privateWrite, privateDelete].every((s) => s === 'ok') && mediaRefused;
  return { ok, readersBucket: pub, publicAddress: url, readersWrite, publicRead, readersDelete, privateWrite, privateDelete, bookMediaWrite: mediaRefused ? `refused (${mediaWrite.replace('failed: ', '')})` : 'ALLOWED: the key can write to the book media bucket' };
}

export const keyFor = (sha256: string) => `images/readers/${sha256.slice(0, 32)}.jpg`;

export function storageReady(): boolean {
  if (rehearsalStore()) return Boolean(process.env.R2_IMAGES_PUBLIC_URL);
  return missingStorage().length === 0;
}

export async function putPublic(sha256: string, bytes: Buffer, contentType: string): Promise<string> {
  if (rehearsalStore()) {
    localPut('public', keyFor(sha256), bytes);
    await putThumbs(sha256, bytes);
    return `${process.env.R2_IMAGES_PUBLIC_URL!.replace(/\/$/, '')}/${keyFor(sha256)}`;
  }
  const { client, pub, url } = r2();
  const key = keyFor(sha256);
  await client.send(new PutObjectCommand({ Bucket: pub, Key: key, Body: bytes, ContentType: contentType, CacheControl: `public, max-age=${IMAGES.cacheSeconds}` }));
  await putThumbs(sha256, bytes);
  return `${url}/${key}`;
}

/**
 * The small copies for lists (src/lib/images/thumb-url.ts), written after the original, beside it. A copy that fails
 * never fails the publish: the original is what was published, and a list falls back to it. Returns the keys written.
 * The backfill (scripts/backfill-thumbs.ts) writes through here too.
 */
export async function putThumbs(sha256: string, original: Buffer): Promise<string[]> {
  try {
    const thumbs = await makeThumbs(sha256, original);
    if (rehearsalStore()) {
      for (const t of thumbs) localPut('public', t.key, t.bytes);
      return thumbs.map((t) => t.key);
    }
    const { client, pub } = r2();
    for (const t of thumbs) {
      await client.send(new PutObjectCommand({ Bucket: pub, Key: t.key, Body: t.bytes, ContentType: THUMBS.contentType, CacheControl: `public, max-age=${IMAGES.cacheSeconds}` }));
    }
    return thumbs.map((t) => t.key);
  } catch (e) {
    console.error('thumbnails: not made; lists show the original', (e as Error).name);
    return [];
  }
}

/** The copies' keys for a picture (whether or not they exist yet). */
const thumbKeys = (sha256: string) => THUMBS.widths.map((w) => thumbKeyFor(sha256, w));

/** Hide: keep the bytes privately, then remove the public copy (record and bytes kept, as docs/removal.md allows). */
export async function moveToPrivate(sha256: string): Promise<void> {
  if (rehearsalStore()) {
    for (const k of [keyFor(sha256), ...thumbKeys(sha256)]) {
      const from = localPath('public', k);
      if (existsSync(from)) {
        localPut('private', k, readFileSync(from));
        rmSync(from);
      }
    }
    return;
  }
  const { client, pub, priv } = r2();
  const key = keyFor(sha256);
  await client.send(new CopyObjectCommand({ Bucket: priv, Key: key, CopySource: `${pub}/${key}` }));
  await client.send(new DeleteObjectCommand({ Bucket: pub, Key: key }));
  // The copies go with it. Kept privately when they exist (a picture from before them may have none: that copy is
  // skipped), and always deleted from the public bucket, so no list can show a hidden picture.
  for (const k of thumbKeys(sha256)) {
    await client.send(new CopyObjectCommand({ Bucket: priv, Key: k, CopySource: `${pub}/${k}` })).catch(() => null);
    await client.send(new DeleteObjectCommand({ Bucket: pub, Key: k }));
  }
}

/** Unhide (the author's own hide only): put the public copy back. */
export async function restorePublic(sha256: string): Promise<void> {
  if (rehearsalStore()) {
    for (const k of [keyFor(sha256), ...thumbKeys(sha256)]) {
      const from = localPath('private', k);
      if (existsSync(from)) {
        mkdirSync(path.dirname(localPath('public', k)), { recursive: true });
        copyFileSync(from, localPath('public', k));
      }
    }
    return;
  }
  const { client, pub, priv } = r2();
  const key = keyFor(sha256);
  await client.send(new CopyObjectCommand({ Bucket: pub, Key: key, CopySource: `${priv}/${key}`, CacheControl: `public, max-age=${IMAGES.cacheSeconds}`, MetadataDirective: 'REPLACE', ContentType: 'image/jpeg' }));
  // The copies come back with it, when they were kept (a picture hidden before they existed has none until the backfill).
  for (const k of thumbKeys(sha256)) {
    await client.send(new CopyObjectCommand({ Bucket: pub, Key: k, CopySource: `${priv}/${k}`, CacheControl: `public, max-age=${IMAGES.cacheSeconds}`, MetadataDirective: 'REPLACE', ContentType: THUMBS.contentType })).catch(() => null);
  }
}

/**
 * Brought-in images (agents, owner 2026-10-20; DRAFT): kept only in the private bucket, under
 * brought-in/, and served through the site's own route (/api/pieces/image/<version>) to their
 * person while a draft and to anyone once published. Never written before the scan has passed.
 */
export async function putPrivate(key: string, bytes: Buffer, contentType: string): Promise<void> {
  if (rehearsalStore()) return localPut('private', key, bytes);
  const { client, priv } = r2();
  await client.send(new PutObjectCommand({ Bucket: priv, Key: key, Body: bytes, ContentType: contentType }));
}

export async function getPrivate(key: string): Promise<Buffer | null> {
  if (rehearsalStore()) {
    const f = localPath('private', key);
    return existsSync(f) ? readFileSync(f) : null;
  }
  const { client, priv } = r2();
  const out = await client.send(new GetObjectCommand({ Bucket: priv, Key: key })).catch(() => null);
  if (!out?.Body) return null;
  return Buffer.from(await out.Body.transformToByteArray());
}
