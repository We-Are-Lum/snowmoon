import 'server-only';
import { NextResponse } from 'next/server';
import { getPerson } from '../auth';
import { db } from '../db';
import { VOICE } from '../config';
import { voiceAllowed, voiceTestPerson } from './flag';
import { deleteHistoryItem, elevenLabsReady, speechToSpeech, speechToText } from './elevenlabs';
import { sha256Hex, signTicket, ticketsReady, verifyTicket } from './ticket';
import { voiceStoreReady } from './store';
import type { CostEntry, FlowDeps } from './take-flow';

/**
 * Every /api/voice route starts here: 401 signed out, then the site's usual "not found" (404) for anyone the switch
 * doesn't let in (src/lib/voice/flag.ts), so the routes don't exist for them.
 */
export async function voicePerson(request: Request): Promise<{ fid: number } | NextResponse> {
  const fid = voiceTestPerson(request) ?? (await getPerson(request));
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!voiceAllowed(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return { fid };
}

export const voiceReady = () => Boolean(db() && elevenLabsReady() && ticketsReady() && voiceStoreReady());

/** The take flow's real dependencies: ElevenLabs, our tickets, and a cost recorder that settles this request's hold. */
export function flowDeps(cost: (e: CostEntry) => Promise<void>, keyterms: string[] = []): FlowDeps {
  return {
    sha256: sha256Hex,
    convert: speechToSpeech,
    deleteHistory: deleteHistoryItem,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    transcribe: (audio) => speechToText(audio, keyterms),
    sign: signTicket,
    verify: (s) => verifyTicket(s),
    cost,
    now: () => Date.now(),
    convertModel: VOICE.models.convert,
    transcribeModel: VOICE.models.transcribe,
    settings: VOICE.convertSettings,
    outputFormat: VOICE.outputFormat,
    ticketMinutes: VOICE.ticketMinutes,
    creditsPerMinute: VOICE.rates.convertCreditsPerMinute,
  };
}

export const noStore = { 'cache-control': 'no-store' };
