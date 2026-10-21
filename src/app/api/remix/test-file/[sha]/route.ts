import { readTestFile } from '~/lib/remix/frames';

type Ctx = { params: Promise<{ sha: string }> };

/** The local tests' stand-in for the readers' bucket (REMIX_TEST_FAKES and REMIX_TEST_STORE only; never on Vercel). */
export async function GET(_request: Request, { params }: Ctx) {
  const { sha } = await params;
  const bytes = readTestFile(sha);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
}
