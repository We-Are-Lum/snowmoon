import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getPerson, signedInAs } from '~/lib/auth';
import { db } from '~/lib/db';
import { hasConsented } from '~/lib/consent';
import { ADD_BACKSTORY_WORDING as A, readAddedBackstory } from '~/lib/challenge/backstory';
import { addBackstory, checkBackstory } from '~/lib/challenge/backstories';
import { challengeVisibleTo } from '~/lib/challenge/visibility';
import { CHALLENGE_LINKS } from '~/lib/challenge/landing-wording';
import { makerPicture } from '~/lib/poidh/picture';
import { claimsView } from '~/lib/poidh/bounty';
import { claimDescription, claimTitle } from '~/lib/poidh/claim';
import { pinataReady } from '~/lib/poidh/pinata';

/**
 * A challenge picture's backstory, for its maker (owner, 2026-11-12; branch challenge-backstory-bounty).
 * GET ?versionId=: whether the signed-in person made it; if so its backstory now, the claim's ready words (to copy), how
 * many bounty claims are left and theirs on this picture, and whether this sign-in can submit from here (not a Lens or
 * Bluesky sign-in: those copy and submit on poidh). Never anything about anyone else.
 * POST { versionId, text }: a new backstory (1–3 paragraphs, BACKSTORY_MAX characters), checked by the prompt guard
 * (checkBackstory), kept as a new row (append-only; the version's body is never edited). No model writes or suggests it.
 */
const no = (error: string, status: number) => NextResponse.json({ error }, { status });
const missing = (e: unknown) => (e as { code?: string })?.code === '42P01';

export async function GET(request: Request) {
  const person = await getPerson(request);
  if (!challengeVisibleTo(person)) return no('Not found', 404);
  const sql = db();
  const versionId = (new URL(request.url).searchParams.get('versionId') ?? '').toLowerCase();
  if (!sql || person === null) return NextResponse.json({ mine: false });
  const pic = await makerPicture(sql, versionId).catch(() => null);
  if (!pic || pic.byFid !== person) return NextResponse.json({ mine: false });
  const claims = await claimsView(sql, person, versionId).catch((e) => (missing(e) ? null : Promise.reject(e)));
  const kind = signedInAs(request);
  return NextResponse.json(
    {
      mine: true,
      name: pic.name,
      backstory: pic.backstory ? { text: pic.backstory.text, at: pic.backstory.at } : null,
      title: claimTitle(pic.name, pic.pictureTitle),
      copyText: pic.backstory ? claimDescription(pic.backstory.text, versionId) : null,
      bountyUrl: CHALLENGE_LINKS.bounty,
      claims,
      // From here: the Farcaster app's wallet or a wallet sign-in (the page checks which it has); never Lens or Bluesky.
      inApp: kind !== 'lens' && kind !== 'bluesky',
      ready: pinataReady() && claims !== null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(request: Request) {
  const person = await getPerson(request);
  if (!challengeVisibleTo(person)) return no('Not found', 404);
  if (person === null) return no('Sign in first', 401);
  const sql = db();
  if (!sql) return no('Not set up on this deployment', 503);
  let body: { versionId?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const versionId = typeof body.versionId === 'string' ? body.versionId.toLowerCase() : '';
  const pic = await makerPicture(sql, versionId);
  if (!pic) return no('Not found', 404);
  if (pic.byFid !== person) return no('Only its maker can add its backstory', 403);
  if (!(await hasConsented(person))) return no('Agree to how your words are published first', 403);
  const r = readAddedBackstory({ text: body.text });
  if (!r.ok) return no(r.error, 400);
  if (pic.backstory?.text === r.backstory.text) return NextResponse.json({ backstory: { text: pic.backstory.text, at: pic.backstory.at }, unchanged: true });
  const c = await checkBackstory(sql, request, r.backstory.text, A.refused);
  if (!c.ok) return no(c.error, c.status);
  try {
    const added = await addBackstory(sql, { versionId, person, text: r.backstory.text });
    revalidatePath(`/challenge/p/${versionId}`);
    return NextResponse.json({ backstory: { text: added.text, at: added.at } });
  } catch (e) {
    if (missing(e)) return no('Adding a backstory isn’t set up yet.', 503);
    throw e;
  }
}
