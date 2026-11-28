import { after, NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { VOICE } from '~/lib/config';
import { flowDeps, noStore, voicePerson, voiceReady } from '~/lib/voice/server';
import { speechById } from '~/lib/voice/speech';
import { takeMaxSeconds } from '~/lib/voice/spoken';

import { voiceIdFor } from '~/lib/voice/presets';
import { elevenLabsBase } from '~/lib/voice/flag';
import { hasVoiceConsent, voiceConsentWording } from '~/lib/voice/consent';
import { refusal, refusalExtra, reserve } from '~/lib/voice/costs';
import { convertTake, CONVERTED_ALREADY, estimateConvertCredits, FlowError, type CostEntry, type Scope } from '~/lib/voice/take-flow';
import { keepConvertedTake } from '~/lib/voice/keep-converted';
import { convertedBefore } from '~/lib/voice/converted-before';

const mmssLimit = (s: number) => (s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s / 60} minute${s === 60 ? '' : 's'}`);

export const maxDuration = 300;

/**
 * Convert one take (the whole speech, or one sentence) into a preset's voice. The take is read into memory, handed to
 * convertTake (take-flow.ts: ElevenLabs and sha256, nothing else) and never written, logged or returned (P1h). The
 * reply for a sentence is the converted MP3, with its signed record in the X-Voice-Ticket header; a whole take is
 * transcribed and kept as the person's private draft before the reply (keep-converted.ts), which gives its id.
 */
export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql || !voiceReady()) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Send the recording as a form' }, { status: 400 });
  }
  const file = form.get('take');
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: 'No recording' }, { status: 400 });
  if (file.size > VOICE.maxTakeBytes) return NextResponse.json({ error: 'That recording is too large' }, { status: 413 });
  const speech = speechById(String(form.get('speechId') ?? ''));
  if (!speech) return NextResponse.json({ error: 'No such speech' }, { status: 400 });
  const presetId = String(form.get('presetId') ?? '');
  const candidate = Number(form.get('candidate'));
  const stub = elevenLabsBase() !== 'https://api.elevenlabs.io';
  const voiceId = voiceIdFor(presetId, candidate, stub);
  if (!voiceId) return NextResponse.json({ error: 'That voice is a preview only: it can be used once Nate picks it and it is saved' }, { status: 400 });
  const sentence = form.get('sentence');
  const scope: Scope = sentence === null || sentence === '' ? { kind: 'whole' } : { kind: 'sentence', n: Number(sentence) };
  if (scope.kind === 'sentence' && !speech.sentences.some((s) => s.n === scope.n)) return NextResponse.json({ error: 'No such sentence' }, { status: 400 });
  // The length the device reports, and never less than the file could hold at 320 kb/s, so a short claim can't dodge the cap.
  const seconds = Math.max(Number(form.get('seconds')) || 0, file.size / 40_000);
  // A whole take: at most 2 minutes (Nate, 2026-11-24; the book speech 3, takeMaxSeconds), with a second's grace for the
  // recorder's stop; the page's countdown stops the recording at its limit.
  const max = scope.kind === 'whole' ? takeMaxSeconds(speech.id) : VOICE.maxSentenceSeconds;
  if (seconds > max + 1) return NextResponse.json({ error: `A ${scope.kind === 'whole' ? 'take' : 'sentence'} can be at most ${mmssLimit(max)}` }, { status: 413 });
  const wording = voiceConsentWording();
  if (!(await hasVoiceConsent(sql, who.fid))) return NextResponse.json({ error: 'Read and agree to the own-voice terms first' }, { status: 403 });
  if (form.get('agree') !== wording.sha256) return NextResponse.json({ error: 'Tick the box to send this recording to ElevenLabs' }, { status: 403 });

  // "Convert again" (fix 7): sent by the page only after the person asks to convert a converted recording again.
  const again = form.get('again') === '1';
  const estimatedCredits = estimateConvertCredits(seconds, VOICE.rates.convertCreditsPerMinute);
  // The limits, the hold and the once-only rule are checked when the take's sha256 is known (in convertTake, before
  // anything is sent), so a refused second conversion of the same recording counts nothing, not even a take.
  let settle: Awaited<ReturnType<typeof reserve>> | null = null;
  const admit = async (takeSha256: string) => {
    if (scope.kind === 'whole' && !again && (await convertedBefore(sql, who.fid, takeSha256))) throw new FlowError(409, CONVERTED_ALREADY, 'converted');
    const no = await refusal(sql, who.fid, estimatedCredits, scope.kind === 'whole');
    if (no) throw new FlowError(429, no);
    settle = await reserve(sql, who.fid, VOICE.models.convert, estimatedCredits, scope.kind === 'whole');
  };
  let costed = false;
  const cost = async (e: CostEntry) => {
    costed = true;
    await settle?.({ ...e, kind: 'convert' });
  };
  // The conversion and the keeping run as one job the platform keeps alive past the reply (after), so a person who
  // leaves mid-conversion still has the draft (Nate, 2026-11-22). Nothing here listens to the request's abort.
  const job = (async () => {
    const { audio, ticket } = await convertTake(flowDeps(cost), {
      take: new Uint8Array(await file.arrayBuffer()),
      mime: file.type || 'audio/webm',
      seconds,
      fid: who.fid,
      speechId: speech.id,
      presetId,
      candidate,
      voiceId,
      scope,
      consentSha256: wording.sha256,
      admit,
    });
    if (scope.kind === 'sentence') return new Response(Buffer.from(audio), { headers: { 'content-type': 'audio/mpeg', 'x-voice-ticket': ticket, ...noStore } });
    // A whole take is kept as the person's private draft before the reply (Nate, 2026-11-22), so leaving the page
    // mid-conversion loses nothing. Only the converted audio is kept: the take is never handed on (P1h).
    let kept: Awaited<ReturnType<typeof keepConvertedTake>>;
    try {
      kept = await keepConvertedTake(sql, who.fid, { audio, ticket });
    } catch {
      // Converted, but not kept (a database or storage error): nothing of it is half-kept (saveDraft), and the
      // recording is still on the person's device to convert again.
      throw new FlowError(500, "Converted, but it couldn't be kept as your draft. Your recording is still on this device: tick the box and convert it again.");
    }
    return NextResponse.json({ draftId: kept.draftId, ticket, check: kept.check, checks: kept.checks }, { headers: { 'x-voice-ticket': ticket, ...noStore } });
  })();
  try {
    after(job.then(() => undefined, () => undefined));
  } catch {
    // Outside a request (the route tests call POST directly): the job is awaited below all the same.
  }
  try {
    return await job;
  } catch (e) {
    const s = settle as Awaited<ReturnType<typeof reserve>> | null;
    if (!costed && s) await s(null).catch(() => {});
    // A day's limit (429) carries the allowance's reason code and the reset instant (refusalExtra, Nate 2026-11-23).
    if (e instanceof FlowError) return NextResponse.json({ error: e.message, ...(e.reason ? { reason: e.reason } : {}), ...(e.status === 429 ? refusalExtra(e.message) : {}) }, { status: e.status });
    return NextResponse.json({ error: 'Something went wrong. Your recording was not kept.' }, { status: 500 });
  }
}
