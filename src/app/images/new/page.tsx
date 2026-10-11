import type { Metadata } from 'next';
import { chapterDateline, chapterNumbers, loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { renderMarkdown } from '~/lib/render';
import { IMAGES } from '~/lib/config';
import { ImageCreate, type CreateBlock } from '~/components/image-create';

export const metadata: Metadata = { title: 'Make an image' };

/**
 * "Make an image" (owner, 2026-10-10): choose the text, then the prompt. Browse a chapter and tap
 * the first and last paragraph, or search the book's text; then the composer (the same sheet as
 * in the reader) for the prompt. ?chapter=N shows that chapter; ?chapter=N&start=A&end=B (from an
 * image's page, the feed or the assistant) opens the prompt for that passage; ?pick=A (a search
 * hit) starts a selection there. Open to everyone for choosing; the composer decides who may generate.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const int = (v: string | string[] | undefined) => (typeof v === 'string' && /^\d{1,4}$/.test(v) ? Number(v) : null);

export default async function MakeAnImage({ searchParams }: Props) {
  const sp = await searchParams;
  const n = int(sp.chapter);
  const ch = n !== null ? loadChapter(n) : null;
  const chapters = chapterNumbers().map((k) => ({ n: k, dateline: chapterDateline(loadChapter(k)!) }));

  let blocks: CreateBlock[] = [];
  let initial: { start: number; end: number; open: boolean } | null = null;
  let badLink = sp.chapter !== undefined && !ch;
  if (ch) {
    const facts = blockFacts(ch.blocks);
    // The blocks a passage can hold here: paragraphs and quotes, which can be tapped, and screens and figures between them.
    blocks = ch.blocks.flatMap((b, i): CreateBlock[] => {
      if (b.kind === 'paragraph' || b.kind === 'quote') return [{ idx: b.idx, kind: b.kind, label: facts[i].label, html: renderMarkdown(b) }];
      if (b.kind === 'screen' || b.kind === 'figure') return [{ idx: b.idx, kind: b.kind, label: facts[i].label, html: null }];
      return [];
    });
    const tappable = new Set(blocks.filter((b) => b.html !== null).map((b) => b.idx));
    const start = int(sp.start), end = int(sp.end), pick = int(sp.pick);
    // The same count the server uses on Generate: every block of the chapter from start to end.
    const count = (a: number, z: number) => ch.blocks.filter((b) => b.idx >= a && b.idx <= z).length;
    const ids = new Set(blocks.map((b) => b.idx));
    if (sp.start !== undefined || sp.end !== undefined) {
      if (start !== null && end !== null && ids.has(start) && ids.has(end) && start <= end && count(start, end) <= IMAGES.maxBlocks) initial = { start, end, open: true };
      else badLink = true;
    } else if (pick !== null && tappable.has(pick)) initial = { start: pick, end: pick, open: false };
  }

  return (
    <ImageCreate
      // A new chapter or passage in the URL starts a fresh selection.
      key={[sp.chapter, sp.start, sp.end, sp.pick].map(String).join('-')}
      chapters={chapters}
      chapter={ch ? { n: ch.chapter, dateline: chapterDateline(ch), blocks, all: ch.blocks.map((b) => b.idx) } : null}
      initial={initial}
      badLink={badLink}
      maxBlocks={IMAGES.maxBlocks}
    />
  );
}
