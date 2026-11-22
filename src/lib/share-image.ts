/**
 * A picture the quote-card sheet can put on a card (src/components/quote-share.tsx): one of the chapter's pictures. Pure,
 * so the page, the sheet and the tests share it.
 */
export interface ShareImage {
  id: string;
  idx: number;
  url: string;
  alt: string;
  /** A picture an admin added after block `idx` (owner, 2026-11-21). */
  added?: true;
}

/**
 * The picture a new card starts with (the reader can pick another, or None). Today's rule for the edition's pictures:
 * the last one placed at or before the passage's first block. A picture an admin added after a block inside the
 * passage (its first to its last block, so a passage that ends at that block counts) is closer to the words than that,
 * so it takes its place (the first such, in the chapter's order); an added picture outside the passage never does.
 * A link or a saved card already made keeps the picture it names. Owner's rule to confirm (coding agent, 2026-11-21).
 */
export function startingImage(images: ShareImage[], from: number, to: number): ShareImage | null {
  const inside = images.find((im) => im.added && im.idx >= from && im.idx <= to);
  if (inside) return inside;
  let near: ShareImage | null = null;
  for (const im of images) if (!im.added && im.idx <= from) near = im;
  return near;
}
