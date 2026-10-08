import { loadChapter } from '../book';
import { blockFacts, labelRange } from '../reading';

/** "¶ 4–9" for a passage, as readers see the book's paragraph numbers; null if it has none. */
export function passageLabel(chapter: number, start: number, end: number): string | null {
  const ch = loadChapter(chapter);
  if (!ch) return null;
  const facts = blockFacts(ch.blocks);
  const labels = ch.blocks.map((b, i) => (b.idx >= start && b.idx <= end ? facts[i].label : null)).filter((l): l is number => l !== null);
  return labels.length ? labelRange(labels[0], labels[labels.length - 1]) : null;
}

/** The passage's own words, for the composer and the image page (book text, never sent to a model). */
export function passageBlocks(chapter: number, start: number, end: number) {
  const ch = loadChapter(chapter);
  if (!ch) return [];
  const facts = blockFacts(ch.blocks);
  return ch.blocks
    .map((b, i) => ({ idx: b.idx, kind: b.kind, content: b.content, label: facts[i].label }))
    .filter((b) => b.idx >= start && b.idx <= end);
}
