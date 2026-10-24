import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { bakeoff, mayReadBakeoff } from '~/lib/glossary-written';

/**
 * GET /api/glossary/bakeoff: the blind bake-off's explanations, labelled A, B and C, with the program's problems and
 * the support check's counts. Owner-only (GLOSSARY_WRITTEN); everyone else gets a 404. Never the key (which label
 * is which model), a separate file that nothing in the site reads. The data is in private/ (git-ignored), so only a
 * server run on the machine that ran the bake-off has it; a deployment from GitHub answers "not run".
 */
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!mayReadBakeoff(await getFid(request))) return new NextResponse('Not found', { status: 404, headers: noStore });
  return NextResponse.json({ bakeoff: bakeoff() }, { headers: noStore });
}
