import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { jurorView, jurorsOn, saveAnswer } from '~/lib/deep-funding/jurors-db';

/**
 * The deep funding test's jurors (docs/proposals/deep-funding-runner.md). Off (404) while DEEP_FUNDING.jurors is off
 * or Privacy doesn't yet describe the jurors' answers (legal texts describe today).
 * - GET ?character=bai: the signed-in juror's questions for that character (never a model's answer).
 * - POST { character, no, choice, times } or { character, no, share }: one answer (the latest counts).
 * Jurors are added by the owner in the SQL Editor (supabase/drafts/ADD-JUROR-deep_funding.sql), never through the site.
 */
const OFF = () => NextResponse.json({ error: 'Not open' }, { status: 404 });
const characterOf = (v: unknown) => (typeof v === 'string' && CHALLENGE.characters.includes(v) ? v : null);

export async function GET(request: Request) {
  if (!jurorsOn()) return OFF();
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not set up on this deployment' }, { status: 503 });
  const character = characterOf(new URL(request.url).searchParams.get('character'));
  if (!character) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const view = await jurorView(sql, fid, character).catch(() => null);
  if (!view) return NextResponse.json({ error: 'You are not a juror for this character' }, { status: 403 });
  return NextResponse.json(view, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!jurorsOn()) return OFF();
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not set up on this deployment' }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const character = characterOf(body.character);
  if (!character) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const r = await saveAnswer(sql, fid, character, body);
  return r.ok ? NextResponse.json({ saved: body.no }) : NextResponse.json({ error: r.why }, { status: r.status });
}
