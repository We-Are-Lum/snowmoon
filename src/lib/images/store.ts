import 'server-only';
import { CopyObjectCommand, DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { IMAGES } from '../config';

/**
 * Readers' images on Cloudflare R2 (decision 25): published images in the public media bucket,
 * under images/readers/; a hidden image's file moved to a private bucket and deleted from the
 * public one (decision 21), so its link stops working. Public copies are cached for only
 * IMAGES.cacheSeconds, so a hidden image also leaves the cache within minutes, with no cache-purge
 * key. Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (a key scoped to these two
 * buckets), R2_BUCKET, R2_PRIVATE_BUCKET and R2_PUBLIC_URL.
 */
function r2() {
  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PRIVATE_BUCKET', 'R2_PUBLIC_URL'];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  return { client, pub: process.env.R2_BUCKET!, priv: process.env.R2_PRIVATE_BUCKET!, url: process.env.R2_PUBLIC_URL!.replace(/\/$/, '') };
}

export const keyFor = (sha256: string) => `images/readers/${sha256.slice(0, 32)}.jpg`;

export function storageReady(): boolean {
  return ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PRIVATE_BUCKET', 'R2_PUBLIC_URL'].every((k) => process.env[k]);
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
