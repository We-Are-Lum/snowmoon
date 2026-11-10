import { CARDS } from './cards';
import { readerHref } from './moments';

/**
 * Where a challenge character first appears in the book (owner, 2026-11-09): its card's first "appears" block, the
 * same block a challenge picture is anchored to (make.ts characterAnchor). The character page links there, in the
 * reader, with "Read where {Name} first appears" (the owner's words); the reader keeps its own chapter gating.
 */
export const firstAppearsBlock = (slug: string): string => CARDS.find((c) => c.slug === slug)?.appears[0]?.block ?? 'c1-b1';
export const firstAppearsHref = (slug: string): string => readerHref(firstAppearsBlock(slug));
export const firstAppearsWords = (name: string): string => `Read where ${name} first appears`;
