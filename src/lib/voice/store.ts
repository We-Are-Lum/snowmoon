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
/** A voice sample (the four-step recorder, 2026-11-26): voice-samples/<speech>/<preset>-<sha256 of the line read>.mp3. */
export const sampleKeyFor = (speechId: string, presetId: string, textSha256: string) => `voice-samples/${speechId}/${presetId}-${textSha256}.mp3`;
export const keyFor = (draftId: string, n: number, sha256: string) => `${PREFIX}${draftId}/${n}-${sha256}.mp3`;
const valid = (key: string) =>
  /^voice-drafts\/[0-9a-f-]{36}\/[0-9]{1,2}-[0-9a-f]{64}\.mp3$/.test(key) || /^voice-samples\/[a-z0-9-]{1,80}\/[a-z0-9-]{1,80}-[0-9a-f]{64}\.mp3$/.test(key) || /^voice-boards\/[0-9a-f-]{36}\/([0-9]{1,20}\/)?[a-z0-9]{1,16}-[0-9a-f]{64}\.(png|jpg)$/.test(key) || HIDDEN_KEY.test(key) || SCENE_KEY.test(key);
/**
 * A hidden storyboard's files (moderation, Nate 2026-11-23): while a moderator or a stated rule hides a publication, its
 * public files are kept here, in the private bucket, under voice-hidden/ and their public key, and put back on unhide.
 */
export const HIDDEN_KEY = /^voice-hidden\/(storyboards|takes)\/[0-9a-f-]{36}\/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(mp3|png|jpg)$/;
/** The free picture of one's own scene (Nate, 2026-11-26), kept privately until a take uses it: voice-scenes/<person>/<sha256>.<ext>. */
export const SCENE_KEY = /^voice-scenes\/-?[0-9]{1,20}\/[0-9a-f]{64}\.(png|jpg)$/;
export const sceneKeyFor = (person: number, sha256: string, ext: 'png' | 'jpg') => `voice-scenes/${person}/${sha256}.${ext}`;
export const hiddenKeyFor = (publicKey: string) => `voice-hidden/${publicKey}`;
/**
 * A kept storyboard picture's key, in the same private bucket: voice-boards/<draft id>/<board owner's FID>/<shot key>-
 * <sha256>.png (a board has its own owner: a shared reading carries many people's boards, 2026-11-21). Pictures kept
 * before then are under voice-boards/<draft id>/<shot key>-<sha256>.png and still read.
 */
export const pictureKeyFor = (draftId: string, fid: number, shotKey: string, sha256: string, ext: 'png' | 'jpg' = 'png') => `voice-boards/${draftId}/${fid}/${shotKey}-${sha256}.${ext}`;

const NEED = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PRIVATE_BUCKET'];
export const local = () => (voiceTestOn() ? process.env.VOICE_TEST_STORE || path.join(os.tmpdir(), 'voice-test-store') : null);
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
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: key.endsWith('.mp3') ? 'audio/mpeg' : key.endsWith('.png') ? 'image/png' : 'image/jpeg' }));
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

