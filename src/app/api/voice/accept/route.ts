import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { VOICE } from '~/lib/config';
import { noStore, voicePerson, voiceReady } from '~/lib/voice/server';
import { speechById } from '~/lib/voice/speech';
import { presetRecipe } from '~/lib/voice/presets';
import { checkSpeech } from '~/lib/voice/match';
import { saveDraft, type DraftAudio } from '~/lib/voice/drafts';
import { sha256Hex, verifyTicket } from '~/lib/voice/ticket';
import { FlowError, readCheckTicket, readConvertTicket } from '~/lib/voice/take-flow';

export const maxDuration = 60;

const deps = { verify: (s: string) => verifyTicket<never>(s), now: () => Date.now() };

/**
 * Accept: keep the converted speech as a private draft, with its recipe. Only converted audio our conversions made can
 * be kept (each file's sha256 must be its signed record's), with the word check our transcription made. Until this
 * is called nothing of the attempt is stored; a person who leaves has discarded it.
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
    return NextResponse.json({ error: 'Send the speech as a form' }, { status: 400 });
  }
  try {
    const main = form.get('take');
    if (!(main instanceof Blob)) throw new FlowError(400, 'No converted speech');
    const t = readConvertTicket(deps, String(form.get('ticket') ?? ''), who.fid);
    if (t.scope.kind !== 'whole') throw new FlowError(400, 'Accept a whole take, with any redone sentences');
    const mainBytes = new Uint8Array(await main.arrayBuffer());
    if (sha256Hex(mainBytes) !== t.convertedSha256) throw new FlowError(400, 'That is not the converted speech we made');
    const c = readCheckTicket(deps, String(form.get('check') ?? ''), who.fid);
    if (c.convertedSha256 !== t.convertedSha256) throw new FlowError(400, 'That check is for another take');
    const speech = speechById(t.speechId);
    const preset = presetRecipe(t.presetId, t.candidate ?? 0);
    if (!speech || !preset) throw new FlowError(400, 'No such speech or voice');
    const checks = checkSpeech(speech.sentences, c.words);

    const files = form.getAll('redo');
    const tickets = form.getAll('redoTicket').map(String);
    const redoChecks = form.getAll('redoCheck').map(String);
    if (files.length !== tickets.length || files.length !== redoChecks.length || files.length > 20) throw new FlowError(400, 'Each redone sentence needs its file, its record and its check');
    let total = mainBytes.length;
    const audio: DraftAudio[] = [{ role: 'take', sentence: null, replacesStart: null, replacesEnd: null, mp3: mainBytes, sha256: t.convertedSha256, seconds: t.seconds }];
    const takes: Record<string, unknown>[] = [{ role: 'take', takeSha256: t.takeSha256, convertedSha256: t.convertedSha256, historyDeleted: t.historyDeleted, seconds: t.seconds }];
    const redone = new Map<number, boolean>();
    for (const [i, f] of files.entries()) {
      if (!(f instanceof Blob)) throw new FlowError(400, 'A redone sentence is missing its file');
      const rt = readConvertTicket(deps, tickets[i], who.fid);
      if (rt.scope.kind !== 'sentence' || rt.speechId !== t.speechId || rt.presetId !== t.presetId || rt.candidate !== t.candidate) throw new FlowError(400, 'A redone sentence is from another take or voice');
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (sha256Hex(bytes) !== rt.convertedSha256) throw new FlowError(400, 'A redone sentence is not the one we converted');
      const rc = readCheckTicket(deps, redoChecks[i], who.fid);
      if (rc.convertedSha256 !== rt.convertedSha256) throw new FlowError(400, "A redone sentence's check is for another file");
      const n = rt.scope.n;
      if (redone.has(n)) throw new FlowError(400, `Sentence ${n + 1} is redone twice: keep one`);
      const sentence = speech.sentences.find((s) => s.n === n)!;
      redone.set(n, checkSpeech([sentence], rc.words)[0].ok);
      // Where the sentence is in the whole take: from its words' times, or between its neighbours' if none were heard.
      const at = checks[n];
      const before = checks.slice(0, n).reverse().find((x) => x.end !== null)?.end ?? 0;
      const after = checks.slice(n + 1).find((x) => x.start !== null)?.start ?? t.seconds;
      const start = at.start ?? before;
      const end = at.end ?? after;
      total += bytes.length;
      audio.push({ role: 'redo', sentence: n, replacesStart: start, replacesEnd: Math.max(start, end), mp3: bytes, sha256: rt.convertedSha256, seconds: rt.seconds });
      takes.push({ role: 'redo', sentence: n, takeSha256: rt.takeSha256, convertedSha256: rt.convertedSha256, historyDeleted: rt.historyDeleted, seconds: rt.seconds, replaces: [start, Math.max(start, end)] });
    }
    if (total > 4_400_000) throw new FlowError(413, 'Too large to keep in one go');
    const unmatched = checks.filter((x) => !(redone.get(x.n) ?? x.ok)).map((x) => x.n);
    const recipe = {
      provider: VOICE.provider,
      closedModel: true,
      model: t.model,
      settings: t.settings,
      outputFormat: t.outputFormat,
      transcribeModel: c.model,
      preset,
      speech: { id: speech.id, title: speech.title, source: speech.source, standIn: speech.standIn, textSha256: sha256Hex(new TextEncoder().encode(speech.paragraphs.join('\n'))) },
      takes,
      check: { sentences: speech.sentences.length, matched: speech.sentences.length - unmatched.length, unmatched },
      consent: { kind: 'voice_recording', sha256: t.consentSha256, perRecording: true },
      madeWith: 'snowmoon.party voice slice 1 (DRAFT)',
    };
    const id = await saveDraft(sql, { fid: who.fid, kind: 'performance', speechId: speech.id, presetId: t.presetId, recipe, audio });
    return NextResponse.json({ id, recipe }, { headers: noStore });
  } catch (e) {
    if (e instanceof FlowError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Something went wrong; nothing was kept' }, { status: 500 });
  }
}
