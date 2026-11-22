import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { REF_WORDING, referenceFromLink, searchReferences } from '~/lib/chapter-pictures/references';

/**
 * For the chapter-picture sheets' reference picker (owner's request via Garance, 2026-11-21): published pictures to
 * pick as references. ?q=<words> searches by maker, character, words or a sheet's title; ?link=<address> reads a pasted
 * snowmoon.party link to the version it names, on the server, and refuses anything hidden, not published or not
 * found. Each answer gives the picture's kind, what it is, its maker, its page and its thumbnail; picking it is only
 * sending its version id with Make, where it is checked again. Admins only: anyone else gets 401 or 404.
 */
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available on this copy of the site' }, { status: 503 });
  const q = new URL(request.url).searchParams;
  const show = (r: { versionId: string; kind: string; what: string; by: string; href: string; url: string }) => ({ versionId: r.versionId, kind: r.kind, what: r.what, by: r.by, href: r.href, thumb: r.url });
  if (q.has('link')) {
    const r = await referenceFromLink(sql, q.get('link'));
    if (!r.ok) return NextResponse.json({ error: r.error, reason: r.reason }, { status: r.reason === 'not-a-link' ? 400 : r.reason === 'not-found' ? 404 : 409, headers: noStore });
    return NextResponse.json({ ref: show(r.ref) }, { headers: noStore });
  }
  const words = (q.get('q') ?? '').trim();
  if (words.replace(/^@/, '').length < 2) return NextResponse.json({ error: REF_WORDING.shortQuery, results: [] }, { status: 400, headers: noStore });
  const results = await searchReferences(sql, words).catch(() => []);
  return NextResponse.json({ results: results.map(show) }, { headers: noStore });
}
