import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { publicRecipe } from '~/lib/chapter-pictures/read';

/**
 * The public recipe of a chapter picture an admin redid and kept (principle 1, check:principles P1d; principle 4, P4b):
 * the model and its maker, open or closed, the look, the admin's note, the exact prompt, the reference picture's
 * sha256, the settings, and who kept it and when, with every keep and restore of that chapter picture. Anyone may read
 * it, signed in or not. A draft (never kept) answers 404, so nothing about it is public.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const r = await publicRecipe(sql, (await params).id).catch(() => null);
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(r, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
