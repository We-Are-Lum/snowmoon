import 'server-only';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { voiceTestOn } from './flag';

/**
 * Private storage for the voice drafts' audio (Nate, 2026-11-20 morning): the private R2 bucket (R2_PRIVATE_BUCKET, the
 * one hidden images go to: it has no public address), under voice-drafts/<draft id>/<n>-<sha256>.mp3. Never the public
 * buckets. Served only through the signed-in route (/api/voice/drafts/<id>/<n>), to the draft's own person.
 * In the local tests (VOICE_TEST_ON=1, never on Vercel) a folder on this machine stands in (VOICE_TEST_STORE, or a
 * temporary folder).
 */
export const PREFIX = 'voice-drafts/';
export const keyFor = (draftId: string, n: number, sha256: string) => `${PREFIX}${draftId}/${n}-${sha256}.mp3`;
const valid = (key: string) => /^voice-drafts\/[0-9a-f-]{36}\/[0-9]{1,2}-[0-9a-f]{64}\.mp3$/.test(key);

const NEED = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PRIVATE_BUCKET'];
const local = () => (voiceTestOn() ? process.env.VOICE_TEST_STORE || path.join(os.tmpdir(), 'voice-test-store') : null);
export const voiceStoreReady = () => Boolean(local()) || NEED.every((k) => process.env[k]);

let client: S3Client | null = null;
function r2() {
  if (!NEED.every((k) => process.env[k])) throw new Error('private storage is not set up');
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  return { client, bucket: process.env.R2_PRIVATE_BUCKET! };
}

export async function putAudio(key: string, bytes: Uint8Array): Promise<void> {
  if (!valid(key)) throw new Error('not a voice draft key');
  const dir = local();
  if (dir) {
    mkdirSync(path.dirname(path.join(dir, key)), { recursive: true });
    writeFileSync(path.join(dir, key), bytes);
    return;
  }
  const { client, bucket } = r2();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: 'audio/mpeg' }));
}

export async function getAudio(key: string): Promise<Uint8Array | null> {
  if (!valid(key)) return null;
  const dir = local();
  if (dir) {
    try {
      return new Uint8Array(readFileSync(path.join(dir, key)));
    } catch {
      return null;
    }
  }
  const { client, bucket } = r2();
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return out.Body ? new Uint8Array(await out.Body.transformToByteArray()) : null;
  } catch {
    return null;
  }
}

export async function deleteAudio(key: string): Promise<void> {
  if (!valid(key)) return;
  const dir = local();
  if (dir) return void rmSync(path.join(dir, key), { force: true });
  const { client, bucket } = r2();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
