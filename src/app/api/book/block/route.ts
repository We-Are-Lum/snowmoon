import { NextResponse } from 'next/server';
import { blockId, loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { renderMarkdown } from '~/lib/render';
import { blockIdOk, chapterOf } from '~/lib/chat/sanitize';

/**
 * One block of the book, as stored: what a private thread shows when it was opened
 * from "Ask about this" (the passage card). The book is public (GPL v3) and this is
 * the same text the reader shows; nothing about the asker is sent or kept.
 * GET ?id=c1-b19 → { id, chapter, label, html }.
 */
export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!blockIdOk(id)) return NextResponse.json({ error: 'Not a block id' }, { status: 400 });
  const n = chapterOf(id)!;
  const ch = loadChapter(n);
  const i = ch?.blocks.findIndex((b) => blockId(n, b.idx) === id) ?? -1;
  if (!ch || i < 0) return NextResponse.json({ error: 'No such block' }, { status: 404 });
  const b = ch.blocks[i];
  const label = blockFacts(ch.blocks)[i].label;
  const html = b.kind === 'paragraph' || b.kind === 'quote' ? renderMarkdown(b) : b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return NextResponse.json({ id, chapter: n, label, html }, { headers: { 'Cache-Control': 'public, max-age=86400, immutable' } });
}
