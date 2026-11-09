import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { addBackstory, checkBackstory } from '~/lib/challenge/backstories';

/**
 * "Add backstory" (owner, 2026-11-09): an admin adds one to their own published challenge picture or first remix
 * (CHALLENGE.firstRemixes). POST { versionId, backstory: { text, spoils } }. The same box, tick and prompt check as at
 * publish; one row of studio.challenge_backstories (NEXT_challenge_backstories.sql), so the version, its id, page and
 * lineage stay as they are (element_versions is append-only). Refused for anyone else, and for anyone's else picture.
 */
export async function POST(request: Request) {
  const who = await getPerson(request);
  if (who === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not set up on this deployment' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { versionId?: unknown; backstory?: unknown };
  const versionId = typeof body.versionId === 'string' ? body.versionId.toLowerCase() : '';
  const r = await addBackstory(sql, who, versionId, body.backstory, (text) => checkBackstory(sql, request, text));
  if (!r.ok) return NextResponse.json({ error: r.error, reason: 'backstory' }, { status: r.status });
  revalidatePath(`/challenge/p/${versionId}`);
  revalidatePath(`/references/designs/${versionId}`);
  return NextResponse.json({ backstory: r.backstory }, { headers: { 'Cache-Control': 'no-store' } });
}
