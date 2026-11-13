import { NextResponse } from 'next/server';
import { getPerson, signedInAs } from '~/lib/auth';
import { db } from '~/lib/db';
import { challengeVisibleTo } from '~/lib/challenge/visibility';
import { chain } from '~/lib/wallet/chain';
import { makerPicture } from '~/lib/poidh/picture';
import { prepareClaim, readStoredImage } from '~/lib/poidh/bounty';
import { pinataReady, pinFile, pinJson } from '~/lib/poidh/pinata';
import { BOUNTY_WORDING as W } from '~/lib/poidh/wording';

/**
 * POST { versionId }: prepare the maker's claim on the poidh bounty (src/lib/poidh/bounty.ts prepareClaim): the picture
 * and its record pinned to IPFS (Pinata), and createClaim's calldata for the maker's own wallet to send on Base. Only
 * for the picture's maker, with its saved backstory, and never for a Lens or Bluesky sign-in (they submit on poidh).
 */
export const runtime = 'nodejs';
export const maxDuration = 120;
const no = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const person = await getPerson(request);
  if (!challengeVisibleTo(person)) return no('Not found', 404);
  if (person === null) return no('Sign in first', 401);
  const kind = signedInAs(request);
  if (kind === 'lens' || kind === 'bluesky') return no(W.socialOnly, 403);
  const sql = db();
  if (!sql) return no('Not set up on this deployment', 503);
  let body: { versionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const versionId = typeof body.versionId === 'string' ? body.versionId.toLowerCase() : '';
  const pic = await makerPicture(sql, versionId);
  if (!pic) return no(W.pictureGone, 404);
  if (pic.byFid !== person) return no('Only its maker can submit it', 403);
  if (!pic.backstory) return no(W.saveFirst, 400);
  try {
    const r = await prepareClaim(
      { sql, reader: chain(), pin: { ready: pinataReady, file: pinFile, json: pinJson }, readImage: readStoredImage },
      person,
      { versionId, name: pic.name, pictureTitle: pic.pictureTitle, imageUrl: pic.imageUrl, imageSha256: pic.imageSha256, backstory: { id: pic.backstory.id, text: pic.backstory.text } },
    );
    if (!r.ok) return no(r.error, r.status);
    return NextResponse.json(r);
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return no(W.notSetUp, 503);
    throw e;
  }
}
