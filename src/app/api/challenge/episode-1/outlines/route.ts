import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getPerson } from '~/lib/auth';
import { isWalletPerson, isSocialPerson } from '~/lib/people';
import { db } from '~/lib/db';
import { bylineName } from '~/lib/names';
import { socialByline } from '~/lib/social/byline';
import { readOutline } from '~/lib/challenge/episode/rules';
import { listOutlines, submitOutline, withdrawOutline } from '~/lib/challenge/episode/outlines';
import { episodeVisibleTo } from '~/lib/challenge/episode/visibility';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';

/**
 * Episode 1's outlines (owner, 2026-11-24). GET: every shown outline, newest first (for the admins' view while the
 * challenge is off; the public list page reads the database itself). POST { title, cards, minuteAfter, nameProof }:
 * Submit, checked by readOutline and submitOutline (window, pictures, the account check once, three live each).
 * DELETE { id }: withdraw one's own. While EPISODE.public is off, every method answers 404 to everyone but an admin.
 * Nothing about the outline is logged: errors log only their type.
 */
const no = (error: string, status: number, extra: object = {}) => NextResponse.json({ error, ...extra }, { status });
const NOT_FOUND = () => no('Not found', 404);

export async function GET(request: Request) {
  const person = await getPerson(request);
  if (!episodeVisibleTo(person)) return NOT_FOUND();
  const sql = db();
  if (!sql) return NextResponse.json({ outlines: [] });
  return NextResponse.json({ outlines: await listOutlines(sql) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const person = await getPerson(request);
  if (!episodeVisibleTo(person)) return NOT_FOUND();
  if (person === null) return no(W.signInToSubmit, 401);
  if (isWalletPerson(person)) return no(W.walletCantSubmit, 403);
  const sql = db();
  if (!sql) return no('Not set up on this deployment', 503);
  let body: { nameProof?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const read = readOutline(body);
  if (!read.ok) return no(read.problems[0].why, 400, { problems: read.problems });
  try {
    const by = isSocialPerson(person) ? ((await socialByline(request, person)) ?? { name: null }) : await bylineName(person, body.nameProof);
    const r = await submitOutline(sql, person, by.name, read.outline);
    if (!r.ok) return no(r.why, r.status);
    revalidatePath('/challenge/episode-1/outlines');
    return NextResponse.json({ id: r.id, left: r.left });
  } catch (e) {
    console.error('episode: submit failed', (e as { code?: string }).code ?? (e as Error).name);
    return no('Something went wrong', 500);
  }
}

export async function DELETE(request: Request) {
  const person = await getPerson(request);
  if (!episodeVisibleTo(person)) return NOT_FOUND();
  if (person === null) return no(W.signInToSubmit, 401);
  const sql = db();
  if (!sql) return no('Not set up on this deployment', 503);
  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const r = await withdrawOutline(sql, person, String(body.id ?? ''));
  if (!r.ok) return no(r.why, r.status);
  revalidatePath('/challenge/episode-1/outlines');
  revalidatePath(`/challenge/episode-1/o/${String(body.id)}`);
  return NextResponse.json({ withdrawn: body.id, left: r.left });
}
