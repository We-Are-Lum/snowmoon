/**
 * A remix challenge picture has no passage (owner, 2026-11-10: "challenge pictures must never be attached to a passage
 * or moment"): where an image is labelled by its chapter, it is labelled this way instead, and links to its own
 * challenge page. DRAFT wording, drafted by the coding agent (Claude, a closed model by Anthropic).
 */
export const NO_PASSAGE = {
  label: 'Remix challenge',
  title: 'An image for the Snowmoon remix challenge',
  what: 'An image for the remix challenge, made by a reader, not canon.',
  page: (versionId: string) => `/challenge/p/${versionId}`,
} as const;

/** "Chapter 4" or, with no passage, "Remix challenge". */
export const chapterLabel = (chapter: number | null) => (chapter === null ? NO_PASSAGE.label : `Chapter ${chapter}`);

/** An image with its passage (every reader's image but a remix challenge picture), for the lists organised by passage. */
export type Anchored<T extends { chapter: number | null; start: number | null; end: number | null }> = T & { chapter: number; start: number; end: number };
export const hasPassage = <T extends { chapter: number | null; start: number | null; end: number | null }>(im: T): im is Anchored<T> => im.chapter !== null && im.start !== null && im.end !== null;
