import { scenePlaceholder } from '~/lib/voice/take-pictures';

/** A ready-made scene's picture (a placeholder card until the images session's scene pictures are approved). */
export async function GET(request: Request) {
  const bytes = await scenePlaceholder(String(new URL(request.url).searchParams.get('id') ?? ''));
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' } });
}
