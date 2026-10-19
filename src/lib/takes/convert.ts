import 'server-only';
import { createHash } from 'node:crypto';
import { TAKES, appUrl } from '../config';

/**
 * One voice conversion on fal.ai (owner, 2026-10-19): the person's recording in, the character's voice
 * out. The recording goes in the request itself as a data: URI, so fal fetches nothing and nothing is
 * uploaded to its CDN; X-Fal-Store-IO: 0 asks it to keep no copy of the request or reply; the converted
 * file it puts on its CDN is set to expire after TAKES.falOutputSeconds, and we copy it at once. The
 * recording is never written to disk or storage here, and never logged: only its sha256 leaves this
 * function, for the recipe. Needs FAL_KEY. TAKES_TEST_FAKES=1 (never on Vercel) stands in for fal.
 */
export interface Converted {
  bytes: Buffer;
  contentType: string;
  seconds: number;
  costUsd: number;
  requestId: string | null;
  rawSha256: string;
}
export class ConvertUnavailable extends Error {}

export const takesFakes = () => process.env.TAKES_TEST_FAKES === '1' && !process.env.VERCEL;

/** Length of a PCM WAV from its header, or null. */
export function wavSeconds(b: Buffer): number | null {
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
  let i = 12, byteRate = 0;
  while (i + 8 <= b.length) {
    const id = b.toString('ascii', i, i + 4), size = b.readUInt32LE(i + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(i + 16);
    if (id === 'data') return byteRate ? Math.min(size, b.length - i - 8) / byteRate : null;
    i += 8 + size + (size % 2);
  }
  return null;
}

/** A short silent WAV for the test stand-in (16 kHz mono, 16-bit). */
export function silentWav(seconds: number): Buffer {
  const rate = 16000, n = Math.round(rate * seconds), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + n * 2, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(n * 2, 40);
  return Buffer.concat([h, Buffer.alloc(n * 2)]);
}

export async function convertTake(raw: Buffer, contentType: string, targetSrc: string): Promise<Converted> {
  const rawSha256 = createHash('sha256').update(raw).digest('hex');
  const price = (s: number) => Math.round((s / 60) * TAKES.model.usdPerMinute * 1e6) / 1e6;
  if (takesFakes()) {
    const bytes = silentWav(3);
    return { bytes, contentType: 'audio/wav', seconds: 3, costUsd: price(3), requestId: 'test-stand-in', rawSha256 };
  }
  const key = process.env.FAL_KEY;
  if (!key) throw new ConvertUnavailable('FAL_KEY is not set');
  const res = await fetch(`https://fal.run/${TAKES.model.endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
      'X-Fal-Store-IO': '0',
      'X-Fal-Object-Lifecycle-Preference': JSON.stringify({ expiration_duration_seconds: TAKES.falOutputSeconds }),
    },
    body: JSON.stringify({
      source_audio_url: `data:${contentType};base64,${raw.toString('base64')}`,
      target_voice_audio_url: `${appUrl()}${targetSrc}`,
    }),
    signal: AbortSignal.timeout(90_000),
  }).catch(() => null);
  if (!res || !res.ok) throw new ConvertUnavailable(`fal answered ${res?.status ?? 'nothing'}`);
  const out = (await res.json()) as { audio?: { url?: string; content_type?: string } };
  const url = out.audio?.url;
  if (!url || !/^https:\/\//.test(url)) throw new ConvertUnavailable('no audio in the answer');
  const got = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!got?.ok) throw new ConvertUnavailable('the converted file could not be fetched');
  const bytes = Buffer.from(await got.arrayBuffer());
  const seconds = wavSeconds(bytes) ?? TAKES.maxSeconds;
  return { bytes, contentType: out.audio?.content_type ?? 'audio/wav', seconds, costUsd: price(Math.max(seconds, 1)), requestId: res.headers.get('x-fal-request-id'), rawSha256 };
}
