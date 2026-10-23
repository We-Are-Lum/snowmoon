import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { bakeoff, mayReadBakeoff } from '~/lib/glossary-written';

/**
 * GET /api/glossary/bakeoff: the blind bake-off's explanations, labelled A, B and C, with the program's problems and
 * the support check's counts. Owner-only (GLOSSARY_WRITTEN); everyone else gets a 404. Never the key: which label
 * is which model is in private/glossary-bakeoff/key.json, which is not in the repository or the deployment.
 */
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!mayReadBakeoff(await getFid(request))) return new NextResponse('Not found', { status: 404, headers: noStore });
  return NextResponse.json({ bakeoff: bakeoff() }, { headers: noStore });
}
