import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPerson, getWallet } from '~/lib/auth';
import { db } from '~/lib/db';
import { TAKES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { mayGenerate } from '~/lib/images/gate';
import { bylineName } from '~/lib/names';
import { shortAddress } from '~/lib/wallet/session';
import { tryAgain } from '~/lib/try-again';
import { takeLine } from '~/lib/takes/line';
import { ConvertUnavailable, convertTake, takesFakes } from '~/lib/takes/convert';
import { lineTakes, putTake, reserveTake, saveTake, settleTake, takeStorageReady } from '~/lib/takes/store';

/**
 * "Record your own takes", v1 (owner, 2026-10-19). POST: the person's recording of one line, as the raw
 * request body (audio/webm, audio/ogg, audio/mp4, audio/mpeg or audio/wav, at most TAKES.maxBytes),
 * with ?adaptation=&version=&cue= . It is converted on our own Chatterbox deployment on Modal. The order is Remix's: sign-in, consent, the Pictures gate, the daily
 * count and free cap (or a wallet's prepaid balance). The recording is sent to the conversion model and
 * dropped: it is never written to storage, the database or a log; only its sha256 is kept, in the
 * recipe. The converted take is stored, labelled AI-converted, and attached to the line. GET: the line's
 * shown takes. SWITCHED OFF (TAKES.enabled) until the texts are reread and migration 0016 is applied.
 */
const no = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
const on = () => TAKES.enabled || takesFakes();

function lineOf(url: URL) {
  const adaptation = Number(url.searchParams.get('adaptation')), version = Number(url.searchParams.get('version'));
  const cue = url.searchParams.get('cue') ?? '';
  if (!Number.isInteger(adaptation) || !Number.isInteger(version) || adaptation <= 0 || version <= 0) return null;
  const line = takeLine(adaptation, version, cue);
  return line ? { adaptation, version, line } : null;
}

export async function GET(request: Request) {
  if (!on()) return no('Recording takes is not open yet', 404);
  const sql = db();
  if (!sql) return no('Not available here', 503);
  const l = lineOf(new URL(request.url));
  if (!l) return no('No such line', 404);
  try {
    const takes = await lineTakes(sql, l.version, l.line.cue);
    return NextResponse.json({ takes: takes.map((t) => ({ id: t.id, url: t.audioUrl, seconds: t.seconds, by: t.byName, at: t.createdAt, label: TAKES.label })) });
  } catch (e) {
    return tryAgain('takes list', e);
  }
}

export async function POST(request: Request) {
  if (!on()) return no('Recording takes is not open yet', 404);
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in to record a take' }, { status: 401 });
  const sql = db();
  if (!sql || !(takesFakes() || (process.env.MODAL_TAKES_URL && process.env.MODAL_TAKES_KEY)) || !takeStorageReady()) return no('Recording takes is not set up on this deployment', 503);
  const l = lineOf(new URL(request.url));
  if (!l) return no('No such line', 404);
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!(TAKES.contentTypes as readonly string[]).includes(type)) return no('Record in the browser, then send it', 415);
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > TAKES.maxBytes) return no(`A take can be up to ${TAKES.maxSeconds} seconds`, 413);
  const raw = Buffer.from(await request.arrayBuffer());
  if (!raw.length || raw.length > TAKES.maxBytes) return no(`A take can be up to ${TAKES.maxSeconds} seconds`, 413);

  try {
    const [v] = await sql`select 1 from studio.adaptation_versions where id = ${l.version} and adaptation_id = ${l.adaptation} and not hidden`;
    if (!v) return no('No such version', 404);
    if (!(await hasConsented(person))) return no('Agree to how your recordings and words are used first', 403, { reason: 'consent' });
    const gate = await mayGenerate(sql, person);
    if (!gate.ok) return no(gate.error, gate.status, { reason: gate.reason });
    const r = await reserveTake(sql, person);
    if (!r.ok) {
      const why = { limit: 'That is all your takes for today', spend: "Today's free takes are used up", balance: 'Add funds to record a take', 'prepaid-spend': "Today's paid takes are used up" }[r.refusal];
      return no(why, r.refusal === 'balance' ? 402 : 429, { reason: r.refusal });
    }
    let made;
    try {
      made = await convertTake(raw, type, l.line.target.src);
    } catch (e) {
      await settleTake(sql, person, 0);
      if (e instanceof ConvertUnavailable) return no('The voice model is not answering. Try again in a moment.', 503, { retry: true });
      throw e;
    }
    await settleTake(sql, person, made.costUsd);
    if (made.seconds > TAKES.maxSeconds + 1) return no(`A take can be up to ${TAKES.maxSeconds} seconds`, 413);
    const sha256 = createHash('sha256').update(made.bytes).digest('hex');
    const url = await putTake(sha256, made.bytes, made.contentType);
    const wallet = person < 0 ? getWallet(request) : null;
    const by = wallet ? { name: shortAddress(wallet.address), source: 'wallet' as const } : await bylineName(person, null);
    const m = TAKES.model;
    const take = await saveTake(sql, {
      adaptationId: l.adaptation,
      versionId: l.version,
      cue: l.line.cue,
      person,
      speaker: l.line.speaker,
      audioUrl: url,
      audioSha256: sha256,
      seconds: made.seconds,
      costUsd: made.costUsd,
      byName: by.name,
      recipe: {
        kind: 'line-take',
        label: TAKES.label,
        line: { cue: l.line.cue, speaker: l.line.speaker, text: l.line.text },
        model: { id: m.id, name: m.name, licence: m.licence, weights: m.weights, endpoint: m.endpoint, host: m.host },
        target_voice: { served: l.line.target.src, sha256: l.line.target.sha256, name: l.line.target.name, what: "the character's converted voice as published with this version" },
        // The recording itself is never kept: its sha256 only, so the recipe can say which recording it was.
        performance: { by_name: by.name, kept: false, sha256: made.rawSha256, content_type: type, bytes: raw.length },
        request_id: made.requestId,
        made_at: new Date().toISOString(),
        output_sha256: sha256,
        seconds: made.seconds,
        cost_usd: made.costUsd,
        host_terms: 'Modal may not train any AI model on what we send (its terms, effective May 2026, section 5.5)',
        watermark: "Resemble AI's Perth implicit watermark, applied by Chatterbox's own code to every output",
        ...(takesFakes() ? { test: 'made by the local test stand-in, not a model' } : {}),
      },
    });
    return NextResponse.json({ id: take.id, url, seconds: take.seconds, label: TAKES.label }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return tryAgain('take convert', e);
  }
}
