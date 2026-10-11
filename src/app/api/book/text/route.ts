import { NextResponse } from 'next/server';
import { bookCorpus } from '~/lib/book-search';

/**
 * The book's text for searching on the reader's device ("Make an image", /images/new): every
 * paragraph and quote as [chapter, idx, ¶ label, text], in reading order. The same for everyone and
 * built with the site, so nothing about a reader or a search reaches the server. Public, GPL v3.
 */
export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({ entries: bookCorpus() }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
}
