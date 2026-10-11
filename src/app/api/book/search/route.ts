import { NextResponse } from 'next/server';
import { searchBook } from '~/lib/book-search';

/**
 * Search the book's text, for "Make an image" (/images/new). GET ?q=Kalimar →
 * { q, hits: [{ chapter, idx, label, before, match, after }], more }. Up to 20 hits, in reading order.
 * Read-only and public: the committed text (GPL v3), searched in memory. The query is not logged
 * or stored by this site, and no one is asked to sign in.
 */
export function GET(request: Request) {
  const r = searchBook(new URL(request.url).searchParams.get('q') ?? '');
  if (!r.ok) return NextResponse.json({ error: r.error, hits: [] }, { status: 400 });
  return NextResponse.json(r, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
