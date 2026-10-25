import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { ILLUSTRATION_CHECK } from '~/lib/config';
import { readSheet } from '~/lib/illustration-check/sheets';

/**
 * A cast sheet for the owner's drift grids (owner, 2026-10-25). Owner only: the sheets aren't published. 404 when the
 * sheet isn't stored yet (scripts/upload-cast-sheets.ts) or its bytes aren't the cast recipe's.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!ILLUSTRATION_CHECK.owners.includes(fid)) return NextResponse.json({ error: 'Owner only' }, { status: 403 });
  const { slug } = await params;
  const bytes = /^[a-z0-9-]{1,40}$/.test(slug) ? await readSheet(slug) : null;
  if (!bytes) return NextResponse.json({ error: 'No sheet stored for this character yet' }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } });
}
