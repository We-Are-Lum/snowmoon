import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { CHALLENGE } from '~/lib/config';
import { cardOf, chapterOf } from '~/lib/challenge/cards';
import { readerHref } from '~/lib/challenge/moments';
import { challengeVisibleTo } from '~/lib/challenge/visibility';

/**
 * "Where … appears in the book", a card's third layer on /challenge (owner, 2026-11-05; docs/proposals/challenge-moments.md
 * §1.3 S1): sent only when a reader opens it, not in the page. The book's own words, word for word, each with its
 * block and its place in the reader, in book order (src/lib/challenge/cards.ts; checked by the tests). Only the
 * challenge characters, and only to whoever may see the challenge (everyone once CHALLENGE.public is on; admins
 * before). Read-only; no database. Until 2026-11-17 it also stopped when entries closed, as principle 9's challenge
 * exception ended then; the owner retired principle 9 that day.
 */
export async function GET(request: Request) {
  const fid = CHALLENGE.public ? null : await getFid(request);
  if (!challengeVisibleTo(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const slug = new URL(request.url).searchParams.get('character') ?? '';
  const card = CHALLENGE.characters.includes(slug) ? cardOf(slug) : null;
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const passages = card.appears.map((a) => ({ block: a.block, chapter: chapterOf(a.block), quote: a.quote, href: readerHref(a.block) }));
  return NextResponse.json({ passages }, { headers: { 'Cache-Control': CHALLENGE.public ? 'public, max-age=300' : 'private, no-store' } });
}
