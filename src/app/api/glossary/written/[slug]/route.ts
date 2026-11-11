import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { mayRead, writtenFor } from '~/lib/glossary-written';

/**
 * GET /api/glossary/written/<slug>?through=<chapter>: a word's model-written explanation, only the sentences whose
 * latest citation is in chapter `through` or earlier, and how many wait. Owner-only for now (GLOSSARY_WRITTEN,
 * owner 2026-10-23: "nothing public until I've read it"): anyone else, signed in or not, gets the same 404.
 */
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!mayRead(await getFid(request))) return new NextResponse('Not found', { status: 404, headers: noStore });
  const { slug } = await params;
  const through = Number(new URL(request.url).searchParams.get('through') ?? 1);
  const w = /^[a-z0-9-]{1,80}$/.test(slug) ? writtenFor(slug, through) : null;
  if (!w) return new NextResponse('Not found', { status: 404, headers: noStore });
  return NextResponse.json(w, { headers: noStore });
}
