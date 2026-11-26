/**
 * A citation of the book: a block ("c4-b72") or a range ("c2-b98–b103"). Shown as a small book icon linking to its
 * first block in the reader (Nate, 2026-11-24: "remove the visible block codes … Each citation becomes a small book
 * icon"); the block id stays in the link's href and its data-block, so every quote still cites its block.
 */
export const CITE = /^c(\d+)-b(\d+)(?:–b(\d+))?$/;

/** The chapter of a citation ("c14-b31" → 14; "c2-b98–b103" → 2). */
export const citeChapter = (cite: string): number => Number(/^c(\d+)-b\d+/.exec(cite)?.[1] ?? NaN);

/** Where a citation goes in the reader: its first block. */
export const citeHref = (cite: string): string => {
  const m = /^c(\d+)-b(\d+)/.exec(cite);
  return m ? `/chapter/${m[1]}#c${m[1]}-b${m[2]}` : '/chapter/1';
};

/** The icon's accessible name and tooltip (Nate, 2026-11-24). */
export const citeLabel = (cite: string): string => `In the book: chapter ${citeChapter(cite)}`;
