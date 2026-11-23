import 'server-only';
import type postgres from 'postgres';
import { VOICE } from '../config';
import { speechById } from './speech';
import { presetRecipe } from './presets';
import { checkSpeech } from './match';
import { joinTimeline, type TimedWord } from './board';
import { saveDraft, type DraftAudio } from './drafts';
import { sha256Hex } from './ticket';
import { FlowError, type CheckTicket, type ConvertTicket } from './take-flow';

/**
 * Keep a converted performance as its person's private draft (Nate, 2026-11-22: "when the conversion comes back, keep
 * the converted take as a draft automatically"): the converted take, and any redone sentences, with the recipe. Only
 * ever converted audio: each file's sha256 must be its signed conversion's, and never a raw take's (the take is never
 * handed here: P1h checks the conversion route passes only the converted audio). The conversion route keeps every whole
 * take as soon as it is converted; "Use this one" (the accept route) keeps a take with its redone sentences.
 *
 * A take whose word check couldn't be made is still kept (its recipe says so: no check, no strip), so nothing converted
 * is lost; it can't be storyboarded until it is recorded again.
 */
export interface Converted {
  ticket: ConvertTicket;
  audio: Uint8Array;
  check: CheckTicket | null;
}

export async function keepPerformance(sql: postgres.Sql, fid: number, take: Converted, redos: Converted[] = []): Promise<{ id: string; recipe: Record<string, unknown> }> {
  const t = take.ticket;
  if (t.fid !== fid) throw new FlowError(400, 'That conversion is not yours');
  if (t.scope.kind !== 'whole') throw new FlowError(400, 'Keep a whole take, with any redone sentences');
  if (sha256Hex(take.audio) !== t.convertedSha256 || t.convertedSha256 === t.takeSha256) throw new FlowError(400, 'That is not the converted speech we made');
  const c = take.check;
  if (c && c.convertedSha256 !== t.convertedSha256) throw new FlowError(400, 'That check is for another take');
  const speech = speechById(t.speechId);
  const preset = presetRecipe(t.presetId, t.candidate ?? 0);
  if (!speech || !preset) throw new FlowError(400, 'No such speech or voice');
  const checks = c ? checkSpeech(speech.sentences, c.words, speech.names) : [];

  let total = take.audio.length;
  const audio: DraftAudio[] = [{ role: 'take', sentence: null, replacesStart: null, replacesEnd: null, mp3: take.audio, sha256: t.convertedSha256, seconds: t.seconds }];
  const takes: Record<string, unknown>[] = [{ role: 'take', takeSha256: t.takeSha256, convertedSha256: t.convertedSha256, historyDeleted: t.historyDeleted, transcriptDeleted: c?.transcriptDeleted === true, seconds: t.seconds }];
  const redone = new Map<number, boolean>();
  const spliced: { start: number; end: number; seconds: number; words: TimedWord[] }[] = [];
  if (redos.length && !c) throw new FlowError(400, 'Check the take first, then keep it with its redone sentences');
  if (redos.length > 20) throw new FlowError(400, 'At most 20 redone sentences');
  for (const r of redos) {
    const rt = r.ticket;
    const rc = r.check;
    if (rt.fid !== fid || rt.scope.kind !== 'sentence' || rt.speechId !== t.speechId || rt.presetId !== t.presetId || rt.candidate !== t.candidate) throw new FlowError(400, 'A redone sentence is from another take or voice');
    if (sha256Hex(r.audio) !== rt.convertedSha256) throw new FlowError(400, 'A redone sentence is not the one we converted');
    if (!rc || rc.convertedSha256 !== rt.convertedSha256) throw new FlowError(400, "A redone sentence's check is for another file");
    const n = rt.scope.n;
    if (redone.has(n)) throw new FlowError(400, `Sentence ${n + 1} is redone twice: keep one`);
    const sentence = speech.sentences.find((s) => s.n === n)!;
    redone.set(n, checkSpeech([sentence], rc.words, speech.names)[0].ok);
    // Where the sentence is in the whole take: from its words' times, or between its neighbours' if none were heard.
    const at = checks[n];
    const before = checks.slice(0, n).reverse().find((x) => x.end !== null)?.end ?? 0;
    const after = checks.slice(n + 1).find((x) => x.start !== null)?.start ?? t.seconds;
    const start = at.start ?? before;
    const end = at.end ?? after;
    spliced.push({ start, end: Math.max(start, end), seconds: rt.seconds, words: rc.words });
    total += r.audio.length;
    audio.push({ role: 'redo', sentence: n, replacesStart: start, replacesEnd: Math.max(start, end), mp3: r.audio, sha256: rt.convertedSha256, seconds: rt.seconds });
    takes.push({ role: 'redo', sentence: n, takeSha256: rt.takeSha256, convertedSha256: rt.convertedSha256, historyDeleted: rt.historyDeleted, transcriptDeleted: rc.transcriptDeleted === true, seconds: rt.seconds, replaces: [start, Math.max(start, end)] });
  }
  if (total > 4_400_000) throw new FlowError(413, 'Too large to keep in one go');
  let check: Record<string, unknown> | null = null;
  let timeline: Record<string, unknown> | null = null;
  if (c) {
    const unmatched = checks.filter((x) => !(redone.get(x.n) ?? x.ok)).map((x) => x.n);
    // The storyboard's strip (slice 2): the joined take's word timings, and each sentence's span in it.
    const joined = joinTimeline({ words: c.words, seconds: t.seconds }, spliced);
    const spans = checkSpeech(speech.sentences, joined.words, speech.names);
    // At least as long as its last heard word (the converted audio can run a little longer than the recording).
    const length = Math.max(joined.seconds, (joined.words.at(-1)?.end ?? 0) + 0.3);
    timeline = {
      seconds: Math.round(length * 100) / 100,
      words: joined.words.map((w) => ({ text: w.text, start: Math.round(w.start * 100) / 100, end: Math.round(w.end * 100) / 100 })),
      sentences: spans.map((x, i) => ({
        n: x.n,
        start: x.start ?? spans.slice(0, i).reverse().find((y) => y.end !== null)?.end ?? 0,
        end: x.end ?? spans.slice(i + 1).find((y) => y.start !== null)?.start ?? length,
      })),
    };
    check = { sentences: speech.sentences.length, matched: speech.sentences.length - unmatched.length, unmatched, bySound: checks.flatMap((x) => x.bySound.map((b) => ({ sentence: x.n, ...b }))), names: speech.names };
  }
  const recipe = {
    provider: VOICE.provider,
    closedModel: true,
    model: t.model,
    settings: t.settings,
    outputFormat: t.outputFormat,
    transcribeModel: c?.model ?? null,
    preset,
    // The exact text it was checked against: the speech's id and version, and its sha256 (Nate, 2026-11-22).
    speech: { id: speech.id, version: speech.version, aiHelp: speech.aiHelp, credit: speech.credit, title: speech.title, source: speech.source, label: speech.label, standIn: speech.standIn, textSha256: sha256Hex(new TextEncoder().encode(speech.paragraphs.join('\n'))) },
    takes,
    // Null when the word check couldn't be made: the take is kept anyway, and says so.
    check,
    consent: { kind: 'voice_recording', sha256: t.consentSha256, perRecording: true },
    timeline,
    kept: redos.length ? 'used, with redone sentences' : 'automatically, when the conversion came back',
    madeWith: 'snowmoon.party voice (DRAFT)',
  };
  const id = await saveDraft(sql, { fid, kind: 'performance', speechId: speech.id, presetId: t.presetId, recipe, audio });
  return { id, recipe };
}

