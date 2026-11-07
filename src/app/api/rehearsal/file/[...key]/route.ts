import { rehearsalFile } from '~/lib/images/store';

/**
 * The rehearsal's pictures (branch contest, 2026-11-04): the public half of the rehearsal's own store
 * (src/lib/images/store.ts, rehearsalStore), served only under the rehearsal switch (this machine, never on Vercel).
 * Everywhere else, and for any key outside the store's two forms, "not found".
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join('/');
  const bytes = rehearsalFile(key);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': key.endsWith('.webp') ? 'image/webp' : 'image/jpeg', 'Cache-Control': 'no-store' } });
}
