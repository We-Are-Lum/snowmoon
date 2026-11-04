import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { bookCharacters, designByVersion } from '~/lib/images/designs';
import { sheetChallenge } from '~/lib/challenge/sheet-lines';
import { challengeVisibleTo } from '~/lib/challenge/visibility';

/**
 * GET ?versionId=: a sheet page's remix-challenge lines and "Posted on", for admins while the challenge is admin-only
 * (CHALLENGE.public off; owner, 2026-11-04), drawn as if it were open so admins can test. Everyone but an admin gets
 * 404, as /challenge answers. Never cached.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const fid = await getFid(request);
  if (!challengeVisibleTo(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  const versionId = new URL(request.url).searchParams.get('versionId') ?? '';
  if (!sql || !/^[0-9a-f-]{36}$/.test(versionId)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const d = await designByVersion(sql, versionId).catch(() => null);
  if (!d) return NextResponse.json({ error: 'No such version' }, { status: 404 });
  const character = d.kind === 'style' ? null : (bookCharacters().find((c) => c.name === d.entity) ?? null);
  const callName = character ? (character.name.split(' ').find((w) => !/^(Lord|General|Senator)$/.test(w)) ?? character.name) : d.entity;
  return NextResponse.json(await sheetChallenge(sql, { kind: d.kind, entity: d.entity, versionId: d.shown.versionId }, callName, true), { headers: { 'Cache-Control': 'private, no-store' } });
}
