import { NextResponse } from 'next/server';
import { recipeView, safeRecipePath } from '~/lib/recipe-view';

/**
 * The recipe sheet's data: one committed recipe file, set into a fixed template
 * (src/lib/recipe-view.ts). Only files under content/snowmoon/recipes/ are served.
 * GET ?file=content/snowmoon/recipes/…json&item=<image id or block idx>
 */
export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const file = safeRecipePath(q.get('file') ?? '');
  if (!file) return NextResponse.json({ error: 'Not a recipe file' }, { status: 400 });
  const view = recipeView(file, q.get('item') ?? undefined);
  if (!view) return NextResponse.json({ error: 'No such recipe' }, { status: 404 });
  return NextResponse.json(view, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
