import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { VOICE } from '~/lib/config';
import { flowDeps, noStore, voicePerson, voiceReady } from '~/lib/voice/server';
import { speechById } from '~/lib/voice/speech';
import { checkSpeech } from '~/lib/voice/match';
import { refusal, reserve } from '~/lib/voice/costs';
import { FlowError, transcribeConverted, type CostEntry } from '~/lib/voice/take-flow';

export const maxDuration = 300;

/**
 * Transcribe converted audio (never a take: take-flow.ts checks its sha256 against the conversion's record) and check
 * it word for word against the speech, or the one sentence it redoes.
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
    return NextResponse.json({ error: 'Send the converted speech as a form' }, { status: 400 });
  }
  const file = form.get('audio');
  if (!(file instanceof Blob) || file.size === 0 || file.size > 4_500_000) return NextResponse.json({ error: 'No converted speech' }, { status: 400 });
  const no = await refusal(sql, who.fid, 0, false);
  if (no) return NextResponse.json({ error: no }, { status: 429 });
  const settle = await reserve(sql, who.fid, VOICE.models.transcribe, 0, false);
  let costed = false;
  const cost = async (e: CostEntry) => {
    costed = true;
    await settle({ ...e, kind: 'transcribe', usd: (e.seconds / 3600) * VOICE.rates.transcribeUsdPerHour });
  };
  try {
    const { convert, words, check } = await transcribeConverted(flowDeps(cost), { audio: new Uint8Array(await file.arrayBuffer()), ticket: String(form.get('ticket') ?? ''), fid: who.fid });
    const speech = speechById(convert.speechId);
    if (!speech) return NextResponse.json({ error: 'No such speech' }, { status: 400 });
    const scope = convert.scope;
    const sentences = scope.kind === 'whole' ? speech.sentences : speech.sentences.filter((s) => s.n === scope.n);
    return NextResponse.json({ scope, words, checks: checkSpeech(sentences, words), check }, { headers: noStore });
  } catch (e) {
    // Refused before any call (not converted audio, not this person's): the hold is given back, nothing is counted.
    if (!costed) await settle(null).catch(() => {});
    if (e instanceof FlowError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
