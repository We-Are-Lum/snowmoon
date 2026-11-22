import 'server-only';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { local } from './store';

/**
 * Public copies of a published storyboard (slice 4, DRAFT): storyboards/<publication id>/<name>-<sha256>.<ext>, in the
 * readers' public bucket (R2_BUCKET, served at R2_IMAGES_PUBLIC_URL), deleted again on a take-down. Only at publish,
 * by the person's own act. In the local tests a `public/` folder in the test store stands in, served by
 * /api/voice/public/<key> (VOICE_TEST_ON only). Which bucket, and whether the readers' key may write under
 * storyboards/, is Nate's to confirm before publishing is switched on (VOICE.publish).
 */
export const PUBLIC_KEY = /^storyboards\/[0-9a-f-]{36}\/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(mp3|png|jpg)$/;
const PUBLIC_NEED = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_IMAGES_PUBLIC_URL'];
const contentType = (key: string) => (key.endsWith('.mp3') ? 'audio/mpeg' : key.endsWith('.png') ? 'image/png' : 'image/jpeg');
export const publicStoreReady = () => Boolean(local()) || PUBLIC_NEED.every((k) => process.env[k]);

export function publicUrl(key: string): string {
  if (local()) return `/api/voice/public/${key}`;
  return `${String(process.env.R2_IMAGES_PUBLIC_URL ?? '').replace(/\/$/, '')}/${key}`;
}

export async function putPublic(key: string, bytes: Uint8Array): Promise<void> {
  if (!PUBLIC_KEY.test(key)) throw new Error('not a storyboard key');
  const dir = local();
  if (dir) {
    const f = path.join(dir, 'public', key);
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, bytes);
    return;
  }
  await r2().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key, Body: bytes, ContentType: contentType(key), CacheControl: 'public, max-age=300' }));
}

export async function deletePublic(key: string): Promise<void> {
  if (!PUBLIC_KEY.test(key)) return;
  const dir = local();
  if (dir) return void rmSync(path.join(dir, 'public', key), { force: true });
  await r2().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }));
}

/** The local stand-in's public file (VOICE_TEST_ON only), for /api/voice/public/<key>. */
export function localPublic(key: string): { bytes: Uint8Array; type: string } | null {
  const dir = local();
  if (!dir || !PUBLIC_KEY.test(key)) return null;
  try {
    return { bytes: new Uint8Array(readFileSync(path.join(dir, 'public', key))), type: contentType(key) };
  } catch {
    return null;
  }
}

let client: S3Client | null = null;
function r2() {
  if (!PUBLIC_NEED.every((k) => process.env[k])) throw new Error('public storage is not set up');
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  return client;
}
