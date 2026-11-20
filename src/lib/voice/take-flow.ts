/**
 * The raw take's whole path on our server (raw voice takes exception, docs/principles.md; P1h). On purpose this file
 * has no runtime imports: everything it touches comes in through `deps`, so check:principles can run it, and planted
 * copies of it, against a stub, and see exactly where a take goes.
 *
 * What it promises:
 * - the take is passed to one place only: ElevenLabs' speech-to-speech call (deps.convert), and to sha256;
 * - nothing here writes it anywhere, logs it, or returns it; its bytes are zeroed when the call ends, however it ends;
 * - the conversion's history item is deleted at ElevenLabs right after (deps.deleteHistory);
 * - transcription (deps.transcribe) only ever gets converted audio: audio whose sha256 is a conversion's, never a take's;
 * - a cost is recorded with numbers only (no audio, no hash).
 */
import type { HeardWord } from './match';

export type Scope = { kind: 'whole' } | { kind: 'sentence'; n: number };

/** A conversion's signed record: what the device may later accept, and nothing it can forge. */
export interface ConvertTicket {
  v: 1;
  kind: 'convert';
  fid: number;
  speechId: string;
  presetId: string;
  candidate: number | null;
  voiceId: string;
  model: string;
  settings: Record<string, unknown>;
  outputFormat: string;
  scope: Scope;
  consentSha256: string;
  takeSha256: string;
  convertedSha256: string;
  historyDeleted: boolean;
  seconds: number;
  issuedAt: number;
  expiresAt: number;
}
export interface CheckTicket {
  v: 1;
  kind: 'check';
  fid: number;
  convertedSha256: string;
  model: string;
  words: HeardWord[];
  issuedAt: number;
  expiresAt: number;
}

export interface CostEntry {
  kind: 'convert' | 'transcribe';
  ok: boolean;
  seconds: number;
  estimatedCredits: number;
  credits: number | null;
}

export interface FlowDeps {
  sha256(bytes: Uint8Array): string;
  convert(take: Uint8Array, mime: string, voiceId: string): Promise<{ audio: Uint8Array; historyItemId: string | null; credits: number | null }>;
  deleteHistory(id: string): Promise<void>;
  transcribe(audio: Uint8Array): Promise<{ words: HeardWord[]; credits: number | null }>;
  sign(t: ConvertTicket | CheckTicket): string;
  verify(s: string): ConvertTicket | CheckTicket | null;
  cost(e: CostEntry): Promise<void>;
  now(): number;
  convertModel: string;
  transcribeModel: string;
  settings: Record<string, unknown>;
  outputFormat: string;
  ticketMinutes: number;
  creditsPerMinute: number;
}

export class FlowError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface ConvertInput {
  take: Uint8Array;
  mime: string;
  seconds: number;
  fid: number;
  speechId: string;
  presetId: string;
  candidate: number | null;
  voiceId: string;
  scope: Scope;
  consentSha256: string;
}

export const estimateConvertCredits = (seconds: number, perMinute: number) => Math.ceil((Math.max(0, seconds) / 60) * perMinute);

/** Convert one take. Returns the converted audio and its signed record; the take itself is gone when this returns. */
export async function convertTake(deps: FlowDeps, input: ConvertInput): Promise<{ audio: Uint8Array; ticket: string }> {
  const { take } = input;
  try {
    const takeSha256 = deps.sha256(take);
    const estimatedCredits = estimateConvertCredits(input.seconds, deps.creditsPerMinute);
    let out: { audio: Uint8Array; historyItemId: string | null; credits: number | null };
    try {
      out = await deps.convert(take, input.mime, input.voiceId);
    } catch {
      // The provider's error text is not passed on: it could quote what it received.
      await deps.cost({ kind: 'convert', ok: false, seconds: input.seconds, estimatedCredits, credits: null });
      throw new FlowError(502, 'The conversion failed. Your recording was not kept. Try again.');
    }
    let historyDeleted = false;
    if (out.historyItemId) {
      for (let attempt = 0; attempt < 2 && !historyDeleted; attempt++) {
        try {
          await deps.deleteHistory(out.historyItemId);
          historyDeleted = true;
        } catch {
          // Tried twice; the recipe says whether it was deleted.
        }
      }
    }
    await deps.cost({ kind: 'convert', ok: true, seconds: input.seconds, estimatedCredits, credits: out.credits });
    const convertedSha256 = deps.sha256(out.audio);
    if (convertedSha256 === takeSha256) throw new FlowError(502, 'The conversion came back unchanged. Your recording was not kept.');
    const now = deps.now();
    const ticket: ConvertTicket = {
      v: 1,
      kind: 'convert',
      fid: input.fid,
      speechId: input.speechId,
      presetId: input.presetId,
      candidate: input.candidate,
      voiceId: input.voiceId,
      model: deps.convertModel,
      settings: deps.settings,
      outputFormat: deps.outputFormat,
      scope: input.scope,
      consentSha256: input.consentSha256,
      takeSha256,
      convertedSha256,
      historyDeleted,
      seconds: input.seconds,
      issuedAt: now,
      expiresAt: now + deps.ticketMinutes * 60_000,
    };
    return { audio: out.audio, ticket: deps.sign(ticket) };
  } finally {
    take.fill(0);
  }
}

/** A conversion's record, checked: signed by us, this person's, not expired. */
export function readConvertTicket(deps: Pick<FlowDeps, 'verify' | 'now'>, s: string, fid: number): ConvertTicket {
  const t = deps.verify(s);
  if (!t || t.kind !== 'convert' || t.fid !== fid) throw new FlowError(400, 'That conversion is not yours, or not ours.');
  if (t.expiresAt < deps.now()) throw new FlowError(410, 'That conversion has expired. Record it again.');
  return t;
}
export function readCheckTicket(deps: Pick<FlowDeps, 'verify' | 'now'>, s: string, fid: number): CheckTicket {
  const t = deps.verify(s);
  if (!t || t.kind !== 'check' || t.fid !== fid) throw new FlowError(400, 'That check is not yours, or not ours.');
  if (t.expiresAt < deps.now()) throw new FlowError(410, 'That check has expired.');
  return t;
}

/**
 * Transcribe converted audio, with word timings. Only audio that one of our conversions produced is sent: its sha256
 * must be the ticket's converted file, and never the take's.
 */
export async function transcribeConverted(deps: FlowDeps, input: { audio: Uint8Array; ticket: string; fid: number }): Promise<{ convert: ConvertTicket; words: HeardWord[]; check: string }> {
  const convert = readConvertTicket(deps, input.ticket, input.fid);
  const sha = deps.sha256(input.audio);
  if (sha !== convert.convertedSha256 || sha === convert.takeSha256) throw new FlowError(400, 'Only the converted speech can be transcribed.');
  let words: HeardWord[];
  let credits: number | null;
  try {
    ({ words, credits } = await deps.transcribe(input.audio));
  } catch {
    await deps.cost({ kind: 'transcribe', ok: false, seconds: convert.seconds, estimatedCredits: 0, credits: null });
    throw new FlowError(502, 'The transcription failed. Try again.');
  }
  await deps.cost({ kind: 'transcribe', ok: true, seconds: convert.seconds, estimatedCredits: 0, credits });
  const now = deps.now();
  const check: CheckTicket = { v: 1, kind: 'check', fid: input.fid, convertedSha256: sha, model: deps.transcribeModel, words, issuedAt: now, expiresAt: now + deps.ticketMinutes * 60_000 };
  return { convert, words, check: deps.sign(check) };
}
