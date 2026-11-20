import 'server-only';
import { VOICE } from '../config';
import { elevenLabsBase, voiceTestOn } from './flag';
import type { HeardWord } from './match';

/**
 * ElevenLabs' API, as the voice slice uses it (closed models, by ElevenLabs; config/models.json). Only from our
 * server: no page ever calls ElevenLabs (principle 6). Errors never carry what was sent, nor ElevenLabs' answer text.
 *
 * Spending guard: in the local tests (VOICE_TEST_ON=1) only a local stub is called (ELEVENLABS_BASE_URL); a real call
 * is refused, so no test or screenshot run can spend. On Vercel the stub address is ignored.
 */
export const elevenLabsReady = () => Boolean(process.env.ELEVENLABS_API_KEY) || stubbed();
const stubbed = () => elevenLabsBase() !== 'https://api.elevenlabs.io';

function base(): string {
  const b = elevenLabsBase();
  if (voiceTestOn() && !stubbed()) throw new Error('local test: real ElevenLabs calls are refused');
  return b;
}
const key = () => process.env.ELEVENLABS_API_KEY ?? (stubbed() ? 'stub' : '');
const TIMEOUT_MS = 120_000;

async function call(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${base()}${path}`, { ...init, headers: { 'xi-api-key': key(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`ElevenLabs answered ${res.status} on ${path.split('?')[0].replace(/\/[A-Za-z0-9]{16,}/g, '/…')}`);
  }
  return res;
}

/** Credits used by a call, from its own header when ElevenLabs sends one. */
const creditsOf = (res: Response) => {
  const v = Number(res.headers.get('character-cost') ?? res.headers.get('x-character-cost') ?? NaN);
  return Number.isFinite(v) ? v : null;
};

/** The account's credits used this period (no cost): read before and after a call when the call itself doesn't say. */
export async function creditsUsed(): Promise<number | null> {
  try {
    const res = await call('/v1/user/subscription', { method: 'GET' });
    const j = (await res.json()) as { character_count?: number };
    return typeof j.character_count === 'number' ? j.character_count : null;
  } catch {
    return null;
  }
}

async function measured<T extends { credits: number | null }>(run: () => Promise<T>): Promise<T> {
  const before = await creditsUsed();
  const out = await run();
  if (out.credits === null && before !== null) {
    const after = await creditsUsed();
    if (after !== null && after >= before) out.credits = after - before;
  }
  return out;
}

const ext = (mime: string) => (/mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : /mpeg|mp3/.test(mime) ? 'mp3' : 'webm');

/** Speech-to-speech: the take in, the character's voice out. */
export function speechToSpeech(take: Uint8Array, mime: string, voiceId: string) {
  return measured(async () => {
    const form = new FormData();
    form.set('audio', new Blob([take], { type: mime }), `take.${ext(mime)}`);
    form.set('model_id', VOICE.models.convert);
    const { remove_background_noise, ...settings } = VOICE.convertSettings;
    form.set('voice_settings', JSON.stringify(settings));
    form.set('remove_background_noise', String(remove_background_noise));
    const res = await call(`/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=${VOICE.outputFormat}`, { method: 'POST', body: form });
    const audio = new Uint8Array(await res.arrayBuffer());
    return { audio, historyItemId: res.headers.get('history-item-id'), credits: creditsOf(res) };
  });
}

/** Delete one generation from the account's history (ElevenLabs: DELETE /v1/history/{id}). */
export async function deleteHistoryItem(id: string): Promise<void> {
  await call(`/v1/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Speech-to-text with word timings. Called with converted audio only (take-flow.ts). */
export function speechToText(audio: Uint8Array) {
  return measured(async () => {
    const form = new FormData();
    form.set('file', new Blob([audio], { type: 'audio/mpeg' }), 'converted.mp3');
    form.set('model_id', VOICE.models.transcribe);
    form.set('timestamps_granularity', 'word');
    form.set('tag_audio_events', 'false');
    const res = await call('/v1/speech-to-text', { method: 'POST', body: form });
    const j = (await res.json()) as { words?: { text: string; start: number; end: number; type?: string }[] };
    const words: HeardWord[] = (j.words ?? []).filter((w) => !w.type || w.type === 'word').map((w) => ({ text: w.text, start: w.start, end: w.end }));
    return { words, credits: creditsOf(res) };
  });
}

/** Text-to-speech: a speech's written words in a preset's voice (the ready-made reading). */
export function textToSpeech(text: string, voiceId: string) {
  return measured(async () => {
    const res = await call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${VOICE.outputFormat}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: VOICE.models.reading, voice_settings: VOICE.readingSettings }),
    });
    return { audio: new Uint8Array(await res.arrayBuffer()), historyItemId: res.headers.get('history-item-id'), credits: creditsOf(res) };
  });
}
