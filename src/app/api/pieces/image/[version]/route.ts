import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { agentsOn, sql } from '~/lib/agents/core';
import { readImage } from '~/lib/agents/images';

/** A brought-in image: to anyone once published; to its own person while a draft (a token in the header). */
export async function GET(request: Request, { params }: { params: Promise<{ version: string }> }) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const { version } = await params;
  if (!/^[0-9a-f-]{36}$/.test(version)) return new NextResponse('Not found', { status: 404 });
  const [v] = await sql()<{ image_key: string | null; status: string; person: string }[]>`select v.image_key, v.status, p.person
    from studio.piece_versions v join studio.pieces p on p.id = v.piece_id where v.id = ${version}`;
  if (!v?.image_key || v.status === 'discarded') return new NextResponse('Not found', { status: 404 });
  if (v.status !== 'published' && (await getPerson(request)) !== Number(v.person)) return new NextResponse('Not found', { status: 404 });
  const bytes = await readImage(v.image_key);
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': v.status === 'published' ? 'public, max-age=300' : 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
