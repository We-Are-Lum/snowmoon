/**
 * Cloudflare R2 through its S3-compatible API. Used only by scripts run on a
 * trusted machine; the app itself never holds R2 keys.
 *
 * Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and
 * R2_PUBLIC_URL (from .env.local). The key should be scoped to one bucket.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export function r2() {
  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`missing ${missing.join(', ')} (see README, "Media")`);
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  const bucket = process.env.R2_BUCKET!;
  const publicUrl = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');

  /**
   * Upload a file under `key` unless an object with that key already exists.
   * Keys carry the content's sha256, so an existing key means identical bytes,
   * and objects can be cached forever.
   */
  async function put(key: string, file: string, contentType: string): Promise<{ url: string; uploaded: boolean }> {
    const url = `${publicUrl}/${key}`;
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { url, uploaded: false };
    } catch (e) {
      if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw e;
    }
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await readFile(file),
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { url, uploaded: true };
  }

  return { put, publicUrl };
}

export async function sha256File(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

/** Run `fn` over `items` with at most `n` in flight. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
