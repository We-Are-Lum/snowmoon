import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson, voiceReady } from '~/lib/voice/server';
import { verifyTicket } from '~/lib/voice/ticket';
import { keepPerformance } from '~/lib/voice/keep-converted';
import { FlowError, readCheckTicket, readConvertTicket } from '~/lib/voice/take-flow';

export const maxDuration = 60;

const deps = { verify: (s: string) => verifyTicket<never>(s), now: () => Date.now() };

/**
 * "Use this one" (Nate, 2026-11-22): keep a converted take with its redone sentences as a private draft. A whole take is
 * already kept by the conversion route as soon as it is converted; this keeps the version with redos. Only converted
 * audio our conversions made can be kept (each file's sha256 must be its signed record's), with the word checks our
 * transcription made (src/lib/voice/keep-converted.ts).
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
    const c = readCheckTicket(deps, String(form.get('check') ?? ''), who.fid);
    const files = form.getAll('redo');
    const tickets = form.getAll('redoTicket').map(String);
    const redoChecks = form.getAll('redoCheck').map(String);
    if (files.length !== tickets.length || files.length !== redoChecks.length || files.length > 20) throw new FlowError(400, 'Each redone sentence needs its file, its record and its check');
    const redos = [];
    for (const [i, f] of files.entries()) {
      if (!(f instanceof Blob)) throw new FlowError(400, 'A redone sentence is missing its file');
      redos.push({ ticket: readConvertTicket(deps, tickets[i], who.fid), audio: new Uint8Array(await f.arrayBuffer()), check: readCheckTicket(deps, redoChecks[i], who.fid) });
    }
    const { id, recipe } = await keepPerformance(sql, who.fid, { ticket: t, audio: new Uint8Array(await main.arrayBuffer()), check: c }, redos);
    return NextResponse.json({ id, recipe }, { headers: noStore });
  } catch (e) {
    if (e instanceof FlowError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Something went wrong; nothing was kept' }, { status: 500 });
  }
}
