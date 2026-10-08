import 'server-only';
import { CopyObjectCommand, DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { IMAGES } from '../config';

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
  return missingStorage().length === 0;
}

export async function putPublic(sha256: string, bytes: Buffer, contentType: string): Promise<string> {
  const { client, pub, url } = r2();
  const key = keyFor(sha256);
  await client.send(new PutObjectCommand({ Bucket: pub, Key: key, Body: bytes, ContentType: contentType, CacheControl: `public, max-age=${IMAGES.cacheSeconds}` }));
  return `${url}/${key}`;
}

/** Hide: keep the bytes privately, then remove the public copy (record and bytes kept, as docs/removal.md allows). */
export async function moveToPrivate(sha256: string): Promise<void> {
  const { client, pub, priv } = r2();
  const key = keyFor(sha256);
  await client.send(new CopyObjectCommand({ Bucket: priv, Key: key, CopySource: `${pub}/${key}` }));
  await client.send(new DeleteObjectCommand({ Bucket: pub, Key: key }));
}

/** Unhide (the author's own hide only): put the public copy back. */
export async function restorePublic(sha256: string): Promise<void> {
  const { client, pub, priv } = r2();
  const key = keyFor(sha256);
  await client.send(new CopyObjectCommand({ Bucket: pub, Key: key, CopySource: `${priv}/${key}`, CacheControl: `public, max-age=${IMAGES.cacheSeconds}`, MetadataDirective: 'REPLACE', ContentType: 'image/jpeg' }));
}
