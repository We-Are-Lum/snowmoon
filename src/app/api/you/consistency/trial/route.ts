import { readFileSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { SYSTEM_FID } from '~/lib/config';
import { trialFile } from '~/lib/consistency';

/**
 * One picture of the consistency trial (owner, 2026-10-23), owner-only. The trial's pictures are never published
 * and never committed: they live in images-out/trial on the owner's Mac, so this answers only on a local build
 * there, only for FID 6786, and only for a file the trial's own recipe lists. Everyone else gets the same 404.
 */
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const person = await getPerson(request);
  if (person !== SYSTEM_FID) return new NextResponse('Not found', { status: 404, headers: noStore });
  const file = trialFile(new URL(request.url).searchParams.get('file') ?? '');
  if (!file) return new NextResponse('Not found', { status: 404, headers: noStore });
  return new NextResponse(new Uint8Array(readFileSync(file)), { headers: { ...noStore, 'Content-Type': 'image/png' } });
}
