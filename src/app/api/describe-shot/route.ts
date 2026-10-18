import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { CHAT } from '~/lib/config';
import { directKey, gatewayToken, promptFile, servingAllowed, ModelUnavailable } from '~/lib/chat/model';
import { record, reserve, usedToday } from '~/lib/chat/limits';
import { applyChange, BadRequest, parseRequest, stateFor, toolFor } from '~/lib/describe/shot';
import { callTool, describeFakes, fakeTool, worstCaseUsd } from '~/lib/describe/model';

/**
 * "Describe the shot" in the live shot editor (branch describe-shot, 2026-10-18). Signed-in (Farcaster)
 * people only, like the assistant, and counted in the assistant's own daily limit and spend cap
 * (CHAT.messagesPerDay per FID; CHAT.dailySpendCapUsd across everyone), so no new table is needed.
 * The words and the shot's camera, people and named places go to the model; the answer is checked and
 * clamped (src/lib/describe/shot.ts) and only numbers come back. Nothing is published, and nothing
 * reaches an image model: the editor applies the new camera like a preset, and Remix's Generate is a
 * separate step with its own prompt check. The words are never stored or logged.
 *
 * GET: { ready, signedIn, left, perDay }. POST: { words, set, ground, camera, places, size, setup }
 * → { camera, clamped, changed, left }.
 */
async function who(request: Request): Promise<number | null> {
  if (describeFakes()) {
    const m = (request.headers.get('authorization') ?? '').match(/^Bearer describe-test\.(\d{1,9})$/);
    if (m) return Number(m[1]);
  }
  return getFid(request);
}

const ready = (request: Request) => !!db() && (describeFakes() || ((!!gatewayToken(request) || !!directKey()) && servingAllowed()));
const SIGN_IN = 'Sign in with Farcaster to describe a shot';

export async function GET(request: Request) {
  const fid = await who(request);
  const base = { ready: ready(request), signedIn: fid !== null, perDay: CHAT.messagesPerDay, provider: CHAT.providerName, model: CHAT.modelName };
  if (fid === null || !base.ready) return NextResponse.json(base);
  try {
    const used = await usedToday(db()!, fid);
    return NextResponse.json({ ...base, left: Math.max(0, CHAT.messagesPerDay - used) });
  } catch (e) {
    console.error('describe status failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ ...base, ready: false });
  }
}

export async function POST(request: Request) {
  const fid = await who(request);
  if (fid === null) return NextResponse.json({ error: SIGN_IN }, { status: 401 });
  const sql = db();
  if (!sql || !ready(request)) return NextResponse.json({ error: 'Describing a shot is not available on this deployment' }, { status: 503 });
  let req;
  try {
    req = parseRequest(await request.json().catch(() => null));
  } catch (e) {
    if (e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  try {
    const slot = await reserve(sql, fid, worstCaseUsd());
    if (!slot.ok)
      return slot.reason === 'limit'
        ? NextResponse.json({ error: `That’s today’s ${CHAT.messagesPerDay}: shared with the assistant. More tomorrow.` }, { status: 429 })
        : NextResponse.json({ error: 'Busy today: try again tomorrow.' }, { status: 503 });
    const messages = [
      { role: 'system' as const, content: promptFile('describe-shot.md') },
      { role: 'user' as const, content: `The shot now:\n${JSON.stringify(stateFor(req))}\n\nThe person's words:\n${req.words}` },
    ];
    const reply = describeFakes() ? fakeTool(req) : await callTool(gatewayToken(request), messages, toolFor(req));
    if (!describeFakes()) await record(sql, { kind: 'answer', model: CHAT.model, provider: reply.provider, promptTokens: reply.promptTokens, completionTokens: reply.completionTokens, costUsd: reply.costUsd, guard: null });
    const applied = applyChange(req, reply.args);
    if (!applied.ok) return NextResponse.json({ error: 'The model’s answer couldn’t be used. Try other words.', left: slot.left }, { status: 422 });
    return NextResponse.json({ camera: applied.camera, clamped: applied.clamped, changed: applied.changed, left: slot.left });
  } catch (e) {
    if (e instanceof ModelUnavailable) return NextResponse.json({ error: 'The model did not answer. Try again in a moment.' }, { status: 502 });
    // Only the error's type: never the words.
    console.error('describe shot failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
