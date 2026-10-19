import 'server-only';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TAKES } from '../config';

/**
 * One voice conversion, on our own Chatterbox deployment on Modal (owner, 2026-10-19: option (c); modal/chatterbox_vc.py).
 * Modal's terms forbid it to train any AI model on what we send. Our server sends the person's recording and the
 * character's published voice (read from this deployment's own files) in one request, with our shared key; the
 * converted take comes back in the answer. The recording is never written to storage or a log here; only its sha256
 * leaves this function, for the recipe. Needs MODAL_TAKES_URL and MODAL_TAKES_KEY. TAKES_TEST_FAKES=1 (never on
 * Vercel) stands in for Modal.
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

const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };

export async function convertTake(raw: Buffer, contentType: string, targetSrc: string): Promise<Converted> {
  const rawSha256 = createHash('sha256').update(raw).digest('hex');
  const price = (gpuSeconds: number) => Math.round(gpuSeconds * TAKES.model.usdPerGpuSecond * 1e6) / 1e6;
  if (takesFakes()) {
    const bytes = silentWav(3);
    return { bytes, contentType: 'audio/wav', seconds: 3, costUsd: price(2), requestId: 'test-stand-in', rawSha256 };
  }
  const url = process.env.MODAL_TAKES_URL, key = process.env.MODAL_TAKES_KEY;
  if (!url || !key) throw new ConvertUnavailable('MODAL_TAKES_URL or MODAL_TAKES_KEY is not set');
  let target: Buffer;
  try {
    target = readFileSync(path.join(process.cwd(), 'public', targetSrc));
  } catch {
    throw new ConvertUnavailable('the target voice is not in this deployment');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, source_b64: raw.toString('base64'), source_ext: EXT[contentType] ?? 'webm', target_b64: target.toString('base64') }),
    signal: AbortSignal.timeout(110_000),
  }).catch(() => null);
  if (!res || !res.ok) throw new ConvertUnavailable(`the voice model answered ${res?.status ?? 'nothing'}`);
  const out = (await res.json().catch(() => ({}))) as { wav_b64?: string; gpu_seconds?: number };
  if (!out.wav_b64) throw new ConvertUnavailable('no audio in the answer');
  const bytes = Buffer.from(out.wav_b64, 'base64');
  const seconds = wavSeconds(bytes) ?? TAKES.maxSeconds;
  return { bytes, contentType: 'audio/wav', seconds, costUsd: price(Math.max(out.gpu_seconds ?? 0, 1)), requestId: res.headers.get('modal-function-call-id'), rawSha256 };
}
