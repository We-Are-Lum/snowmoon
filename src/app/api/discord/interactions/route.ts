import { after, NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { xEnv } from '~/lib/x-posts/apis';
import { handleInteraction } from '~/lib/x-posts/interactions';

/**
 * Discord's Interactions Endpoint (owner, 2026-11-25; plan docs/proposals/x-posts.md): the /xpost command, the cards'
 * buttons and the edit box in #x-posts. Not a sign-in on the site: every request must carry Discord's Ed25519 signature
 * for the app's public key (401 without it), then come from the Snowmoon server and a member with the X posts team role
 * (src/lib/x-posts/interactions.ts). 404 while X_POSTS.cards is off. Nothing it writes is published on the site; a post
 * reaches X only with 3 approvals (one from a lead) and only while X_POSTS.post is on. Never cached.
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  const raw = await request.text();
  const a = await handleInteraction(raw, request.headers, { sql: db(), env: xEnv() });
  if (a.later) after(a.later);
  return NextResponse.json(a.body, { status: a.status, headers: NO_STORE });
}
