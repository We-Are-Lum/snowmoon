import { localPublic } from '~/lib/voice/public-store';

/**
 * The local test copy's public files (VOICE_TEST_ON only, never on Vercel): a published storyboard's audio, pictures and
 * closing card. On production they are in the public bucket instead, and this answers 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const f = localPublic((await params).key.join('/'));
  if (!f) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(f.bytes), { headers: { 'content-type': f.type, 'cache-control': 'no-store' } });
}
