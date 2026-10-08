import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { IMAGES, SYSTEM_FID } from '~/lib/config';
import { checkStorage } from '~/lib/images/store';

/**
 * The maintainer's storage check (owner, 2026-10-08): from production, with production's key,
 * show that readers' images can be written to their own bucket and served from its address, and
 * that the key cannot write to the book's media bucket. Maintainer only. Writes one small text
 * file to each bucket and deletes it. Also says which variables the image flow still lacks (names only).
 */
export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (fid !== SYSTEM_FID) return NextResponse.json({ error: 'Maintainer only' }, { status: 403 });
  const vars = ['FAL_KEY', 'IMAGES_TICKET_SECRET', 'GROQ_API_KEY', 'STUDIO_DATABASE_URL'].filter((k) => !process.env[k]);
  const storage = await checkStorage();
  return NextResponse.json({ enabled: IMAGES.enabled, missingOther: vars, storage }, { headers: { 'Cache-Control': 'no-store' } });
}
