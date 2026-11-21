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

/**
 * Delete one generation from the account's history (ElevenLabs: DELETE /v1/history/{id}), then read it back. 'not-yet'
 * when ElevenLabs hasn't written it yet (a 404 on delete; it writes history after answering), so the caller tries again.
 */
export async function deleteHistoryItem(id: string): Promise<'gone' | 'not-yet'> {
  const path = `/v1/history/${encodeURIComponent(id)}`;
  const res = await fetch(`${base()}${path}`, { method: 'DELETE', headers: { 'xi-api-key': key() }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  await res.body?.cancel().catch(() => {});
  if (res.status === 404) return 'not-yet';
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status} on a history delete`);
  return 'gone';
}

/** Every history item made with these voices in the last `hours` (a backstop sweep, scripts/voice-history-sweep.ts). */
export async function recentHistory(voiceIds: string[], hours: number): Promise<{ id: string; source: string; at: number }[]> {
  const res = await call('/v1/history?page_size=100', { method: 'GET' });
  const j = (await res.json()) as { history: { history_item_id: string; source?: string; voice_id?: string | null; date_unix: number }[] };
  return j.history
    .filter((h) => h.voice_id && voiceIds.includes(h.voice_id) && h.date_unix * 1000 > Date.now() - hours * 3600_000)
    .map((h) => ({ id: h.history_item_id, source: h.source ?? '', at: h.date_unix * 1000 }));
}

/** Speech-to-text with word timings. Called with converted audio only (take-flow.ts). */
export function speechToText(audio: Uint8Array, keyterms: string[] = []) {
  return measured(async () => {
    const form = new FormData();
    form.set('file', new Blob([audio], { type: 'audio/mpeg' }), 'converted.mp3');
    form.set('model_id', VOICE.models.transcribe);
    // The speech's names, so they come back spelled as the speech spells them (ElevenLabs: at most 1,000, 50 characters each).
    for (const k of keyterms.slice(0, 100)) form.append('keyterms', k.slice(0, 50));
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
