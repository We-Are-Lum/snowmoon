import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { CardError, cardSpec, saveCard } from '~/lib/cards';

/** Save a quote card for the signed-in reader. Body: { chapter, range, q?, img? }. */
export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to save cards' }, { status: 401 });
  try {
    const input = (await request.json()) as { chapter?: unknown; range?: unknown; q?: unknown; img?: unknown };
    const { spec, quote } = cardSpec({
      chapter: Number(input.chapter),
      range: String(input.range ?? ''),
      q: typeof input.q === 'string' ? input.q : null,
      img: typeof input.img === 'string' ? input.img : null,
    });
    const { versionId, created } = await saveCard(fid, spec, quote);
    return NextResponse.json({ versionId, path: `/card/${versionId}`, created }, { status: created ? 201 : 200 });
  } catch (e) {
    if (e instanceof CardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('save card', e);
    return NextResponse.json({ error: 'Could not save the card' }, { status: 500 });
  }
}