/**
 * A whole take, converted: transcribe the converted audio (never the take: transcribeConverted checks its sha256) and
 * keep it as the person's draft, before the conversion route answers, so leaving the page mid-conversion loses
 * nothing. The transcription has its own allowance; if it can't be made, the take is kept without its word check.
 */
export async function keepConvertedTake(sql: postgres.Sql, fid: number, converted: { audio: Uint8Array; ticket: string }) {
  const { flowDeps } = await import('./server');
  const { refusal, reserve } = await import('./costs');
  const { transcribeConverted, readConvertTicket, readCheckTicket } = await import('./take-flow');
  const { verifyTicket } = await import('./ticket');
  const deps = { verify: (s: string) => verifyTicket<never>(s), now: () => Date.now() };
  const ticket = readConvertTicket(deps, converted.ticket, fid);
  const speech = speechById(ticket.speechId);
  const estimate = Math.ceil(ticket.seconds * VOICE.rates.transcribeCreditsPerSecond);
  let check: CheckTicket | null = null;
  let checkTicket: string | null = null;
  let words: unknown[] = [];
  if (!(await refusal(sql, fid, estimate, false))) {
    const settle = await reserve(sql, fid, VOICE.models.transcribe, estimate, false);
    let costed = false;
    try {
      const out = await transcribeConverted(
        flowDeps(async (e) => {
          costed = true;
          await settle({ ...e, kind: 'transcribe', estimatedCredits: estimate, usd: (e.seconds / 3600) * VOICE.rates.transcribeUsdPerHour });
        }, speech?.names ?? []),
        { audio: converted.audio, ticket: converted.ticket, fid },
      );
      checkTicket = out.check;
      check = readCheckTicket(deps, out.check, fid);
      words = out.words;
    } catch {
      if (!costed) await settle(null).catch(() => {});
    }
  }
  const kept = await keepPerformance(sql, fid, { ticket, audio: converted.audio, check });
  const checks = check && speech ? checkSpeech(speech.sentences, check.words, speech.names) : null;
  return { draftId: kept.id, recipe: kept.recipe, check: checkTicket, checks, words };
}
